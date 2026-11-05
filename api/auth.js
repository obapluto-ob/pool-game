const crypto = require('crypto');
const { promisify } = require('util');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

const scrypt = promisify(crypto.scrypt);
const DEFAULT_DATABASE_URL = 'https://feltora-spots-default-rtdb.firebaseio.com';
const RATE_WINDOW_MS = 15 * 60 * 1000;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
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
    throw httpError(503, 'Google account setup is not configured on the server. Set FIREBASE_SERVICE_ACCOUNT_JSON in Vercel.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw httpError(503, 'Google account setup has invalid server credentials. Check FIREBASE_SERVICE_ACCOUNT_JSON in Vercel.');
  }
  if (!serviceAccount || typeof serviceAccount !== 'object'
      || typeof serviceAccount.project_id !== 'string'
      || typeof serviceAccount.client_email !== 'string'
      || typeof serviceAccount.private_key !== 'string') {
    throw httpError(503, 'Google account setup has incomplete server credentials. Use the Firebase Admin service-account JSON in Vercel.');
  }

  const webConfigJson = process.env.FIREBASE_WEB_CONFIG;
  const configuredDatabaseUrl = typeof process.env.FIREBASE_DATABASE_URL === 'string'
    ? process.env.FIREBASE_DATABASE_URL.trim()
    : '';
  let webConfig;
  if (webConfigJson) {
    try {
      webConfig = JSON.parse(webConfigJson);
      if (webConfig.projectId && webConfig.projectId !== serviceAccount.project_id) {
        throw httpError(503, 'Firebase web and server configurations use different projects. Set both to the same Firebase project in Vercel.');
      }
      if (webConfig.databaseURL) {
        const webDatabaseUrl = normalizeDatabaseUrl(webConfig.databaseURL);
        const serverDatabaseUrl = normalizeDatabaseUrl(configuredDatabaseUrl || webConfig.databaseURL);
        if (!webDatabaseUrl || !serverDatabaseUrl) {
          throw httpError(503, 'Firebase Realtime Database URL is invalid. Check FIREBASE_DATABASE_URL and FIREBASE_WEB_CONFIG in Vercel.');
        }
        if (webDatabaseUrl !== serverDatabaseUrl) {
          throw httpError(503, 'Firebase web and server configurations use different Realtime Databases. Set FIREBASE_DATABASE_URL to the databaseURL in FIREBASE_WEB_CONFIG.');
        }
      }
    } catch (error) {
      if (Number.isInteger(error.status)) throw error;
      throw httpError(503, 'Firebase web configuration is invalid. Check FIREBASE_WEB_CONFIG in Vercel.');
    }
  }

  let databaseUrl = configuredDatabaseUrl || DEFAULT_DATABASE_URL;
  if (!configuredDatabaseUrl && webConfig && webConfig.databaseURL) {
    databaseUrl = webConfig.databaseURL.trim();
  }

  const existing = getApps().find((app) => app.name === 'feltora-auth');
  let app = existing;
  if (!app) {
    try {
      app = initializeApp({
        credential: cert(serviceAccount),
        databaseURL: databaseUrl
      }, 'feltora-auth');
    } catch {
      throw httpError(503, 'Firebase Admin credentials could not be initialized. Check the service-account key and FIREBASE_DATABASE_URL in Vercel.');
    }
  }

  return { auth: getAuth(app), database: getDatabase(app) };
}

function parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { throw httpError(400, 'Invalid request body.'); }
  }
  return body && typeof body === 'object' ? body : {};
}

function validateUsername(value) {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z0-9_]{3,18}$/.test(username)) {
    throw httpError(400, 'Username must be 3–18 characters using letters, numbers, or underscores.');
  }
  return username;
}

function validateCredentials(body) {
  const username = validateUsername(body.username);
  const pin = validatePin(body.pin);
  return { username, pin };
}

function validatePin(value) {
  const pin = typeof value === 'string' ? value : '';
  if (!/^\d{4}$/.test(pin)) throw httpError(400, 'PIN must be exactly 4 digits.');
  return pin;
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

function boundedCount(value, fallback, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(max, Math.floor(number))) : fallback;
}

