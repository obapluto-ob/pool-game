// Vercel Serverless Function — /api/paystack-webhook
// Receives Paystack webhook events, verifies signature, logs to Firebase
// Secret key lives ONLY here in env vars — never in frontend code

const crypto = require('crypto');

// Firebase Realtime DB REST write (no SDK needed)
async function firebaseWrite(path, data) {
  const FB_BASE = 'https://feltora-spots-default-rtdb.firebaseio.com';
  const FB_KEY  = process.env.FIREBASE_API_KEY; // set in Vercel env vars
  const url = `${FB_BASE}${path}.json${FB_KEY ? '?auth=' + FB_KEY : ''}`;
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

async function firebasePush(path, data) {
  const FB_BASE = 'https://feltora-spots-default-rtdb.firebaseio.com';
  const FB_KEY  = process.env.FIREBASE_API_KEY;
  const url = `${FB_BASE}${path}.json${FB_KEY ? '?auth=' + FB_KEY : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
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
    // If secret not set yet, still log but warn
    console.warn('PAYSTACK_SECRET_KEY not set — skipping signature verification');
  } else {
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    const paystackSig = req.headers['x-paystack-signature'];
    if (hash !== paystackSig) {
      console.error('Invalid Paystack signature — possible spoofed request');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  // ── 2. Parse event ───────────────────────────────────────────────
  const event = req.body;
  const eventType = event.event;
  const data = event.data || {};

  console.log('Paystack webhook received:', eventType, data.reference || '');

  // ── 3. Handle charge.success (tip received) ──────────────────────
  if (eventType === 'charge.success') {
    const tipRecord = {
      reference:  data.reference,
      amount:     data.amount,       // in kobo/cents
      currency:   data.currency,
      email:      data.customer ? data.customer.email : 'unknown',
      channel:    data.channel,      // card / mobile_money / bank
      status:     data.status,
      paidAt:     data.paid_at || new Date().toISOString(),
      ts:         Date.now()
    };

    // Log to Firebase under /tips/{reference}
    try {
      await firebaseWrite('/tips/' + data.reference, tipRecord);
      console.log('Tip logged to Firebase:', data.reference);
    } catch(e) {
      console.error('Firebase write failed:', e.message);
    }

    // Send email notification to you
    await sendEmailNotification('charge.success', data);
  }

  // ── 4. Handle transfer.success (payout to your bank) ────────────
  if (eventType === 'transfer.success') {
    try {
      await firebasePush('/payouts', {
        reference: data.reference,
        amount:    data.amount,
        currency:  data.currency,
        status:    data.status,
        ts:        Date.now()
      });
    } catch(e) {}
    await sendEmailNotification('transfer.success', data);
  }

  // ── 5. Handle charge.failed ──────────────────────────────────────
  if (eventType === 'charge.failed') {
    try {
      await firebasePush('/failed-charges', {
        reference: data.reference,
        amount:    data.amount,
        email:     data.customer ? data.customer.email : 'unknown',
        reason:    data.gateway_response || 'unknown',
        ts:        Date.now()
      });
    } catch(e) {}
  }

  // Always return 200 to Paystack — if you return anything else
  // Paystack will keep retrying the webhook for 72 hours
  return res.status(200).json({ received: true });
};
