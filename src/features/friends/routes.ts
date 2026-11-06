import type { Href } from 'expo-router';

import { env } from '@/lib/env';

// Typed routes are generated while the dev server runs, so routes added since the last start are not
// in the generated types yet. Building hrefs in one place keeps the casts out of the screens.
export const friendsHref = '/friends' as Href;
export const friendHref = (id: string) => `/friends/${encodeURIComponent(id)}` as Href;
export const inviteHref = (username: string) => `/invite/${encodeURIComponent(username)}` as Href;

/** The link people share. It opens a web page on our server that launches the app (asta://invite/...). */
export const inviteLink = (username: string) =>
  `${env.apiUrl}/invite/${encodeURIComponent(username)}`;