function cosmeticIds(value, fallback) {
  return Array.isArray(value)
    ? value.filter((id) => typeof id === 'string' && /^[a-z0-9_-]{1,32}$/.test(id)).slice(0, 100)
    : fallback;
}

function publicProfile(username, input) {
  const source = input && typeof input === 'object' ? input : {};
  const today = new Date().toISOString().slice(0, 10);
  const pointsInput = source.points && typeof source.points === 'object' ? source.points : {};
  const unlocksInput = source.unlocks && typeof source.unlocks === 'object' ? source.unlocks : {};
  const statsInput = source.stats && typeof source.stats === 'object' ? source.stats : {};
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
    ballSkin: /^[a-z0-9_-]{1,32}$/.test(source.ballSkin || '') ? source.ballSkin : 'classic',
    customTitle: typeof source.customTitle === 'string' ? source.customTitle.trim().slice(0, 20) : '',
    xp: boundedCount(source.xp, 0, 1000000000),
    dailyStreak: boundedCount(source.dailyStreak, 0, 1000000),
    lastPlayedDate: /^\d{4}-\d{2}-\d{2}$/.test(source.lastPlayedDate || '') ? source.lastPlayedDate : '',
    winStreak: boundedCount(source.winStreak, 0, 1000000),
    sessionId: typeof source.sessionId === 'string' ? source.sessionId.slice(0, 80) : '',
    points: {
      today: pointsInput.lastReset === today ? boundedCount(pointsInput.today, 0, 1000000000) : 0,
      total: boundedCount(pointsInput.total, 0, 1000000000),
      lastReset: today
    },
    unlocks: {
      cues: cosmeticIds(unlocksInput.cues, ['wood', 'carbon', 'ivory', 'black', 'gold', 'chrome', 'crimson']),
      felts: cosmeticIds(unlocksInput.felts, ['green', 'blue', 'burgundy', 'slate', 'sand']),
      balls: cosmeticIds(unlocksInput.balls, []),
      mascots: cosmeticIds(unlocksInput.mascots, ['marlow', 'ivy', 'rook', 'pip']),
      titles: cosmeticIds(unlocksInput.titles, []),
      tipTier: 0
    },
    equipped: source.equipped && typeof source.equipped === 'object' ? source.equipped : {},
    createdAt: Date.now(),
    stats: {
      wins: boundedCount(statsInput.wins, 0, 1000000000),
      losses: boundedCount(statsInput.losses, 0, 1000000000),
      frames: boundedCount(statsInput.frames, 0, 1000000000)
    }
  };
}

async function verifyGoogleIdToken(auth, idToken) {
  if (typeof idToken !== 'string' || idToken.length > 8192) {
    throw httpError(400, 'Google sign-in could not be verified.');
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    throw httpError(401, 'Google sign-in expired. Please try again.');
  }
  if (!decoded.firebase || decoded.firebase.sign_in_provider !== 'google.com') {
    throw httpError(401, 'Sign in with a Google account to continue.');
  }
  return decoded;
}

async function getGoogleAccountStatus(auth, database, idToken) {
  const decoded = await verifyGoogleIdToken(auth, idToken);
  const profileSnapshot = await database.ref('/profiles/' + decoded.uid).once('value');
  const profile = profileSnapshot.val();
  if (!profile) return { needsUsername: true };
  if (typeof profile.username !== 'string') {
    throw httpError(403, 'This Google account has an invalid FELTORA profile.');
  }
  const reservation = (await database.ref('/authUsernames/' + profile.username).once('value')).val();
  if (reservation !== decoded.uid) throw httpError(403, 'This FELTORA account could not be verified.');
  return {
    username: profile.username,
    needsUsername: false
  };
}

