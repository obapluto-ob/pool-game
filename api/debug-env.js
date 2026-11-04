const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

module.exports = async function handler(req, res) {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) return res.status(200).json({ ok: false, step: 'env', reason: 'FIREBASE_SERVICE_ACCOUNT_JSON missing' });

    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) {
      return res.status(200).json({ ok: false, step: 'parse', reason: e.message.slice(0, 100) });
    }

    let app;
    try {
      app = getApps().find(a => a.name === 'debug') ||
        initializeApp({ credential: cert(parsed), databaseURL: process.env.FIREBASE_DATABASE_URL }, 'debug');
    } catch (e) {
      return res.status(200).json({ ok: false, step: 'initApp', reason: e.message.slice(0, 100) });
    }

    try {
      await getAuth(app).listUsers(1);
    } catch (e) {
      return res.status(200).json({ ok: false, step: 'authCall', reason: e.message.slice(0, 100) });
    }

    return res.status(200).json({ ok: true, step: 'all_passed' });
  } catch (e) {
    return res.status(200).json({ ok: false, step: 'unknown', reason: e.message.slice(0, 100) });
  }
};
