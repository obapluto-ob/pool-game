# Authentication and Community deployment

The username/PIN auth endpoint is a Vercel Function at `/api/auth`. It uses Firebase Admin to store server-side PIN hashes and issue Firebase custom tokens. The browser keeps existing game profiles and stats locally; a local-only profile can be upgraded by creating its online account with the same username and PIN.

Before deploying:

1. Add the Firebase Admin service-account JSON to Vercel as `FIREBASE_SERVICE_ACCOUNT_JSON`. Never commit this credential or paste it into chat.
2. Set `FIREBASE_DATABASE_URL` to the Realtime Database URL for the same Firebase project. If omitted, the function uses the FELTORA database URL.
3. Ensure Firebase Authentication and the Realtime Database are enabled for that project.
4. Publish [firebase-rules.json](../firebase-rules.json) to Realtime Database Rules before enabling the Community UI. Guests can read community posts; authenticated users can create, like, follow, or delete their own posts.
5. Deploy through Vercel. The existing Netlify configuration serves static files and does not deploy this `/api` function.

The existing four-digit PIN is low-entropy and has no recovery channel. The function rate-limits failed sign-ins, but this should not be treated as strong account security. Historical local-only posts are not uploaded or treated as verified during migration.
