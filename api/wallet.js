const crypto = require('crypto');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

const DEFAULT_DATABASE_URL = 'https://feltora-spots-default-rtdb.firebaseio.com';
const CREDIT_RATE = 10;
const MIN_TOP_UP_KES = 100;
const MAX_TOP_UP_KES = 100000;
const MAX_TRANSFER_CREDITS = 1000000;
const CATEGORIES = ['cues', 'felts', 'balls', 'mascots', 'titles'];
const STORE_PRICES = Object.freeze({
  neon: { category: 'cues', credits: 800, name: 'Neon' },
  obsidian: { category: 'cues', credits: 1200, name: 'Obsidian' },
  bamboo: { category: 'cues', credits: 600, name: 'Bamboo' },
  midnight: { category: 'felts', credits: 700, name: 'Midnight' },
  crimson: { category: 'felts', credits: 900, name: 'Crimson' },
  'gold-balls': { category: 'balls', credits: 1000, name: 'Gold balls' },
  'marble-balls': { category: 'balls', credits: 1500, name: 'Marble balls' },
  zara: { category: 'mascots', credits: 500, name: 'Zara' },
  knox: { category: 'mascots', credits: 500, name: 'Knox' },
  grinder: { category: 'titles', credits: 300, name: 'The Grinder' },
  'night-owl': { category: 'titles', credits: 400, name: 'Night Owl' }
});

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { throw httpError(400, 'Invalid request body.'); }
  }
  return body && typeof body === 'object' ? body : {};
}

function normalizeDatabaseUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.origin.toLowerCase() + url.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function getServices() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw httpError(503, 'Wallet service is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON in Vercel.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw httpError(503, 'Wallet service has invalid Firebase credentials. Check FIREBASE_SERVICE_ACCOUNT_JSON.');
  }
  if (!serviceAccount || typeof serviceAccount.project_id !== 'string'
      || typeof serviceAccount.client_email !== 'string'
      || typeof serviceAccount.private_key !== 'string') {
    throw httpError(503, 'Wallet service has incomplete Firebase credentials.');
  }

  let webConfig = {};
  if (process.env.FIREBASE_WEB_CONFIG) {
    try {
      webConfig = JSON.parse(process.env.FIREBASE_WEB_CONFIG);
    } catch {
      throw httpError(503, 'Wallet service has invalid FIREBASE_WEB_CONFIG.');
    }
    if (webConfig.projectId && webConfig.projectId !== serviceAccount.project_id) {
      throw httpError(503, 'Firebase web and server configurations use different projects.');
    }
    if (webConfig.databaseURL) {
      const webDatabaseUrl = normalizeDatabaseUrl(webConfig.databaseURL);
      const serverDatabaseUrl = normalizeDatabaseUrl(process.env.FIREBASE_DATABASE_URL || webConfig.databaseURL);
      if (!webDatabaseUrl || !serverDatabaseUrl || webDatabaseUrl !== serverDatabaseUrl) {
        throw httpError(503, 'Firebase web and server configurations use different Realtime Databases.');
      }
    }
  }
  const databaseURL = (process.env.FIREBASE_DATABASE_URL || webConfig.databaseURL || DEFAULT_DATABASE_URL).trim();
  if (!normalizeDatabaseUrl(databaseURL)) {
    throw httpError(503, 'Wallet service has an invalid FIREBASE_DATABASE_URL.');
  }
  const name = 'feltora-wallet';
  const app = getApps().find((item) => item.name === name) || initializeApp({
    credential: cert(serviceAccount),
    databaseURL
  }, name);
  return { auth: getAuth(app), database: getDatabase(app) };
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : '';
}

async function getIdentity(req, auth, database) {
  const token = bearerToken(req);
  if (!token) throw httpError(401, 'Sign in to use the FELTORA wallet.');

  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    throw httpError(401, 'Your sign-in expired. Sign in again to use the wallet.');
  }
  const profileSnapshot = await database.ref('/profiles/' + decoded.uid).once('value');
  const profile = profileSnapshot.val();
  if (!profile || typeof profile.username !== 'string'
      || !/^[a-z0-9_]{3,18}$/.test(profile.username)) {
    throw httpError(403, 'Create a FELTORA player profile before using the wallet.');
  }
  return { uid: decoded.uid, username: profile.username, profile };
}

