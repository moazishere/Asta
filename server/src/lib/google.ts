import { OAuth2Client } from 'google-auth-library';

import type { Config } from '../config.js';

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

// Abstracted so tests can fake Google without network access.
export type GoogleClient = {
  configured: boolean;
  authUrl(state: string): string;
  exchangeCode(code: string): Promise<GoogleIdentity>;
};

export function createGoogleClient(config: Config): GoogleClient {
  const { googleClientId, googleClientSecret, publicUrl } = config;
  const configured = !!(googleClientId && googleClientSecret && publicUrl);
  const redirectUri = `${publicUrl}/auth/google/callback`;
  const oauth = new OAuth2Client(googleClientId, googleClientSecret, redirectUri);

  return {
    configured,
    authUrl: (state) =>
      oauth.generateAuthUrl({
        scope: ['openid', 'email', 'profile'],
        state,
        prompt: 'select_account',
        redirect_uri: redirectUri,
      }),
    async exchangeCode(code) {
      const { tokens } = await oauth.getToken({ code, redirect_uri: redirectUri });
      if (!tokens.id_token) throw new Error('Google did not return an id_token');
      // Verifies signature, issuer, expiry and that the audience is OUR client id.
      const ticket = await oauth.verifyIdToken({
        idToken: tokens.id_token,
        audience: googleClientId,
      });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) throw new Error('Google identity is missing sub/email');
      return {
        sub: p.sub,
        email: p.email.toLowerCase(),
        emailVerified: p.email_verified === true,
        name: p.name ?? null,
      };
    },
  };
}
