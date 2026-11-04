let firebaseAdmin;
try { firebaseAdmin = require('firebase-admin'); } catch(e) {}

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
      const existing = firebaseAdmin && firebaseAdmin.apps.find(a => a.name === 'debug');
      app = existing || firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(parsed), databaseURL: process.env.FIREBASE_DATABASE_URL }, 'debug');
    } catch (e) {
      return res.status(200).json({ ok: false, step: 'initApp', reason: e.message.slice(0, 100) });
    }

    try {
      await firebaseAdmin.auth(app).listUsers(1);
    } catch (e) {
      return res.status(200).json({ ok: false, step: 'authCall', reason: e.message.slice(0, 100) });
    }

    return res.status(200).json({ ok: true, step: 'all_passed' });
  } catch (e) {
    return res.status(200).json({ ok: false, step: 'unknown', reason: e.message.slice(0, 100) });
  }
};
