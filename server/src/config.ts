import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['require', 'disable']).default('require'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_S: z.coerce
    .number()
    .int()
    .default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  PUBLIC_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APP_REDIRECT_SCHEMES: z.string().default('asta'),
  APP_STORE_URL: z.string().url().optional().or(z.literal('')),
  PLAY_STORE_URL: z.string().url().optional().or(z.literal('')),
});

export type Config = {
  port: number;
  databaseUrl: string;
  databaseSsl: boolean;
  jwtSecret: string;
  accessTokenTtlS: number;
  refreshTokenTtlDays: number;
  publicUrl?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  appRedirectSchemes: string[];
  /** Where the invite page sends people who do not have the app yet (optional). */
  appStoreUrl?: string;
  playStoreUrl?: string;
  /** Brute-force limits on /auth. Tests turn this off. */
  rateLimit: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ');
    throw new Error(`Invalid environment:\n  ${problems}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    databaseSsl: e.DATABASE_SSL === 'require',
    jwtSecret: e.JWT_SECRET,
    accessTokenTtlS: e.ACCESS_TOKEN_TTL_S,
    refreshTokenTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
    publicUrl: e.PUBLIC_URL,
    googleClientId: e.GOOGLE_CLIENT_ID || undefined,
    googleClientSecret: e.GOOGLE_CLIENT_SECRET || undefined,
    appRedirectSchemes: e.APP_REDIRECT_SCHEMES.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    appStoreUrl: e.APP_STORE_URL || undefined,
    playStoreUrl: e.PLAY_STORE_URL || undefined,
    rateLimit: true,
  };
}
