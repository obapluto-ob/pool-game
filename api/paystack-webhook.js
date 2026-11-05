// Vercel Serverless Function — /api/paystack-webhook
// Receives Paystack webhook events, verifies signature, logs to Firebase
// Secret key lives ONLY here in env vars — never in frontend code

const crypto = require('crypto');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { creditWalletTopUp } = require('./wallet');

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://feltora-spots-default-rtdb.firebaseio.com';
const TIP_UNLOCKS = {
  1: { cues: ['phantom'], felts: ['obsidian-felt'], balls: [], mascots: [], titles: ['supporter'] },
  2: { cues: ['inferno'], felts: [], balls: ['chrome-balls'], mascots: ['lena'], titles: ['flame-title'] },
  3: { cues: ['ghost'], felts: ['galaxy'], balls: [], mascots: ['dex'], titles: ['ghost-title'] },
  4: { cues: ['legend-cue'], felts: [], balls: [], mascots: [], titles: ['feltora-legend'] }
};

function getServices() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
  const app = getApps().find((item) => item.name === 'feltora-paystack-webhook') || initializeApp({
    credential: cert(JSON.parse(json)),
    databaseURL: DATABASE_URL
  }, 'feltora-paystack-webhook');
  return { auth: getAuth(app), database: getDatabase(app) };
}

function parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { throw new Error('Invalid Paystack event body.'); }
  }
  return body && typeof body === 'object' ? body : {};
}

function tierForTip(amount, currency) {
  const exact = {
    KES: [50, 150, 300, 500],
    USD: [0.5, 1.5, 3, 5]
  };
  const rates = { NGN: 0.00065, GHS: 0.068, ZAR: 0.054, TZS: 0.00038, UGX: 0.00027, GBP: 1.27, EUR: 1.09 };
  const thresholds = exact[currency] || [0.5, 1.5, 3, 5].map((usd) => Math.ceil(usd / (rates[currency] || 1)));
  let tier = 0;
  thresholds.forEach((threshold, index) => {
    if (amount >= threshold) tier = index + 1;
  });
  return tier;
}

function appendTipUnlocks(current, tier) {
  const unlocks = current && typeof current === 'object' ? Object.assign({}, current) : {};
  ['cues', 'felts', 'balls', 'mascots', 'titles'].forEach((category) => {
    unlocks[category] = Array.isArray(unlocks[category]) ? unlocks[category].slice() : [];
  });
  for (let level = 1; level <= tier; level++) {
    Object.keys(TIP_UNLOCKS[level]).forEach((category) => {
      TIP_UNLOCKS[level][category].forEach((item) => {
        if (!unlocks[category].includes(item)) unlocks[category].push(item);
      });
    });
  }
  unlocks.tipTier = Math.max(Number(unlocks.tipTier) || 0, tier);
  return unlocks;
}

async function grantSupporter(database, auth, uid, tier, reference) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Paystack metadata contains an invalid user ID.');
  await auth.getUser(uid);
  const now = Date.now();
  const supporterRef = database.ref('/supporters/' + uid);
  const supporterSnapshot = await supporterRef.once('value');
  const previous = supporterSnapshot.val() || {};
  const combinedTier = Math.max(Number(previous.tier) || 0, tier);
  const isPermanent = combinedTier >= 3 || previous.expiresAt === null;
  const expiresAt = isPermanent
    ? null
    : Math.max(Number(previous.expiresAt) || 0, now + 30 * 86400000);
  const supporter = {
    tier: combinedTier,
    unlockedAt: previous.unlockedAt || now,
    expiresAt: expiresAt,
    lastTipAt: now,
    lastReference: reference
  };

  const profileUpdate = await database.ref('/profiles/' + uid).transaction((profile) => {
    if (!profile || typeof profile !== 'object') return;
    return Object.assign({}, profile, {
      supporter: supporter,
      supporterTier: combinedTier,
      unlocks: appendTipUnlocks(profile.unlocks, combinedTier)
    });
  });
  if (!profileUpdate.committed || !profileUpdate.snapshot.exists()) {
    throw new Error('The payment user does not have a FELTORA profile.');
  }
  await supporterRef.set(supporter);
}

