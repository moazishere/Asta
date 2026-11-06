import { randomBytes } from 'node:crypto';

import { Router } from 'express';

import type { Config } from '../config.js';
import { renderInvitePage, USERNAME_PATTERN } from '../lib/invitePage.js';

// Public page behind the invite links people share (https://<server>/invite/<username>). It makes no
// database lookup, so it cannot be used to find out which usernames exist; the app does the real check.
export function inviteRouter({ config }: { config: Config }) {
  const router = Router();

  router.get('/:username', (req, res) => {
    const username = req.params.username.toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    const nonce = randomBytes(16).toString('base64');
    // The default helmet policy forbids inline script/style; this page needs one of each, so allow
    // exactly those two blocks via a one-time nonce and nothing else.
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'`,
    );
    res.type('html').send(
      renderInvitePage({
        username,
        scheme: config.appRedirectSchemes[0] ?? 'asta',
        appStoreUrl: config.appStoreUrl,
        playStoreUrl: config.playStoreUrl,
        nonce,
      }),
    );
  });

  return router;
}