async function storeGooglePin(database, uid, pin, req) {
  const ipKey = rateLimitKey('google-pin:' + uid + ':' + getClientIp(req));
  await assertNotRateLimited(database, ipKey);

  const salt = crypto.randomBytes(16).toString('hex');
  const pinHash = await hashPin(pin, Buffer.from(salt, 'hex'));
  const credentialRef = database.ref('/authCredentials/' + uid);
  const result = await credentialRef.transaction((current) => current === null ? { salt, pinHash } : undefined);

  if (!result.committed) {
    const existing = result.snapshot.val();
    const candidate = Buffer.from(await hashPin(pin, Buffer.from(existing.salt, 'hex')), 'hex');
    const stored = Buffer.from(existing.pinHash, 'hex');
    if (candidate.length !== stored.length || !crypto.timingSafeEqual(candidate, stored)) {
      await recordFailedAttempt(database, ipKey, 5);
      throw httpError(409, 'A PIN is already set for this account. Use that PIN to sign in.');
    }
  }

  await resetRateLimit(database, [ipKey]);
  return { salt, pinHash, created: result.committed };
}

async function registerGoogleUser(auth, database, body, req) {
  const username = validateUsername(body.username);
  const pin = validatePin(body.pin);
  const decoded = await verifyGoogleIdToken(auth, body.idToken);
  const uid = decoded.uid;
  const profileRef = database.ref('/profiles/' + uid);
  const existingProfile = (await profileRef.once('value')).val();

  if (existingProfile) {
    if (existingProfile.username !== username) {
      throw httpError(409, 'This Google account already has a FELTORA username.');
    }
    const reservation = (await database.ref('/authUsernames/' + username).once('value')).val();
    if (reservation !== uid) throw httpError(403, 'This FELTORA account could not be verified.');
    await storeGooglePin(database, uid, pin, req);
    return { uid, username, profile: existingProfile };
  }

  const ipKey = rateLimitKey('google-register:' + getClientIp(req));
  await assertNotRateLimited(database, ipKey);
  const reservation = await database.ref('/authUsernames/' + username)
    .transaction((current) => current === null || current === uid ? uid : undefined);
  if (!reservation.committed) {
    await recordFailedAttempt(database, ipKey, 10);
    throw httpError(409, 'That username is unavailable.');
  }

  const profile = publicProfile(username, Object.assign(
    { displayName: decoded.name },
    body.profile && typeof body.profile === 'object' ? body.profile : {}
  ));
  let credential;
  try {
    credential = await storeGooglePin(database, uid, pin, req);
    await profileRef.set(profile);
  } catch (error) {
    await Promise.allSettled([
      database.ref('/authUsernames/' + username)
        .transaction((current) => current === uid ? null : undefined),
      profileRef.remove(),
      credential && credential.created
        ? database.ref('/authCredentials/' + uid)
          .transaction((current) => current && current.pinHash === credential.pinHash ? null : undefined)
        : Promise.resolve()
    ]);
    throw error;
  }
  return { uid, username, profile };
}

async function createGoogleLinkToken(auth, database, idToken) {
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    throw httpError(401, 'Your sign-in expired. Please sign in again before linking Google.');
  }
  const profile = (await database.ref('/profiles/' + decoded.uid).once('value')).val();
  if (!profile || typeof profile.username !== 'string') {
    throw httpError(403, 'Sign in to your FELTORA account before linking Google.');
  }

  const reservation = (await database.ref('/authUsernames/' + profile.username).once('value')).val();
  if (reservation !== decoded.uid) throw httpError(403, 'This FELTORA account could not be verified.');
  return auth.createCustomToken(decoded.uid, { username: profile.username });
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
    const { auth, database } = getServices();

    if (body.action === 'google-status') {
      const result = await getGoogleAccountStatus(auth, database, body.idToken);
      return res.status(200).json(result);
    }
    if (body.action === 'google-register') {
      const result = await registerGoogleUser(auth, database, body, req);
      return res.status(201).json(result);
    }
    if (body.action === 'google-link-token') {
      const customToken = await createGoogleLinkToken(auth, database, body.idToken);
      return res.status(200).json({ customToken });
    }

    const { username, pin } = validateCredentials(body);
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
