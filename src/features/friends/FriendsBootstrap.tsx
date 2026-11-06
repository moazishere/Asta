import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { usePendingInvite } from './pendingInvite';
import { useRealtime } from './realtime';
import { inviteHref } from './routes';

/**
 * Mounted once while the user is fully signed in. It keeps the live-updates connection open and, if an
 * invite link was opened before sign-in, takes the user to it now that they can act on it.
 */
export function FriendsBootstrap() {
  const router = useRouter();
  useRealtime(true);

  const username = usePendingInvite((s) => s.username);
  const clear = usePendingInvite((s) => s.clear);
  useEffect(() => {
    if (!username) return;
    clear();
    router.push(inviteHref(username));
  }, [username, clear, router]);

  return null;
}
