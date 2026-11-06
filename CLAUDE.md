# Asta

Cross-platform (Android + iOS) running app: GPS run tracking, calorie/food logging, friends, and friend challenges with a live leaderboard. Portfolio/side project, so code quality and README matter. The phased build plan is in [claude-code-prompts.md](claude-code-prompts.md); read its "Decisions" section first (including "Backend: Express"). Visual reference: `docs/design/reference.png` (drawn for cycling; we adapt it to running).

## Stack (do not substitute without asking)

- **App** (repo root): React Native + Expo SDK 58, **development build (not Expo Go)** because background location needs native code. TypeScript strict. Expo Router (routes in `src/app/`), TanStack Query (server state), Zustand (live run-session state), expo-secure-store (refresh token).
- Device features: expo-location + expo-task-manager (background GPS), expo-sqlite (local GPS buffer), react-native-maps, Expo Notifications, EAS Build.
- **API** (`server/`, its own `package.json`): Express 5 + TypeScript (ESM), `pg`, zod, JWT auth we implement ourselves (bcrypt passwords, rotating refresh tokens, Google sign-in via a server-side redirect). Deployed on Render (`render.yaml`).
- **Database**: Postgres hosted on Supabase, used as a plain database only (no Supabase Auth/Realtime/Data API). Migrations live in `server/migrations/`.

## Folder conventions

- `src/app/` routes only (every file is a screen). No components/hooks/utils in here.
- `src/components/` shared UI; `src/features/{auth,run,food,friends,challenges}/` feature code; `src/lib/` API client (`api.ts`), env, i18n, utils; `src/theme/` design tokens.
- `server/src/` Express app (`routes/`, `middleware/`, `lib/`, `db.ts`, `app.ts`); `server/test/` tests; `server/migrations/` SQL, one concern per file, never edited after being applied.
- Absolute imports via `@/` (maps to `src/`) in the app; relative `.js` imports in the server (ESM).
- `ios/` and `android/` are generated (Continuous Native Generation). Never edit by hand; use `app.config.ts` and config plugins.

## Rules

1. Every feature must work on iOS and Android. Never write platform-specific code without a `Platform` check and a comment explaining why.
2. All colors, spacing, radii and typography come from `src/theme`. No hard-coded values in components.
3. **Server data access:** every query on user data goes through `db.asUser(userId, ...)`, which runs as the `app_user` role with Row Level Security bound to the caller. `db.asService(...)` (owner role, bypasses RLS) is only for the auth tables (`users`, `refresh_tokens`, `auth_codes`) and for system jobs that touch no user data in a response: the challenge scheduler and the live-update fan-out, which read member ids only. Never build SQL from request input except whitelisted column names.
4. Clients never write `challenge_scores`; only security-definer SQL does. `food_logs` and `run_points` are owner-only. Friends only ever see `route_polyline_public` (via the `friend_runs` view).
5. **Run data:** the phone stores every GPS fix in local SQLite first and uploads raw points; the server re-derives distance, routes and calories. The filter constants and logic in `src/features/run/geo.ts` and `server/src/lib/geo.ts` must stay in sync (both are unit tested). Background tracking (`locationTask.ts`) may only touch the database, never React state.
6. Validate every request body with zod; routes never return password hashes, token hashes or internal errors.
7. Expo APIs change between SDKs: use `npx expo install <pkg>` (never `npm add`) in the app, and check https://docs.expo.dev/versions/v58.0.0/ before using an API from memory.
8. Never commit secrets. App public config goes in `.env.local`, server config in `server/.env` (see the `.env.example` files).
9. Run lint and typecheck (app and server) and the server tests before declaring a task done.

## Commands

```bash
# App (repo root)
npm install
npx expo start --dev-client      # dev server for the development build
npx expo lint                    # lint
npx tsc --noEmit                 # typecheck
npm test                         # app unit tests (run maths)
npx expo-doctor                  # diagnose config/dependency problems
npx eas-cli@latest build --profile development --platform android   # Android dev build (cloud)

# API (server/)
cd server && npm install
npm run dev                      # needs server/.env
npm run migrate                  # apply server/migrations to DATABASE_URL
npm run seed:foods               # load/refresh the starter foods from server/data/foods.json
npm run typecheck && npm test    # tests run in-process Postgres (PGlite), no Docker/network
npm run build && npm start       # production build (what Render runs)
```

Requires Node 22.13+ (Expo SDK 58). The developer is on Windows: iOS builds are cloud-only (EAS) and need an Apple Developer account. Android is the primary test target for now.
