# Setup guide

How to run Asta on your own machine and deploy its backend. For building installable apps see [RELEASE.md](RELEASE.md).

Requirements: **Node 22.13+** (Expo SDK 58 needs it), an Android phone or emulator (iPhone needs an Apple Developer account for anything beyond Expo Go), a free [Expo](https://expo.dev) account.

## 1. Database

1. Create a free project at [supabase.com](https://supabase.com). Supabase is used only as hosted Postgres: in the dashboard turn off the Data API (Project Settings > Data API) and disable email signups under Authentication, so nothing can reach the database except our API.
2. Copy the connection string (Connect > Session pooler, with your database password filled in).

## 2. Run the API locally

```bash
cd server
npm install
cp .env.example .env      # fill in DATABASE_URL and JWT_SECRET (the file shows how to generate one)
npm run migrate           # creates the tables (7 migrations)
npm run seed:foods        # loads the ~55 starter foods from server/data/foods.json
npm run dev               # http://localhost:3000, check /health
```

If `npm run migrate` fails with a `SET ROLE` / permission error, run `grant app_user to postgres;` once in the Supabase SQL editor.

## 3. Run the app

```bash
npm install
cp .env.example .env.local
```

| Variable | What it is |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Base URL of the API. In development use your PC's LAN address (`ipconfig`), e.g. `http://192.168.1.20:3000`; a phone cannot use `localhost`. The phone must be on the same Wi-Fi and Windows may ask to allow Node through the firewall. |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Google Maps SDK for Android key (build time, Android only; iPhones use Apple Maps) |

**Quick preview with Expo Go (iPhone or Android):** `npx expo start --go`, scan the QR code. Expo Go cannot do background location, Google sign-in redirects or push notifications, so tracking only works while the screen is on.

**Full app (development build):** background tracking needs a development build.

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android   # install the APK on your phone
npx expo start --dev-client
```

iOS: `npx eas-cli@latest build --profile development --platform ios` (requires an Apple Developer account).

## 4. Deploy the API (Render, free tier)

1. Push the repo to GitHub, then Render > New > Blueprint > pick the repo (it reads `render.yaml`).
2. Set `DATABASE_URL` and `PUBLIC_URL` (your service URL, e.g. `https://asta-api.onrender.com`). `JWT_SECRET` is generated for you.
3. The free instance sleeps when idle, so the first request after a pause takes about 30 seconds. Render supports WebSockets on all plans.
4. Point the app at it: set `EXPO_PUBLIC_API_URL` to the Render URL (in `eas.json` for release builds).

## 5. Google sign-in (optional)

1. Google Cloud Console > APIs & Services > Credentials > Create OAuth client ID > **Web application**.
2. Authorized redirect URI: `https://<your-render-url>/auth/google/callback` (Google does not accept LAN IPs, so test Google sign-in against the deployed server).
3. Put the client ID and secret in Render's `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. The app only ever sees a one-time code, never a Google secret.

## Feature notes

**Friends and invites.** Friends find each other by exact username. The share button sends `https://<server>/invite/<username>`; that page tries to open the app through `asta://invite/<username>` and shows install links (`APP_STORE_URL` / `PLAY_STORE_URL`, optional) when the app is missing. It uses the custom URL scheme, which works on iOS and Android without Apple/Google link-verification files. Expo Go does not handle `asta://`, so test invites in a development build or type the username in the Friends screen.

**Live updates.** The friend-request badge and the leaderboards use a WebSocket on the same server at `/ws`.

**Challenges.** Scores live in the database (`server/migrations/0006_challenge_scoring.sql`): triggers update a member's score as soon as a run or food entry changes, for active challenges only, and `recompute_challenge_scores()` rebuilds everything from scratch. A scheduler inside the API process starts and ends challenges every minute and records the winner.

**Push notifications.** The server sends through Expo's push service (`expo-server-sdk`). Device tokens are registered in `push_tokens`; each user can switch the four kinds on or off in Profile > Notifications. Push needs a development or release build with an EAS project id (see [RELEASE.md](RELEASE.md)); it does not work in Expo Go on Android and cannot be tested on simulators.

## Tests and checks

```bash
cd server && npm test            # API, WebSocket, scoring, push, privacy (in-process Postgres, no Docker)
npm test                         # app unit tests (run maths, food, history, challenges)
npx tsc --noEmit && npx expo lint
```

## Security notes

- Passwords are bcrypt-hashed; refresh tokens are stored only as hashes and rotate on every use (replaying an old one revokes the session).
- There is no email verification or password reset yet. Because emails are unverified, signing in with Google to an address that already has a password account replaces that password, so a squatter cannot keep access.
