# Authentication and Community deployment

The authentication endpoint is a Vercel Function at `/api/auth`. It uses Firebase Admin to store server-side PIN hashes and issue Firebase custom tokens. Google sign-in uses Firebase's browser SDK and the allowlisted public config returned by `/api/firebase-config`. Google accounts can create a FELTORA username or be linked to an existing username/PIN account from the profile panel.

Before deploying:

1. Add the Firebase Admin service-account JSON to Vercel as `FIREBASE_SERVICE_ACCOUNT_JSON`. Never commit this credential or paste it into chat.
2. Set `FIREBASE_DATABASE_URL` to the Realtime Database URL for the same Firebase project. If omitted, the function uses the FELTORA database URL.
3. Set `FIREBASE_WEB_CONFIG` to the Firebase **Web app config JSON** from Project settings → General → Your apps. It needs `apiKey`, `authDomain`, `projectId`, and `appId`; include the database URL and other public fields from the same project when available. This is public client configuration, not the Admin service-account JSON.
4. In Firebase Console → Authentication, enable the Google provider and add the production hostname (for example, `pool-game-gamma.vercel.app`) and any local development hostname to the authorized domains list. The domain in the browser address bar must be authorized for popup and redirect sign-in.
5. Ensure Firebase Authentication and the Realtime Database are enabled for that project. The browser config, Admin credentials, and `FIREBASE_DATABASE_URL` must all refer to the same Firebase project and database.
6. Publish [firebase-rules.json](../firebase-rules.json) to Realtime Database Rules before enabling the Community UI. Guests can read community posts; authenticated users can create, like, follow, or delete their own posts.
7. Deploy through Vercel. The existing Netlify configuration serves static files and does not deploy these `/api` functions.

Google sign-in uses a popup on desktop and a redirect on narrow screens. Existing PIN users can sign in and choose **Link Google for easier sign-in** in their profile; this keeps the same Firebase UID and profile. A new Google user chooses a FELTORA username once. The browser's Firebase auth persistence restores that Google session on the same device, while the Firebase profile can be loaded on another device after Google sign-in.

The existing four-digit PIN is low-entropy and has no recovery channel. The function rate-limits failed sign-ins, but this should not be treated as strong account security. Display name, avatar, cue, and felt are synced to the profile; game stats are still local-only and must not be presented as cross-device or verified. Historical local-only posts are not uploaded or treated as verified during migration.