function normalizeWallet(value) {
  const wallet = value && typeof value === 'object' ? value : {};
  const inventory = wallet.inventory && typeof wallet.inventory === 'object' ? wallet.inventory : {};
  const transactions = wallet.transactions && typeof wallet.transactions === 'object' ? wallet.transactions : {};
  const cleanInventory = {};
  CATEGORIES.forEach((category) => {
    cleanInventory[category] = Array.isArray(inventory[category])
      ? Array.from(new Set(inventory[category].filter((id) => typeof id === 'string')))
      : [];
  });
  return {
    balance: Number.isSafeInteger(wallet.balance) && wallet.balance >= 0 ? wallet.balance : 0,
    inventory: cleanInventory,
    transactions
  };
}

async function readWallet(database, uid) {
  const snapshot = await database.ref('/wallets/' + uid).once('value');
  const wallet = normalizeWallet(snapshot.val());
  const transactions = Object.values(wallet.transactions)
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    .slice(0, 50);
  return { balance: wallet.balance, inventory: wallet.inventory, transactions };
}

async function paystackRequest(path, body) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw httpError(503, 'Payments are not configured. Set PAYSTACK_SECRET_KEY in Vercel.');
  let response;
  try {
    response = await fetch('https://api.paystack.co' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + secret,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    console.error('Paystack request failed:', error);
    throw httpError(502, 'Paystack could not be reached. Please try again.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.status) {
    console.error('Paystack API rejected a wallet request:', response.status, result.message || '');
    throw httpError(502, result.message || 'Paystack could not process this request.');
  }
  return result.data;
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function callbackUrl(value, req, params) {
  if (typeof value !== 'string') throw httpError(400, 'The checkout return address is invalid.');
  let url;
  try { url = new URL(value); } catch { throw httpError(400, 'The checkout return address is invalid.'); }
  const origin = req.headers.origin;
  if (!origin || url.origin !== origin || !['https:', 'http:'].includes(url.protocol)
      || (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw httpError(400, 'The checkout return address must be this FELTORA site.');
  }
  url.search = new URLSearchParams(params || { wallet: 'return' }).toString();
  url.hash = '';
  return url.toString();
}

async function initializeTip(req, database, identity, body) {
  const cfg = TIP_CURRENCIES[body.currency] || TIP_CURRENCIES['KES'];
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < cfg.min) {
    throw httpError(400, 'Invalid tip amount.');
  }
  if (!validEmail(body.email)) throw httpError(400, 'Enter a valid email address for your payment receipt.');
  const url = callbackUrl(body.callbackUrl, req, { tip: 'return' });
  const reference = 'feltora_tip_' + crypto.randomUUID();
  const checkout = await paystackRequest('/transaction/initialize', {
    email: body.email.trim(),
    amount: Math.round(amount * 100),
    currency: cfg.currency,
    reference,
    callback_url: url,
    metadata: {
      paymentKind: 'tip',
      uid: identity.uid,
      username: identity.username
    }
  });
  if (!checkout.authorization_url) throw httpError(502, 'Paystack did not return a checkout link.');
  return { authorizationUrl: checkout.authorization_url, reference };
}

const TIP_CURRENCIES = {
  KES: { currency: 'KES', min: 10 },
  NGN: { currency: 'NGN', min: 100 },
  GHS: { currency: 'GHS', min: 1 },
  ZAR: { currency: 'ZAR', min: 5 },
  USD: { currency: 'USD', min: 1 },
  GBP: { currency: 'GBP', min: 1 },
  EUR: { currency: 'EUR', min: 1 }
};

async function initializeTopUp(req, database, identity, body) {
  const amountKes = Number(body.amountKes);
  if (!Number.isSafeInteger(amountKes) || amountKes < MIN_TOP_UP_KES || amountKes > MAX_TOP_UP_KES) {
    throw httpError(400, 'Top-ups must be between KSh 100 and KSh 100,000.');
  }
  if (!validEmail(body.email)) throw httpError(400, 'Enter a valid email address for your payment receipt.');
  const url = callbackUrl(body.callbackUrl, req);
  const reference = 'feltora_' + crypto.randomUUID();
  const credits = amountKes * CREDIT_RATE;
  const intent = {
    uid: identity.uid,
    username: identity.username,
    reference,
    amountKes,
    amountKobo: amountKes * 100,
    credits,
    currency: 'KES',
    status: 'pending',
    createdAt: Date.now()
  };
  const intentRef = database.ref('/walletPaymentIntents/' + reference);
  await intentRef.set(intent);

  try {
    const checkout = await paystackRequest('/transaction/initialize', {
      email: body.email.trim(),
      amount: intent.amountKobo,
      currency: 'KES',
      reference,
      callback_url: url,
      channels: ['card', 'mobile_money', 'bank'],
      metadata: {
        paymentKind: 'wallet_topup',
        uid: identity.uid,
        username: identity.username,
        amountKes,
        credits
      }
    });
    if (!checkout.authorization_url) throw httpError(502, 'Paystack did not return a checkout link.');
    await intentRef.update({ accessCode: checkout.access_code || null });
    return { authorizationUrl: checkout.authorization_url, reference, credits };
  } catch (error) {
    await intentRef.update({ status: 'initialization_failed', failedAt: Date.now() });
    throw error;
  }
}

async function verifyPayment(reference) {
  if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(reference)) {
    throw httpError(400, 'The payment reference is invalid.');
  }
  return paystackRequest('/transaction/verify/' + encodeURIComponent(reference));
}

async function creditWalletTopUp(database, uid, intent, payment) {
  const reference = intent && intent.reference;
  if (!intent || intent.uid !== uid || typeof reference !== 'string'
      || !/^[A-Za-z0-9_-]{1,128}$/.test(reference)) {
    throw httpError(409, 'The wallet top-up intent is invalid.');
  }
  const metadata = payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
  if (payment.status !== 'success') throw httpError(409, 'Paystack has not confirmed this payment yet.');
  if (payment.reference !== reference || payment.currency !== 'KES'
      || Number(payment.amount) !== intent.amountKobo
      || metadata.paymentKind !== 'wallet_topup'
      || metadata.uid !== uid
      || Number(metadata.amountKes) !== intent.amountKes
      || Number(metadata.credits) !== intent.credits
      || intent.credits !== intent.amountKes * CREDIT_RATE) {
    throw httpError(409, 'The verified payment does not match this wallet top-up.');
  }

  const intentRef = database.ref('/walletPaymentIntents/' + reference);
  const walletRef = database.ref('/wallets/' + uid);
  const currentWallet = normalizeWallet((await walletRef.once('value')).val());
  if (currentWallet.transactions[reference]) {
    await intentRef.update({ status: 'credited', creditedAt: intent.creditedAt || Date.now() });
    return readWallet(database, uid);
  }

  const transaction = {
    reference,
    type: 'top_up',
    direction: 'in',
    amount: intent.credits,
    amountKes: intent.amountKes,
    currency: 'KES',
    status: 'completed',
    createdAt: payment.paid_at ? Date.parse(payment.paid_at) || Date.now() : Date.now()
  };
  const result = await walletRef.transaction((current) => {
    const wallet = normalizeWallet(current);
    if (wallet.transactions[reference]) return;
    wallet.balance += intent.credits;
    wallet.transactions[reference] = transaction;
    return wallet;
  });
  const updatedWallet = normalizeWallet(result.snapshot.val());
  if (!result.committed && !updatedWallet.transactions[reference]) {
    throw httpError(503, 'Your payment was verified but the wallet could not be updated yet. Refresh your wallet to retry.');
  }
  await intentRef.update({ status: 'credited', creditedAt: Date.now() });
  return readWallet(database, uid);
}

async function verifyTopUp(database, identity, body) {
  const reference = body.reference;
  if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(reference)) {
    throw httpError(400, 'The payment reference is invalid.');
  }
  const intent = (await database.ref('/walletPaymentIntents/' + reference).once('value')).val();
  if (!intent || intent.uid !== identity.uid) {
    throw httpError(404, 'This wallet top-up could not be found for your account.');
  }
  const wallet = normalizeWallet((await database.ref('/wallets/' + identity.uid).once('value')).val());
  if (wallet.transactions[reference]) {
    await database.ref('/walletPaymentIntents/' + reference).update({
      status: 'credited',
      creditedAt: intent.creditedAt || Date.now()
    });
    return readWallet(database, identity.uid);
  }
  const payment = await verifyPayment(reference);
  return creditWalletTopUp(database, identity.uid, intent, payment);
}

