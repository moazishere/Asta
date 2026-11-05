import type { Href } from 'expo-router';

// expo-router's typed routes are generated while the dev server runs, so a route added since the last
// start is not in the generated types yet. Building the href in one place keeps the cast out of screens.
export const summaryHref = (id: string) => `/run-summary?id=${encodeURIComponent(id)}` as Href;
