import bcrypt from 'bcryptjs';

const COST = 12;
// bcrypt only looks at the first 72 bytes, so longer passwords are rejected at validation instead of
// being silently truncated.
export const MAX_PASSWORD_BYTES = 72;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

// Compared against when the email is unknown, so "no such user" and "wrong password" take the same
// time and an attacker cannot probe which emails are registered by timing the login endpoint.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', COST);

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
  return hash !== null && ok;
}
