# Design system and screens

Source: `reference.png` (cycling concept, 3 screens). Adapted to running, dark-first, no photos. All tokens live in `src/theme`; every component is shown on one page in the dev-only gallery (Profile > Component gallery).

## Tokens extracted from the reference

| Token | Value | Notes |
| --- | --- | --- |
| `bg` | `#0D0D0F` | near-black app background |
| `surface` / `surfaceRaised` | `#18181B` / `#222226` | cards / buttons on cards |
| `surfaceLight` | `#E9E9EB` | the pale grey hero card (landing screen) |
| `accent` | `#DDF247` | lime: CTAs, route line, progress, active tab |
| `accentOnLight` | `#6B7A00` | same hue, readable on light grey (the reference's lime-on-grey text fails contrast) |
| Radii | 10 / 16 / 24 / 32 / pill | cards 24, buttons and bars fully round |
| Spacing | 4pt grid, 20pt gutters | |
| Type | system font, bold, tight tracking | display 40, h1 30, h2 22, numerals 22/44 tabular |
| Icons | Ionicons outline | one family, same on both platforms |

## Adaptations from cycling to running

- Wording: "Start My Ride" -> "Start My Run", "Avg Speed" (km/h) -> "Avg Pace" (min/km), bike icon -> runner.
- Photos removed (landing hero, live view); solid dark surfaces instead. Live view will use a map.
- "Connected" device pill -> GPS status pill (searching / good / weak).
- "Current Location / End Point" cards removed.

## Screens

Built in phase 1 (layout final, data placeholder where noted):

1. **Welcome**: light hero card with headline, lime "Sign up" bar, ghost "Sign in".
2. **Sign in / Sign up**: email + password, Google button, switch link.
3. **Onboarding**: username, display name, height, weight, birth year, sex, calorie goal (Mifflin-St Jeor suggestion, editable).
4. **Home**: greeting + avatar, "This week" stat strip, calorie ring card, Start bar. *(zeros until phases 2-4)*
5. **Run**: title, locate button, GPS pill, map area, Duration / Avg Pace / Calories strip, Start bar. *(static until phase 2)*
6. **Food**: calorie ring, Protein / Carbs / Fat strip, meal list. *(empty until phase 4)*
7. **Challenges**: Active / Upcoming / Finished segmented tabs, empty state. *(until phase 6)*
8. **Profile**: avatar, name, @username, calorie goal row, sign out.

Designed here, built in later phases (same components):

- **Run in progress** (phase 2): map fills the top, floating dark stat card with the lime ProgressRing, round pause button + dark "End Run" pill.
- **Run history / detail** (phase 3): ListRow per run (route thumbnail as leading, distance as value); detail has map, splits list, pace chart.
- **Add food** (phase 4): search Input, ListRow results, grams Input, meal SegmentedControl, primary Button.
- **Friends** (phase 5): ListRow with Avatar leading, weekly km as value; requests with a small accent badge on the tab icon.
- **Challenge detail** (phase 6): ProgressBar toward target, time remaining, leaderboard of ListRows (rank badge + Avatar, "me" row `highlight`ed with lime outline).

## Tab bar

Floating dark pill. The active tab expands into a lime pill with icon + label (echoing the lime CTA bar); inactive tabs are icon-only in muted grey. The reference had no tab bar, so this one is new.

## Logo

An "A" built from two thick rounded strokes in the app's lime (`#DDF247`) on near-black (`#0D0D0F`), with a round dot where the crossbar would be: a route marker, so the letter and the sport are one shape. Sources are in `docs/design/logo/` (`mark.svg` transparent, `icon.svg` with background); the app icons in `assets/images/` and the iOS 26 layered icon in `assets/expo.icon/` are rendered from the same geometry, and `src/components/Logo.tsx` draws it in the app. The adaptive Android icon keeps the mark inside the central safe zone, and the monochrome version is a plain white silhouette that Android tints for themed icons.
