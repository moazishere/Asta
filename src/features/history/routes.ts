import type { Href } from 'expo-router';

// Typed routes are generated while the dev server runs, so routes added since the last start are not
// in the generated types yet. Building hrefs in one place keeps the cast out of the screens.
export const historyHref = '/runs' as Href;
export const runHref = (id: string) => `/runs/${encodeURIComponent(id)}` as Href;
