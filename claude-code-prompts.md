# Claude Code Prompts: Running + Health + Challenges App (iOS & Android)

How to use: run the phases in order, one per Claude Code session (or `/clear` between them). Do not move to the next phase until the acceptance checklist passes on a real device.

## Decisions (read first)

- **Sport:** this is a RUNNING app. The reference design (`docs/design/reference.png`) was drawn for cycling. Keep its visual language (near-black cards, lime accent, large rounded corners, big numerals, light-grey home card) but swap cycling wording and imagery for running ("Start My Run", "Your Run", runner imagery, "Avg Pace" instead of "Avg Speed").
- **Screens not in the reference:** the reference only has 3 screens (landing, route overview, live view) and no tab bar. Design all other screens (Home, Food, Friends, Challenges, Profile, auth, onboarding, run history/detail) in the same style, and document them in `docs/design/screens.md` so they stay consistent.
- **Live run screen:** use a map, not an AR/camera view. The "Connected" pill becomes a GPS-status pill (searching / good / weak signal).
- **Platforms:** cross-platform code, but Android is the primary test target for now (the developer is on Windows and has no Apple Developer account yet). Never write code that only works on one platform. iOS is verified later via EAS once an account exists. Where a phase says "test on iOS", treat it as "when available".
- **Git:** this folder has its own git repo (`git init` in Asta). Do not commit into the repo that lives in the home folder.
- **Security principle:** clients never write `challenge_scores`. Only security-definer triggers/functions do.

## Backend: Express (supersedes every Supabase mention below)

Phase 0 and 1 were built first on Supabase, then the backend was switched to **Express + TypeScript in `server/`**, with Postgres hosted on Supabase as a plain database, our own JWT auth, deployed on Render. Phases 0-1 below are kept as written for history; read later phases with this mapping:

| Prompt says | Now means |
| --- | --- |
| Supabase client / `supabase-js` | `apiFetch` / `apiPublic` in `src/lib/api.ts` calling the Express API |
| RLS policies, `auth.uid()` | Same RLS, but keyed to `app.uid()` and the `app_user` role; the API runs each request via `db.asUser(userId, ...)` |
| Supabase Auth, Google sign-in | `/auth/*` routes in `server/` (bcrypt, rotating refresh tokens, server-side Google redirect) |
| Supabase Realtime (leaderboard, friend-request badge) | Server-Sent Events (or WebSocket) endpoint in Express; the app subscribes while the screen is open |
| Edge Functions (push, scheduled challenge status) | Express code plus an in-process scheduler (`node-cron`) or Render cron job, using `expo-server-sdk` for push |
| `supabase/migrations/` | `server/migrations/` (run with `npm run migrate`) |
| "SQL tests / RLS tests" | `server/test/` (PGlite in-process Postgres + supertest) |

Rules for every API endpoint: validate the body with zod, use `db.asUser` for user data (never `asService`), return JSON errors `{ error, message }`, add a supertest test, and never return internal errors. Run uploads (Phase 2) go to `POST /runs` with a larger body limit set on that route only, in one transaction. **Phase 2 as built:** the phone uploads only the raw accepted GPS points (plus a client-generated run id, start/end and moving time). The server re-derives distance, pace, calories, the simplified route and the 200 m-trimmed public route itself (it never trusts client-computed values), so item 7's Douglas-Peucker/polyline/kcal/suspicious work lives in `server/src/lib/geo.ts` and `server/src/routes/runs.ts`. In Expo Go tracking is foreground-only (no background location), so Phase 2's background acceptance test needs a development build.

---

## Phase 0: Project setup and CLAUDE.md

