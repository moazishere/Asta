# Asta

Cross-platform (Android + iOS) running app: GPS run tracking, calorie/food logging, friends, and friend challenges with a live leaderboard. Portfolio/side project, so code quality and README matter. The phased build plan is in [claude-code-prompts.md](claude-code-prompts.md); read its "Decisions" section first. Visual reference: `docs/design/reference.png` (drawn for cycling; we adapt it to running).

## Stack (do not substitute without asking)

- React Native + Expo SDK 58, **development build (not Expo Go)** because background location needs native code. TypeScript strict.
- Expo Router (routes in `src/app/`), TanStack Query (server state), Zustand (live run-session state)
- expo-location + expo-task-manager (background GPS), expo-sqlite (local GPS buffer), react-native-maps
- Supabase: Postgres, Auth, Realtime, Edge Functions, Row Level Security
- Expo Notifications (push), EAS Build (distribution)

## Folder conventions

- `src/app/` routes only (every file is a screen). No components/hooks/utils in here.
- `src/components/` shared UI; `src/features/{auth,run,food,friends,challenges}/` feature code (screens' logic, hooks, queries); `src/lib/` supabase client, env, utils; `src/theme/` design tokens.
- `supabase/migrations/` SQL migrations, one concern per file, never edited after being applied.
- Absolute imports via `@/` (maps to `src/`).
- `ios/` and `android/` are generated (Continuous Native Generation). Never edit by hand; use `app.config.ts` and config plugins.

## Rules

1. Every feature must work on iOS and Android. Never write platform-specific code without a `Platform` check and a comment explaining why.
2. All colors, spacing, radii and typography come from `src/theme`. No hard-coded values in components.
3. Clients never write `challenge_scores`; only security-definer SQL does. `food_logs` and `run_points` are owner-only. Friends only ever see `route_polyline_public`.
4. Expo APIs change between SDKs: use `npx expo install <pkg>` (never `npm add`) and check https://docs.expo.dev/versions/v58.0.0/ before using an API from memory.
5. Never commit secrets. Public config goes in `.env.local` (see `.env.example`).
6. Run lint and typecheck before declaring a task done.

## Commands

```bash
npm install
npx expo start --dev-client      # dev server for the development build
npx expo lint                    # lint
npx tsc --noEmit                 # typecheck
npx expo-doctor                  # diagnose config/dependency problems
npx expo install --fix           # fix incompatible versions
npx eas-cli@latest build --profile development --platform android   # Android dev build (cloud)
```

The developer is on Windows: iOS builds are cloud-only (EAS) and need an Apple Developer account. Android is the primary test target for now.