function operationReference(uid, requestId) {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
    throw httpError(400, 'This wallet action is missing a valid retry reference. Please try again.');
  }
  return crypto.createHash('sha256').update(uid + ':' + requestId).digest('hex');
}

async function purchaseItem(database, identity, body) {
  const itemId = typeof body.itemId === 'string' ? body.itemId : '';
  const item = STORE_PRICES[itemId];
  if (!item || body.category !== item.category) throw httpError(400, 'This store item cannot be purchased with wallet credits.');
  const reference = operationReference(identity.uid, body.requestId);
  const existing = identity.profile.unlocks && identity.profile.unlocks[item.category];
  if (Array.isArray(existing) && existing.includes(itemId)) {
    return Object.assign({ alreadyOwned: true }, await readWallet(database, identity.uid));
  }

  const walletRef = database.ref('/wallets/' + identity.uid);
  const result = await walletRef.transaction((current) => {
    const wallet = normalizeWallet(current);
    if (wallet.transactions[reference] || wallet.inventory[item.category].includes(itemId)) return;
    if (wallet.balance < item.credits) return;
    wallet.balance -= item.credits;
    wallet.inventory[item.category].push(itemId);
    wallet.transactions[reference] = {
      reference,
      type: 'store_purchase',
      direction: 'out',
      itemId,
      itemName: item.name,
      amount: item.credits,
      status: 'completed',
      createdAt: Date.now()
    };
    return wallet;
  });
  const wallet = normalizeWallet(result.snapshot.val());
  if (!result.committed && !wallet.inventory[item.category].includes(itemId)) {
    if (wallet.balance < item.credits) throw httpError(409, 'Not enough wallet credits for this item.');
    throw httpError(409, 'This item could not be purchased. Refresh the store and try again.');
  }
  return readWallet(database, identity.uid);
}

