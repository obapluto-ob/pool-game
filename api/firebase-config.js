const PUBLIC_CONFIG_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
  'databaseURL',
  'storageBucket',
  'messagingSenderId',
  'measurementId'
];

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const rawConfig = process.env.FIREBASE_WEB_CONFIG;
  if (!rawConfig) {
    console.error('FIREBASE_WEB_CONFIG is not configured.');
    return res.status(503).json({ error: 'Firebase sign-in is not configured.' });
  }

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch (error) {
    console.error('FIREBASE_WEB_CONFIG is not valid JSON:', error.message);
    return res.status(503).json({ error: 'Firebase sign-in is not configured.' });
  }

  const publicConfig = Object.fromEntries(
    PUBLIC_CONFIG_KEYS
      .filter((key) => typeof config[key] === 'string')
      .map((key) => [key, config[key]])
  );
  if (!publicConfig.apiKey || !publicConfig.authDomain || !publicConfig.projectId || !publicConfig.appId) {
    console.error('FIREBASE_WEB_CONFIG is missing required web-app fields.');
    return res.status(503).json({ error: 'Firebase sign-in is not configured.' });
  }

  return res.status(200).json(publicConfig);
};