// Send email notification via a simple fetch to a free email API
// Uses EmailJS REST API — set EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY in Vercel
async function sendEmailNotification(event, data) {
  const serviceId  = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey  = process.env.EMAILJS_PUBLIC_KEY;
  if (!serviceId || !templateId || !publicKey) return; // skip if not configured

  await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:  serviceId,
      template_id: templateId,
      user_id:     publicKey,
      template_params: {
        event:     event,
        amount:    data.amount ? (data.amount / 100).toLocaleString() : '—',
        currency:  data.currency || 'KES',
        email:     data.customer ? data.customer.email : '—',
        reference: data.reference || '—',
        time:      new Date().toISOString()
      }
    })
  }).catch(function() {}); // never crash the webhook on email failure
}

module.exports = async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Verify Paystack signature ─────────────────────────────────
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('PAYSTACK_SECRET_KEY is not configured; refusing unverified webhook.');
    return res.status(503).json({ error: 'Payment webhook is not configured.' });
  }
  const rawBody = req.rawBody || Buffer.from(
    typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
  );
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const signature = req.headers['x-paystack-signature'];
  const expected = Buffer.from(hash, 'hex');
  const received = typeof signature === 'string' && /^[a-f0-9]{128}$/i.test(signature)
    ? Buffer.from(signature, 'hex') : Buffer.alloc(0);
  if (received.length !== expected.length || !crypto.timingSafeEqual(expected, received)) {
    console.error('Invalid Paystack signature — possible spoofed request');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ── 2. Parse event ───────────────────────────────────────────────
  let event;
  try {
    event = parseBody(req.body);
    const data = event.data || {};
    const eventType = event.event;
    console.log('Paystack webhook received:', eventType, data.reference || '');
    const { auth, database } = getServices();

    if (eventType === 'charge.success' && data.status === 'success') {
      const reference = typeof data.reference === 'string' ? data.reference : '';
      if (!reference || !/^[A-Za-z0-9_-]{1,128}$/.test(reference)) {
        return res.status(400).json({ error: 'Invalid payment reference.' });
      }
      if (data.metadata && data.metadata.paymentKind === 'wallet_topup') {
        const intentRef = database.ref('/walletPaymentIntents/' + reference);
        const intent = (await intentRef.once('value')).val();
        if (!intent) {
          console.error('Signed wallet payment has no matching top-up intent:', reference);
          await database.ref('/walletPaymentEvents/' + reference).set({
            reference,
            status: 'unmatched',
            ts: Date.now()
          });
          return res.status(200).json({ received: true, walletTopUp: false });
        }
        await creditWalletTopUp(database, intent.uid, intent, data);
        await database.ref('/walletPaymentEvents/' + reference).set({
          reference,
          amount: Number(data.amount) || 0,
          currency: data.currency || '',
          status: 'credited',
          paidAt: data.paid_at || new Date().toISOString(),
          ts: Date.now()
        });
        await sendEmailNotification('charge.success', data);
        return res.status(200).json({ received: true, walletTopUp: true });
      }
      const claimRef = database.ref('/processedTipReferences/' + reference);
      const claim = await claimRef.transaction((current) => current ? undefined : {
        status: 'processing',
        claimedAt: Date.now()
      });
      if (!claim.committed) return res.status(200).json({ received: true, duplicate: true });

      try {
        const tipRecord = {
          reference,
          amount: Number(data.amount) || 0,
          currency: data.currency || '',
          email: data.customer ? data.customer.email : 'unknown',
          channel: data.channel || '',
          status: data.status,
          paidAt: data.paid_at || new Date().toISOString(),
          ts: Date.now()
        };
        await database.ref('/tips/' + reference).set(tipRecord);
        const amount = tipRecord.amount / 100;
        const tier = tierForTip(amount, String(data.currency || '').toUpperCase());
        const uid = data.metadata && typeof data.metadata.uid === 'string' ? data.metadata.uid : '';
        if (tier > 0 && uid) await grantSupporter(database, auth, uid, tier, reference);
        await claimRef.set({ status: 'processed', processedAt: Date.now(), tier: tier });
        await sendEmailNotification('charge.success', data);
      } catch (error) {
        await claimRef.remove();
        throw error;
      }
    } else if (eventType === 'transfer.success') {
      await database.ref('/payouts').push({
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        ts: Date.now()
      });
      await sendEmailNotification('transfer.success', data);
    } else if (eventType === 'charge.failed') {
      await database.ref('/failed-charges').push({
        reference: data.reference,
        amount: data.amount,
        email: data.customer ? data.customer.email : 'unknown',
        reason: data.gateway_response || 'unknown',
        ts: Date.now()
      });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Paystack webhook processing failed:', error);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
};
