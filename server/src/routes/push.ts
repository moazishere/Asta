import { Router } from 'express';
import { z } from 'zod';

import type { Db } from '../db.js';
import { HttpError } from '../errors.js';
import { currentUserId } from '../middleware/auth.js';
import { isPushToken } from '../push.js';

const tokenBody = z
  .object({
    token: z.string().min(1).max(200).refine(isPushToken, 'Not an Expo push token'),
    platform: z.enum(['ios', 'android']),
  })
  .strict();

const settingsPatch = z
  .object({
    friend_requests: z.boolean(),
    challenge_invites: z.boolean(),
    leaderboard_passed: z.boolean(),
    challenge_ended: z.boolean(),
  })
  .partial()
  .strict();

const SETTINGS = 'friend_requests, challenge_invites, leaderboard_passed, challenge_ended';
const DEFAULTS = {
  friend_requests: true,
  challenge_invites: true,
  leaderboard_passed: true,
  challenge_ended: true,
};

export function pushRouter({ db }: { db: Db }) {
  const router = Router();

  // Registers this device for push. A token belongs to ONE account: if the phone was signed in as someone
  // else before, the token moves to the current user (otherwise the old user would keep getting this
  // person's notifications). Runs as the service role only for that hand-over.
  router.put('/token', async (req, res) => {
    const me = currentUserId(req);
    const { token, platform } = tokenBody.parse(req.body);
    await db.asService(async (q) => {
      await q.query(`delete from push_tokens where token = $1 and user_id <> $2`, [token, me]);
      await q.query(
        `insert into push_tokens (user_id, token, platform) values ($1, $2, $3)
         on conflict (token) do update set platform = excluded.platform`,
        [me, token, platform],
      );
    });
    res.status(204).end();
  });

  // Called on sign-out so the phone stops receiving this account's notifications.
  router.delete('/token', async (req, res) => {
    const me = currentUserId(req);
    const { token } = z
      .object({ token: z.string().min(1).max(200) })
      .strict()
      .parse(req.body);
    await db.asUser(me, (q) => q.query(`delete from push_tokens where token = $1`, [token]));
    res.status(204).end();
  });

  router.get('/settings', async (req, res) => {
    const row = await db.asUser(currentUserId(req), async (q) => {
      const r = await q.query(`select ${SETTINGS} from notification_settings`);
      return r.rows[0];
    });
    res.json(row ?? DEFAULTS);
  });

  router.patch('/settings', async (req, res) => {
    const patch = settingsPatch.parse(req.body);
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (keys.length === 0) throw new HttpError(400, 'nothing_to_update');
    const row = await db.asUser(currentUserId(req), async (q) => {
      // Column names come from the strict zod schema's keys, never from raw input.
      const r = await q.query(
        `insert into notification_settings (user_id, ${keys.join(', ')})
         values (app.uid(), ${keys.map((_, i) => `$${i + 1}`).join(', ')})
         on conflict (user_id) do update set ${keys.map((k) => `${k} = excluded.${k}`).join(', ')}
         returning ${SETTINGS}`,
        keys.map((k) => patch[k]),
      );
      return r.rows[0];
    });
    res.json(row);
  });

  return router;
}