```
You are my senior mobile engineer. We are building a cross-platform (iOS + Android) fitness app with: GPS run tracking, calorie/food logging, friends, and friend challenges with a live leaderboard. It is a side project I will share with friends and show in my portfolio, so code quality and a clean README matter.

Stack (do not substitute without asking):
- React Native + Expo (development build, NOT Expo Go, because we need background location), TypeScript strict mode
- Expo Router for navigation
- TanStack Query for server state, Zustand for live run-session state
- expo-location + expo-task-manager for background GPS, expo-sqlite for the local GPS buffer
- react-native-maps for the route map
- Supabase (Postgres, Auth, Realtime, Edge Functions) as backend, with Row Level Security
- Expo Notifications for push
- EAS Build for distribution

Tasks:
0. Run `git init` in this folder (it must be its own repo) with a proper .gitignore (node_modules, .env*, android/, ios/ if generated, .expo, dist). Copy the reference design into docs/design/reference.png.
1. Initialise the project in the current folder with Expo Router + TypeScript, ESLint + Prettier, and absolute imports (@/...).
2. Create this folder structure: app/ (routes), src/components, src/features/{auth,run,food,friends,challenges}, src/lib (supabase client, utils), src/theme, supabase/migrations.
3. Configure app.json/app.config.ts for BOTH platforms: bundle identifier / package name placeholders, iOS background mode "location" and the location usage strings, Android permissions (ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION, POST_NOTIFICATIONS).
4. Set up .env handling (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, GOOGLE_MAPS_ANDROID_API_KEY) with a .env.example, and wire the Google Maps key into android.config.googleMaps.apiKey via app.config.ts (react-native-maps needs it on Android). Never commit secrets.
5. Write a CLAUDE.md at the repo root containing: the stack above, folder conventions, the rule "every feature must work on iOS and Android, never write platform-specific code without a Platform check and a comment explaining why", the rule "all colors/spacing/typography come from src/theme, no hard-coded values in components", and the commands to run the app.
6. Write a short README with setup steps.

Acceptance: `npx expo start` works, `npx tsc --noEmit` and lint pass, and the app shows a blank screen on an Android dev build. Stop and give me a summary plus the exact commands to create the dev build for Android (EAS cloud build, since I am on Windows) and, for later, iOS (needs an Apple Developer account).
```

---

## Phase 1: Design system, navigation shell, Supabase schema, auth

The reference image lives at docs/design/reference.png (no need to attach it again).

```
Read docs/design/reference.png. It is the visual source of truth, but it was drawn for cycling and only has 3 screens. Follow the "Decisions" section of the prompts file: adapt to running, and design the missing screens in the same style (write them down in docs/design/screens.md).

Part A, design system:
1. Study the image carefully. Extract the colour palette, typography scale, corner radii, spacing rhythm and icon style into src/theme (tokens for light mode; add dark mode tokens only if the design shows dark mode).
2. Build reusable components that appear in the design (buttons, inputs, cards, stat tiles, list rows, tab bar, progress ring/bar, avatar, etc.) in src/components. Add a hidden dev-only "component gallery" route so I can see all of them on one screen.
3. If the design contains Arabic text or an RTL layout, set up i18n with RTL support from the start (I18nManager + a simple translation helper). If it does not, still keep all user-facing strings in one place so Arabic can be added later.
4.This design is for cycling; adapt every screen to RUNNING (icons, wording, and metrics: distance, time, pace in min/km, calories). Do not use photo backgrounds; use the dark theme with solid surfaces. Remove the Current Location / End Point cards. For the screens that are NOT in the image (food log, friends, challenges, leaderboard, profile), design them yourself using the exact same tokens, components, and visual language.

Part B, navigation shell:
Build the tab navigation and empty placeholder screens that match the design: Home, Run, Food, Challenges, Profile (rename to match the design). Match the tab bar and headers exactly.

Part C, Supabase:
Write SQL migrations in supabase/migrations for these tables with sensible types, foreign keys, and timestamps:
- profiles (id = auth.users.id, username unique, display_name, avatar_url, height_cm, weight_kg, birth_year, sex, daily_kcal_goal, timezone)
- friendships (id, requester_id, addressee_id, status pending/accepted/blocked; unique pair via least/greatest index; check requester <> addressee)
- runs (id, user_id, started_at, ended_at, distance_m, moving_time_s, avg_pace_s_per_km, kcal_est, route_polyline, route_polyline_public, suspicious boolean default false)  -- route_polyline_public is the same route with the first and last ~200 m removed; it is what friends see, so nobody learns where someone lives. Only the owner can read route_polyline and run_points.
- run_points (run_id, seq, recorded_at, lat, lng, altitude_m, accuracy_m, speed_mps)
- foods (id, name, name_ar, barcode, kcal_per_100g, protein_g, carbs_g, fat_g, serving_g, source custom/off/user, created_by)
- food_logs (id, user_id, log_date, meal_type, food_id nullable, custom_name, grams, kcal, protein_g, carbs_g, fat_g)  -- store a snapshot of macros at log time
- challenges (id, creator_id, title, type distance/run_count/kcal_streak, target_value, starts_at, ends_at, status)
- challenge_members (challenge_id, user_id, joined_at, status invited/joined/declined/left)
- challenge_scores (challenge_id, user_id, value, reached_at, updated_at)  -- reached_at = when the user first reached the current value; used for tie-breaks and preserved by recomputes
- push_tokens (user_id, token, platform)
Add the indexes: runs(user_id, started_at desc), run_points(run_id, seq), food_logs(user_id, log_date), challenge_scores(challenge_id, value desc), friendships(addressee_id, status).
Enable RLS on every table. Write the policies explicitly for each table:
- profiles: readable by the owner and accepted friends (plus a minimal username/display_name/avatar lookup for finding a friend by exact username, via a security-definer function, not an open select); writable by the owner.
- runs: owner full access; accepted friends can read the row but never route_polyline (expose route_polyline_public through a view). run_points: owner ONLY.
- food_logs: owner ONLY. foods: readable by everyone for source custom/off, user-created foods readable by their creator only; writable by the creator.
- friendships: visible to both parties; insert only as requester; only the addressee can accept; either party can delete; blocked rows are invisible to the blocked user's queries on the blocker's data.
- challenges: readable by the creator and by members INCLUDING invited users (so invitees can see what they were invited to); creator can edit only before it starts.
- challenge_members: members can see co-members; the creator or the invited user can insert/update their own row status appropriately.
- challenge_scores: readable by members of that challenge; NO client insert/update/delete policy at all. Only security-definer triggers and functions write it.
- push_tokens: owner only.
Add a trigger that creates a profile row when a new auth user signs up.

Part D, auth:
Implement sign up / sign in with email+password and Google sign-in, a session provider, protected routes, and a first-run onboarding that collects username, height, weight, birth year, sex, and computes a suggested daily calorie goal (Mifflin-St Jeor, user can override). Screens must match the design.

Acceptance: I can register, finish onboarding, see my row in Supabase, sign out and back in on an Android device (iOS when available). Run lint and typecheck. Summarise what you built and list anything in the design you could not match and why.
```