async function resolveRecipient(database, username) {
  const normalized = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!/^[a-z0-9_]{3,18}$/.test(normalized)) {
    throw httpError(400, 'Enter a valid FELTORA username.');
  }
  const reservation = await database.ref('/authUsernames/' + normalized).once('value');
  const user = reservation.val();
  const uid = user && typeof user === 'object' ? user.uid : user;
  if (typeof uid !== 'string' || !uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw httpError(404, 'No player with that username was found.');
  }
  const profile = (await database.ref('/profiles/' + uid).once('value')).val();
  if (!profile || profile.username !== normalized) {
    throw httpError(404, 'No player with that username was found.');
  }
  return { uid, username: normalized };
}

async function applyTransferLeg(database, uid, reference, amount, entry) {
  const walletRef = database.ref('/wallets/' + uid);
  const result = await walletRef.transaction((current) => {
    const wallet = normalizeWallet(current);
    if (wallet.transactions[reference]) return;
    if (entry.direction === 'out' && wallet.balance < amount) return;
    wallet.balance += entry.direction === 'in' ? amount : -amount;
    wallet.transactions[reference] = Object.assign({}, entry, { reference, amount, status: 'pending' });
    return wallet;
  });
  const wallet = normalizeWallet(result.snapshot.val());
  if (!result.committed && !wallet.transactions[reference]) {
    if (entry.direction === 'out' && wallet.balance < amount) {
      throw httpError(409, 'Not enough wallet credits to send that amount.');
    }
    throw httpError(503, 'The transfer could not be saved yet. Refresh your wallet to retry safely.');
  }
}

async function processTransfer(database, transfer) {
  if (!transfer || transfer.status === 'failed') throw httpError(409, 'This wallet transfer could not be completed.');
  if (transfer.status === 'completed') return;

  await applyTransferLeg(database, transfer.fromUid, transfer.reference, transfer.amount, {
    type: 'transfer_out',
    direction: 'out',
    toUsername: transfer.toUsername,
    clientRequestId: transfer.requestId,
    createdAt: transfer.createdAt
  });
  await applyTransferLeg(database, transfer.toUid, transfer.reference, transfer.amount, {
    type: 'transfer_in',
    direction: 'in',
    fromUsername: transfer.fromUsername,
    createdAt: transfer.createdAt
  });

  const completedAt = Date.now();
  await Promise.all([
    database.ref('/wallets/' + transfer.fromUid + '/transactions/' + transfer.reference + '/status').set('completed'),
    database.ref('/wallets/' + transfer.toUid + '/transactions/' + transfer.reference + '/status').set('completed')
  ]);
  await database.ref('/walletTransfers/' + transfer.reference).update({ status: 'completed', completedAt });
}

