import type { Href } from 'expo-router';

// Typed routes are generated while the dev server runs, so routes added since the last start are not
// in the generated types yet. Building hrefs in one place keeps the casts out of the screens.
export const newChallengeHref = '/challenges/new' as Href;
export const challengeHref = (id: string) => `/challenges/${encodeURIComponent(id)}` as Href;