---

## Phase 2: GPS run tracking (the risky part, test first)

```
Build run tracking. This is the hardest feature, so reliability matters more than polish. Match the Run screen from the attached design.

Requirements:
1. Run screen with Start / Pause / Resume / Stop, live distance, elapsed time, current pace, and a map with the live route.
2. Permissions flow: ask foreground location first, then background location in a separate step with a clear explanation screen. Handle denied/limited states gracefully on both platforms.
3. Background tracking with expo-location + expo-task-manager. On Android use a foreground service with a persistent notification while a run is active. On iOS enable background location updates (blue bar is expected).
4. Sample by distance (about every 5 to 10 m), not by time. Write EVERY point immediately to expo-sqlite (table: local_runs, local_points). Never keep the only copy in memory.
5. Filtering: drop points with accuracy worse than 30 m and drop jumps implying speed above 12 m/s between consecutive points. Compute distance with the haversine formula over filtered points; compute moving time excluding paused periods and standing still.
6. Crash recovery: on app start, detect an unfinished local run and offer "Resume" or "Save what we have".
7. On Stop: simplify the route (Douglas-Peucker) into route_polyline, also produce route_polyline_public (first and last ~200 m removed), estimate calories (about 1 kcal per kg of body weight per km, labelled as an estimate in the UI), flag runs with average speed above about 20 km/h as suspicious=true, then upload the run + points to Supabase in one batched request. If offline, keep it queued locally and retry later.
8. Unit tests for the haversine distance, point filter, and pace/moving-time calculations.

Acceptance (I will test this myself, on a real Android phone now, and iOS later when I have an Apple Developer account): start a run, lock the screen, put the phone in my pocket, walk or run for 20 minutes, and the saved route and distance are correct. Also kill the app mid-run and confirm recovery works. Do not proceed until I confirm. At the end, list known limitations per platform, including aggressive battery optimisation on some Android brands, and what I should adjust in device settings to test.
```

---

## Phase 3: Run history and stats

```
Build the run history and statistics screens, matching the attached design.

1. Runs list (newest first) with date, distance, time, pace, and a small route thumbnail. Infinite scroll via TanStack Query.
2. Run detail screen: full route on the map, splits per km, pace chart, calories estimate, delete run (with confirmation).
3. Weekly summary on Home: total distance, number of runs, total time, compared to last week.
4. Weekly bar chart of distance per day. Use a lightweight charting approach that works on both platforms; justify your choice in a comment.
5. Empty, loading, and error states for every screen.

Acceptance: after saving runs from Phase 2, all numbers on the list, detail and weekly summary agree with each other. Add tests for the aggregation helpers. Summarise and list any design mismatches.
```

---

## Phase 4: Food and calorie logging

```
Build food and calorie tracking, matching the attached design.

1. Daily view with date switcher, calories consumed vs the user's daily_kcal_goal (ring or bar as in the design), and macros (protein, carbs, fat).
2. Add food: search foods by name (Arabic and English via name/name_ar), pick grams or a serving, choose meal type (breakfast/lunch/dinner/snack), save to food_logs with a snapshot of the macros.
3. Custom food: create a food with name, kcal and macros per 100 g, saved as source='user'.
4. Quick add: log just calories with a custom name.
5. Edit and delete log entries; totals update instantly (optimistic updates).
6. Seed the foods table with a small starter set of about 50 common foods, including common Levantine dishes (for example hummus, falafel, shawarma, manakish, tabbouleh, fattoush, kibbeh, mujaddara, labneh, za'atar bread, rice with chicken), with sensible per-100 g values. Mark the seed values as approximate in a comment and in a data file I can easily edit.
7. Respect privacy: food_logs are visible only to the owner (already enforced by RLS). Verify it with a test or SQL check.

Not in this phase: barcode scanning (that comes later).

Acceptance: I can log a full day of meals on both platforms and the daily total is correct. Summarise.
```

