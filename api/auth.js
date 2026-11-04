const crypto = require('crypto');
const { promisify } = require('util');
const admin = require('firebase-admin');

const scrypt = promisify(crypto.scrypt);
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://feltora-spots-default-rtdb.firebaseio.com';
const RATE_WINDOW_MS = 15 * 60 * 1000;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getServices() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');

  const existing = admin.apps.find((app) => app.name === 'feltora-auth');
  const app = existing || admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
    databaseURL: DATABASE_URL
  }, 'feltora-auth');

  return { auth: admin.auth(app), database: admin.database(app) };
}

function parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { throw httpError(400, 'Invalid request body.'); }
  }
  return body && typeof body === 'object' ? body : {};
}

function validateCredentials(body) {
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';

  if (!/^[a-z0-9_]{3,18}$/.test(username)) {
    throw httpError(400, 'Username must be 3–18 characters using letters, numbers, or underscores.');
  }
  if (!/^\d{4}$/.test(pin)) throw httpError(400, 'PIN must be exactly 4 digits.');
  return { username, pin };
}

function uidForUsername(username) {
  return crypto.createHash('sha256').update('feltora:' + username).digest('hex');
}

function getClientIp(req) {
  const forwarded = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || 'unknown')
    .split(',')[0].trim();
}

function rateLimitKey(scope) {
  return crypto.createHash('sha256').update(scope).digest('hex');
}

async function assertNotRateLimited(database, key) {
  const snapshot = await database.ref('/authRateLimits/' + key).once('value');
  const entry = snapshot.val();
  if (entry && entry.blockedUntil > Date.now()) {
    throw httpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
  }
}

async function recordFailedAttempt(database, key, maxAttempts) {
  const now = Date.now();
  await database.ref('/authRateLimits/' + key).transaction((entry) => {
    if (!entry || now - entry.windowStartedAt >= RATE_WINDOW_MS) {
      return { windowStartedAt: now, attempts: 1, blockedUntil: 0 };
    }

    const attempts = entry.attempts + 1;
    return {
      windowStartedAt: entry.windowStartedAt,
      attempts,
      blockedUntil: attempts >= maxAttempts ? now + RATE_WINDOW_MS : entry.blockedUntil
    };
  });
}

function resetRateLimit(database, keys) {
  return Promise.all(keys.map((key) => database.ref('/authRateLimits/' + key).remove()));
}

async function hashPin(pin, salt) {
  const derived = await scrypt(pin, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return derived.toString('hex');
}

function publicProfile(username, input) {
  const source = input && typeof input === 'object' ? input : {};
  const displayName = typeof source.displayName === 'string'
    ? source.displayName.trim().replace(/[<>]/g, '').slice(0, 24)
    : '';

  return {
    username,
    displayName: displayName || username,
    avatar: /^[a-z0-9_-]{1,24}$/.test(source.avatar || '') ? source.avatar : 'marlow',
    cue: /^[a-z0-9_-]{1,24}$/.test(source.cue || '') ? source.cue : 'wood',
    felt: /^[a-z0-9_-]{1,24}$/.test(source.felt || '') ? source.felt : 'green',
    title: typeof source.title === 'string' ? source.title.slice(0, 32) : 'The Hustler',
    vibe: /^[a-z0-9_-]{1,24}$/.test(source.vibe || '') ? source.vibe : 'aggressive',
    createdAt: Date.now(),
    stats: { wins: 0, losses: 0, frames: 0 }
  };
}

async function register(auth, database, username, pin, profileInput, req) {
  const uid = uidForUsername(username);
  const ipKey = rateLimitKey('register:' + getClientIp(req));
  await assertNotRateLimited(database, ipKey);

  const reservation = await database.ref('/authUsernames/' + username)
    .transaction((current) => current === null ? uid : undefined);
  if (!reservation.committed) {
    await recordFailedAttempt(database, ipKey, 10);
    throw httpError(409, 'That username is unavailable.');
  }

  let userCreated = false;
  try {
    await auth.createUser({ uid, displayName: username });
    userCreated = true;
    const salt = crypto.randomBytes(16).toString('hex');
    const pinHash = await hashPin(pin, Buffer.from(salt, 'hex'));
    const profile = publicProfile(username, profileInput);

    await Promise.all([
      database.ref('/authCredentials/' + uid).set({ salt, pinHash }),
      database.ref('/profiles/' + uid).set(profile)
    ]);

    const customToken = await auth.createCustomToken(uid, { username });
    return { customToken, uid, username, profile };
  } catch (error) {
    await Promise.allSettled([
      database.ref('/authUsernames/' + username).transaction((current) => current === uid ? null : undefined),
      database.ref('/authCredentials/' + uid).remove(),
      database.ref('/profiles/' + uid).remove(),
      userCreated ? auth.deleteUser(uid) : Promise.resolve()
    ]);
    throw error;
  }
}

async function login(auth, database, username, pin, req) {
  const uidKey = rateLimitKey('login:user:' + username + ':' + getClientIp(req));
  const ipKey = rateLimitKey('login:ip:' + getClientIp(req));
  const globalUserKey = rateLimitKey('login:user:' + username);
  await Promise.all([
    assertNotRateLimited(database, uidKey),
    assertNotRateLimited(database, ipKey),
    assertNotRateLimited(database, globalUserKey)
  ]);

  const usernameSnapshot = await database.ref('/authUsernames/' + username).once('value');
  const uid = usernameSnapshot.val();
  const [credentialSnapshot, profileSnapshot] = uid
    ? await Promise.all([
      database.ref('/authCredentials/' + uid).once('value'),
      database.ref('/profiles/' + uid).once('value')
    ])
    : [null, null];
  const credential = credentialSnapshot && credentialSnapshot.val();

  if (!uid || !credential) {
    await Promise.all([
      recordFailedAttempt(database, uidKey, 5),
      recordFailedAttempt(database, ipKey, 30),
      recordFailedAttempt(database, globalUserKey, 5)
    ]);
    throw httpError(401, 'Invalid username or PIN.');
  }

  const candidate = Buffer.from(await hashPin(pin, Buffer.from(credential.salt, 'hex')), 'hex');
  const stored = Buffer.from(credential.pinHash, 'hex');
  if (candidate.length !== stored.length || !crypto.timingSafeEqual(candidate, stored)) {
    await Promise.all([
      recordFailedAttempt(database, uidKey, 5),
      recordFailedAttempt(database, ipKey, 30),
      recordFailedAttempt(database, globalUserKey, 5)
    ]);
    throw httpError(401, 'Invalid username or PIN.');
  }

  await resetRateLimit(database, [uidKey, ipKey, globalUserKey]);
  const customToken = await auth.createCustomToken(uid, { username });
  return { customToken, uid, username, profile: profileSnapshot.val() };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  let body;
  try {
    body = parseBody(req.body);
    const { username, pin } = validateCredentials(body);
    const { auth, database } = getServices();

    if (body.action === 'register') {
      const result = await register(auth, database, username, pin, body.profile, req);
      return res.status(201).json(result);
    }
    if (body.action === 'login') {
      const result = await login(auth, database, username, pin, req);
      return res.status(200).json(result);
    }
    return res.status(400).json({ error: 'Unsupported authentication action.' });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error('Authentication service failed:', error);
    return res.status(status).json({
      error: status === 500 ? 'Authentication service is unavailable.' : error.message
    });
  }
};
