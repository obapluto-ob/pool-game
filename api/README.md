# Authentication and Community deployment

The authentication endpoint is a Vercel Function at `/api/auth`. It uses Firebase Admin to store server-side PIN hashes and issue Firebase custom tokens. Google sign-in uses Firebase's browser SDK and the allowlisted public config returned by `/api/firebase-config`. Google accounts can create a FELTORA username or be linked to an existing username/PIN account from the profile panel.

Before deploying:

1. Add the Firebase Admin service-account JSON to Vercel as `FIREBASE_SERVICE_ACCOUNT_JSON`. Never commit this credential or paste it into chat.
2. Set `FIREBASE_DATABASE_URL` to the Realtime Database URL for the same Firebase project. If omitted, the function uses the FELTORA database URL.
3. Set `FIREBASE_WEB_CONFIG` to the Firebase **Web app config JSON** from Project settings → General → Your apps. It needs `apiKey`, `authDomain`, `projectId`, and `appId`; include the database URL and other public fields from the same project when available. This is public client configuration, not the Admin service-account JSON.
4. In Firebase Console → Authentication, enable the Google provider and add the production hostname (for example, `pool-game-gamma.vercel.app`) and the local development hostname (`127.0.0.1` or `localhost`, as used) to the authorized domains list. The domain in the browser address bar must be authorized for popup and redirect sign-in.
5. Ensure Firebase Authentication and the Realtime Database are enabled for that project. The browser config, Admin credentials, and `FIREBASE_DATABASE_URL` must all refer to the same Firebase project and database.
6. Publish [firebase-rules.json](../firebase-rules.json) to Realtime Database Rules before enabling the Community UI. Deploying the website to Vercel does **not** publish Firebase rules. Guests can read community posts; authenticated users can create, like, follow, or delete their own posts.
7. Set `PAYSTACK_SECRET_KEY` in Vercel and configure Paystack to send signed webhook events to `/api/paystack-webhook`. Supporter badges and tip-tier cosmetics are granted by this verified webhook, not by the browser payment callback.
8. Deploy through Vercel using Node.js 22.x, as configured in `package.json`. Firebase Admin is pinned to 13.10.0 so its `jwks-rsa` dependency uses CommonJS-compatible `jose`; Firebase Admin 14 pulled ESM-only `jose`, which crashes the Vercel CommonJS function bundle. The existing Netlify configuration serves static files and does not deploy these `/api` functions.

For the tournament Join action, include the host's Firebase UID as `hostUid` in `/tournament/active`; the app resolves the host profile and sends a direct message.

Google sign-in uses a popup on desktop and a redirect on narrow screens. Existing PIN users can sign in and choose **Link Google for easier sign-in** in their profile; this keeps the same Firebase UID and profile. A new Google user chooses a FELTORA username once. The browser's Firebase auth persistence restores that Google session on the same device, while the Firebase profile can be loaded on another device after Google sign-in.

If Community requests return `401 Permission denied`, verify the deployed Realtime Database rules on the exact database URL configured by `FIREBASE_WEB_CONFIG`. The source rules allow public Community reads, but a Vercel deployment alone does not apply them.

If Google sign-in succeeds but choosing a FELTORA username fails, the browser sends `google-register` to `/api/auth`. Check the Vercel Function logs and confirm `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_WEB_CONFIG`, and `FIREBASE_DATABASE_URL` are configured for the same Firebase project. The Admin service account must be valid and have access to that project's Realtime Database. Missing, invalid, or mismatched server credentials return a configuration error; other server failures are logged by the function. The `contentscript.js` listener warnings are from a browser extension, and the Firebase popup COOP warnings are separate from an `/api/auth` response.

The existing four-digit PIN is low-entropy and has no recovery channel. The function rate-limits failed sign-ins, but this should not be treated as strong account security. Profile settings, progression, points, and owned cosmetics sync through Firebase; game result stats remain local-only. Weekly leaderboard wins are client-reported and are not independently verified. Historical local-only posts are not uploaded or treated as verified during migration.