---

## Phase 5: Friends

```
Build the friends feature, matching the attached design.

1. Find a friend by exact username; also an invite link/code the user can share (deep link into the app, working on both iOS and Android, with a fallback screen if the app is not installed).
2. Send, accept, decline, cancel friend requests; remove friend; block.
3. Friends list showing each friend's avatar, name, and this week's distance (readable via RLS because they are accepted friends).
4. Friend profile screen with their recent runs, using route_polyline_public only (never full routes, never their food logs).
5. Realtime: the incoming-requests badge updates live via Supabase Realtime.

Acceptance: with two test accounts on two devices (one iOS, one Android if possible), requests, acceptance, and visibility rules work. Add SQL or integration tests that prove a non-friend cannot read another user's runs and nobody but the owner can read food_logs. Summarise.
```

---

## Phase 6: Challenges and live leaderboard (the core differentiator)

```
Build challenges, matching the attached design.

Types and scoring:
- distance: sum of distance_m of the member's non-suspicious runs between starts_at and ends_at
- run_count: number of non-suspicious runs of at least 1 km in the window
- kcal_streak: number of days (in the member's own profiles.timezone) where logged calories are within +/-10% of their daily_kcal_goal and at least one food entry exists

Backend:
1. Postgres triggers (security definer) that update challenge_scores whenever a run is inserted/updated/deleted or food_logs change, only for the member's ACTIVE challenges. Set reached_at only when the value changes.
2. A SQL function recompute_challenge_scores(challenge_id) that recomputes everything from scratch as the source of truth. It must preserve reached_at for rows whose value did not change, so a recompute never reshuffles ties.
3. A scheduled job (pg_cron or an Edge Function on a schedule) that moves challenges draft -> active -> ended by date, and on ending records the winner.
4. RLS: challenges and challenge_scores readable only by members; only the creator can edit a challenge before it starts. Calories are never exposed to other members, only the score.

App:
1. Create a challenge (title, type, target, dates), invite friends from my friends list, join/leave.
2. Challenge detail with a live leaderboard (Supabase Realtime subscription on challenge_scores filtered by challenge_id), my rank, progress toward the target, and time remaining.
3. Ties are broken by who reached the value first (earlier reached_at).
4. Active / upcoming / finished tabs matching the design.

Tests: SQL tests (or documented queries) for each challenge type, for late joiners, for a deleted run, and for timezone day boundaries.

Acceptance: two friends in one challenge; when one finishes a run, the other sees the leaderboard change live without refreshing. Summarise and list assumptions you made.
```

---

## Phase 7: Notifications, polish, release builds

```
Final phase.

1. Push notifications with Expo Notifications on both platforms: register tokens into push_tokens; send via an Edge Function for: new friend request, invited to a challenge, a friend passed me on the leaderboard, challenge ended (with winner). Add a settings screen to toggle each type.
2. Polish: loading skeletons, empty states, error toasts, haptics where it fits the design, safe-area handling, keyboard avoidance, and accessibility labels. Check small phones and large phones on both platforms.
3. Performance pass: avoid unnecessary re-renders on the live run screen, memoise the map polyline, and confirm that battery use during a 30-minute run is reasonable (report what you measured or could not measure).
4. Set up EAS Build profiles: development, preview (internal distribution), production. Android: produce an installable APK for friends. iOS: document the TestFlight steps and what I need (Apple Developer account).
5. Write the final README for portfolio use: features, architecture diagram (Mermaid), the database schema, how background tracking works and its trade-offs, how to run it, and screenshots placeholders.
6. Create a short manual QA checklist covering both platforms.

Acceptance: I can install the preview build on an Android phone and (once I have an Apple Developer account) an iPhone, create an account, run, log food, add a friend, and complete a challenge end to end. Summarise what is left for a future version (barcode scanning, Apple Health / Health Connect, offline-first sync, social feed).
```

---

## Tips for every phase

- Start each session with: `Read CLAUDE.md, then do the following phase.`
- After each phase, commit: `git commit -am "phase N done"`. If a phase goes wrong, revert instead of patching on top.
- Test on real devices. Simulators cannot validate background GPS.
- If Claude Code asks to change the stack, say no unless you agree it is necessary.
