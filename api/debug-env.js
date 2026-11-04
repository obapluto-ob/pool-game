module.exports = function handler(req, res) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return res.status(200).json({ ok: false, reason: 'env var missing' });
  try {
    const parsed = JSON.parse(raw);
    return res.status(200).json({
      ok: true,
      project_id: parsed.project_id || 'missing',
      client_email: parsed.client_email ? parsed.client_email.slice(0, 20) + '...' : 'missing',
      has_private_key: typeof parsed.private_key === 'string' && parsed.private_key.includes('BEGIN'),
      private_key_has_newlines: typeof parsed.private_key === 'string' && parsed.private_key.includes('\n')
    });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: 'JSON parse failed', detail: e.message.slice(0, 80) });
  }
};
