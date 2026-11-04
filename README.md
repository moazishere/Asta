# Asta

Running app for iOS and Android: GPS run tracking, calorie logging, friends, and friend challenges with a live leaderboard.

Built with React Native (Expo), TypeScript, Supabase. Status: Phase 1 (design system, navigation, schema, auth). See [claude-code-prompts.md](claude-code-prompts.md) for the build plan.

## Setup

Requirements: Node 22.13+ (required by Expo SDK 58), an Android phone (or emulator), a free [Expo](https://expo.dev) account.

```bash
npm install
cp .env.example .env.local        # then fill in the values
```

| Variable | What it is |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Google Maps SDK for Android key (build-time) |

## Backend (Supabase)

1. Create a free project at [supabase.com](https://supabase.com) and copy the URL and anon key into `.env.local`.
2. Apply the migrations in `supabase/migrations/` in order (SQL editor, or `npx supabase db push` after `npx supabase link`).
3. Authentication > Providers: keep Email enabled. For quick testing, turn **off** "Confirm email" (otherwise sign-up asks you to check your inbox first).
4. Google sign-in: enable the Google provider (needs an OAuth client ID/secret from Google Cloud Console), and add `asta://auth-callback` under Authentication > URL Configuration > Redirect URLs.
5. Database tests (no Docker, runs the migrations in an in-process Postgres): `npm run test:db`.

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
