# Asta

Running app for iOS and Android: GPS run tracking, calorie logging, friends, and friend challenges with a live leaderboard.

Built with React Native (Expo), TypeScript, an Express API and Postgres. Status: Phase 1 (design system, navigation, schema, auth) on an Express backend. See [claude-code-prompts.md](claude-code-prompts.md) for the build plan.

## Setup

Requirements: Node 22.13+ (required by Expo SDK 58), an Android phone (or emulator), a free [Expo](https://expo.dev) account.

```bash
npm install
cp .env.example .env.local        # then fill in the values
```

| Variable | What it is |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Base URL of the Express API |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Google Maps SDK for Android key (build-time) |

## Backend (Express API + Postgres)

The app talks to an Express API in [`server/`](server/), which talks to Postgres. Supabase is only the hosted Postgres here; its auth and API features are not used.

**1. Database**
1. Create a free project at [supabase.com](https://supabase.com). In the dashboard, turn off the Data API (Project Settings > Data API) and disable email signups under Authentication, since nothing should reach the database except our API.
2. Copy the connection string (Connect > Session pooler, with your database password filled in).

**2. Run the API locally**
```bash
cd server
npm install
cp .env.example .env      # fill in DATABASE_URL and JWT_SECRET (generate one, see the file)
npm run migrate           # creates the tables
npm run seed:foods        # loads the ~55 starter foods from server/data/foods.json (re-run after editing it)
npm run dev               # http://localhost:3000, check /health
```
If `npm run migrate` fails with a `SET ROLE` / permission error, run `grant app_user to postgres;` once in the Supabase SQL editor.

Point the app at it: in `.env.local` set `EXPO_PUBLIC_API_URL` to your PC's LAN address (`ipconfig`), e.g. `http://192.168.1.20:3000`. A phone cannot use `localhost`, and it must be on the same Wi-Fi (Windows may ask to allow Node through the firewall).

**3. Deploy (Render, free tier)**
1. Push the repo to GitHub, then Render > New > Blueprint > pick the repo (it reads `render.yaml`).
2. Set `DATABASE_URL`, and `PUBLIC_URL` (your service URL, e.g. `https://asta-api.onrender.com`). `JWT_SECRET` is generated for you.
3. The free instance sleeps when idle, so the first request after a pause takes about 30 seconds.
4. Set `EXPO_PUBLIC_API_URL` to the Render URL in `.env.local` / your EAS build environment.

**4. Google sign-in (optional)**
1. Google Cloud Console > APIs & Services > Credentials > Create OAuth client ID > **Web application**.
2. Authorized redirect URI: `https://<your-render-url>/auth/google/callback` (Google does not accept LAN IPs, so test Google sign-in against the deployed server).
3. Put the client ID and secret in Render's `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. The app only ever sees a one-time code, never a Google secret.

**Friends, invites and live updates**
- Friends find each other by exact username. The share button sends a link like `https://<server>/invite/<username>`; that page (served by the API) tries to open the app via its `asta://invite/<username>` link and shows install links (`APP_STORE_URL` / `PLAY_STORE_URL`, optional) if the app is missing. This uses the app's custom URL scheme, which works on iOS and Android without Apple/Google link-verification files.
- Expo Go does not handle `asta://` links, so test invites in a development build, or type the username in the Friends screen.
- Live updates (the friend-request badge) use a WebSocket on the same server at `/ws`. Render supports WebSockets on all plans.

**Tests** (in-process Postgres, no Docker, no network): `cd server && npm test` (154 tests: API behaviour, WebSocket, food and run maths, and the database privacy rules).

**Security notes**
- Passwords are bcrypt-hashed; refresh tokens are stored only as hashes and rotate on every use (replaying an old one revokes the session).
- There is no email verification or password reset yet. Because emails are unverified, signing in with Google to an address that already has a password account replaces that password, so a squatter cannot keep access.

## Running

This app needs a **development build** (background location does not work in Expo Go).

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android   # install the resulting APK on your phone
npx expo start --dev-client
```

iOS: `npx eas-cli@latest build --profile development --platform ios` (requires an Apple Developer account).

## Quality checks

```bash
npx expo lint
npx tsc --noEmit
```
