import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

import type { Db } from './db.js';

// Push notifications through Expo's push service (it talks to Apple and Google for us). The sender is an
// interface so tests can record messages instead of sending them.

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  /** Opaque data the app uses to open the right screen when the notification is tapped. */
  data?: Record<string, string>;
};

export type PushSender = {
  /** Returns the tokens Expo says no longer work (app uninstalled, notifications disabled...). */
  send(messages: PushMessage[]): Promise<{ invalidTokens: string[] }>;
};

/** The four kinds a user can switch on or off. Each maps to one column of notification_settings. */
export type PushKind =
  'friend_requests' | 'challenge_invites' | 'leaderboard_passed' | 'challenge_ended';

// A whitelist: the column name below is interpolated into SQL, so it must never come from outside.
const COLUMN: Record<PushKind, string> = {
  friend_requests: 'friend_requests',
  challenge_invites: 'challenge_invites',
  leaderboard_passed: 'leaderboard_passed',
  challenge_ended: 'challenge_ended',
};

export const isPushToken = (token: string) => Expo.isExpoPushToken(token);

export function createExpoPushSender(): PushSender {
  const expo = new Expo();
  return {
    async send(messages) {
      const valid: ExpoPushMessage[] = messages
        .filter((m) => Expo.isExpoPushToken(m.to))
        .map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: m.data,
          sound: 'default',
          channelId: 'default',
        }));
      const invalidTokens: string[] = [];
      for (const chunk of expo.chunkPushNotifications(valid)) {
        try {
          const tickets = await expo.sendPushNotificationsAsync(chunk);
          tickets.forEach((ticket, i) => {
            if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
              const to = chunk[i]?.to;
              if (typeof to === 'string') invalidTokens.push(to);
            }
          });
        } catch (err) {
          console.error('push chunk failed', err);
        }
      }
      return { invalidTokens };
    },
  };
}

/** Sends nothing. For tools and environments without push. */
export const nullPushSender: PushSender = {
  async send() {
    return { invalidTokens: [] };
  },
};

/**
 * Sends one notification to all of a user's devices, if they have not switched that kind off. Never
 * throws: a failed push must not fail the request that caused it. Runs as the service role because
 * device tokens belong to the user and are only read here, server-side, to deliver.
 */
export async function pushToUser(
  db: Db,
  sender: PushSender,
  userId: string,
  kind: PushKind,
  content: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  try {
    const column = COLUMN[kind];
    const tokens = await db.asService(async (q) =>
      (
        await q.query<{ token: string }>(
          `select t.token from push_tokens t
           left join notification_settings s on s.user_id = t.user_id
           where t.user_id = $1 and coalesce(s.${column}, true)`,
          [userId],
        )
      ).rows.map((r) => r.token),
    );
    if (tokens.length === 0) return;

    const { invalidTokens } = await sender.send(tokens.map((to) => ({ to, ...content })));
    if (invalidTokens.length > 0) {
      await db.asService((q) =>
        q.query(`delete from push_tokens where token = any($1::text[])`, [invalidTokens]),
      );
    }
  } catch (err) {
    console.error('pushToUser failed', err);
  }
}

/** A friendly name for notification text: display name, else username. */
export async function displayNameOf(db: Db, userId: string): Promise<string> {
  const r = await db.asService((q) =>
    q.query<{ display_name: string | null; username: string }>(
      `select display_name, username from profiles where id = $1`,
      [userId],
    ),
  );
  return r.rows[0]?.display_name || r.rows[0]?.username || 'A friend';
}