async function sendCredits(database, identity, body) {
  const amount = Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_TRANSFER_CREDITS) {
    throw httpError(400, 'Send between 1 and 1,000,000 credits at a time.');
  }
  const recipient = await resolveRecipient(database, body.toUsername);
  if (recipient.uid === identity.uid) throw httpError(400, 'You cannot send credits to your own account.');
  const reference = operationReference(identity.uid, body.requestId);
  const transferRef = database.ref('/walletTransfers/' + reference);
  const transfer = {
    reference,
    fromUid: identity.uid,
    fromUsername: identity.username,
    toUid: recipient.uid,
    toUsername: recipient.username,
    amount,
    requestId: body.requestId,
    status: 'pending',
    createdAt: Date.now()
  };
  const claim = await transferRef.transaction((current) => current || transfer);
  const saved = claim.snapshot.val();
  if (!saved || saved.fromUid !== identity.uid || saved.toUid !== recipient.uid || saved.amount !== amount) {
    throw httpError(409, 'This transfer reference was already used for a different request.');
  }
  try {
    await processTransfer(database, saved);
  } catch (error) {
    if (error.status === 409) {
      await transferRef.update({ status: 'failed', failedAt: Date.now() });
    }
    throw error;
  }
  return readWallet(database, identity.uid);
}

async function resumePendingTransfers(database, uid) {
  const snapshot = await database.ref('/wallets/' + uid + '/transactions').once('value');
  const transactions = snapshot.val() || {};
  const pending = Object.values(transactions).filter((entry) =>
    entry && entry.type === 'transfer_out' && entry.status === 'pending'
  );
  for (const entry of pending) {
    const transfer = (await database.ref('/walletTransfers/' + entry.reference).once('value')).val();
    if (transfer) await processTransfer(database, transfer);
  }
}

async function verifyTip(req, auth, body) {
  const payment = await verifyPayment(body.reference);
  if (payment.reference !== body.reference) throw httpError(409, 'Paystack returned a different payment reference.');
  if (payment.status !== 'success') throw httpError(409, 'Paystack has not confirmed this tip yet.');
  const metadata = payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
  if (metadata.paymentKind && metadata.paymentKind !== 'tip') {
    throw httpError(400, 'This payment is not a developer tip.');
  }
  const token = bearerToken(req);
  if (token) {
    let decoded;
    try { decoded = await auth.verifyIdToken(token); } catch { throw httpError(401, 'Your sign-in expired.'); }
    if (metadata.uid && metadata.uid !== decoded.uid) throw httpError(403, 'This tip belongs to a different account.');
  }
  return { verified: true, reference: payment.reference };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const body = parseBody(req.body);
    const { auth, database } = getServices();
    if (body.action === 'verify-tip') {
      return res.status(200).json(await verifyTip(req, auth, body));
    }

    const identity = await getIdentity(req, auth, database);
    if (body.action === 'lookup-player') {
      const player = await resolveRecipient(database, body.username);
      if (player.uid === identity.uid) {
        throw httpError(400, 'You are already in your contacts.');
      }
      return res.status(200).json({ username: player.username, uid: player.uid });
    }
    if (body.action === 'initialize-tip') {
      return res.status(200).json(await initializeTip(req, database, identity, body));
    }
    if (body.action === 'initialize-top-up') {
      return res.status(200).json(await initializeTopUp(req, database, identity, body));
    }
    if (body.action === 'verify-top-up') {
      return res.status(200).json(await verifyTopUp(database, identity, body));
    }
    if (body.action === 'purchase') {
      return res.status(200).json(await purchaseItem(database, identity, body));
    }
    if (body.action === 'transfer') {
      return res.status(200).json(await sendCredits(database, identity, body));
    }
    if (body.action === 'get') {
      await resumePendingTransfers(database, identity.uid);
      return res.status(200).json(await readWallet(database, identity.uid));
    }
    return res.status(400).json({ error: 'Unsupported wallet action.' });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error('Wallet service failed:', error);
    return res.status(status).json({
      error: status === 500 ? 'Wallet service is unavailable. Please try again.' : error.message
    });
  }
};

module.exports.policy = Object.freeze({
  CREDIT_RATE,
  MIN_TOP_UP_KES,
  MAX_TOP_UP_KES,
  MAX_TRANSFER_CREDITS,
  STORE_PRICES
});
module.exports.creditWalletTopUp = creditWalletTopUp;
