import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import type { FriendProfile, FriendsOverview, LookupResult, PersonCard } from './types';
import { ApiError, apiFetch } from '@/lib/api';
import { t, type StringKey } from '@/lib/i18n';

export const personName = (p: Pick<PersonCard, 'display_name' | 'username'>) =>
  p.display_name || p.username;

export function useFriends() {
  return useQuery({
    queryKey: ['friends', 'overview'],
    queryFn: () => apiFetch<FriendsOverview>('/friends'),
    // Realtime pushes keep this fresh; a short stale time also covers a missed push.
    staleTime: 15_000,
  });
}

/** How many people are waiting for me to accept: drives the badges. */
export function useIncomingCount(): number {
  return useFriends().data?.incoming.length ?? 0;
}

export function useLookup(username: string) {
  return useQuery({
    queryKey: ['friends', 'lookup', username],
    queryFn: () =>
      apiFetch<LookupResult>(`/friends/lookup?username=${encodeURIComponent(username)}`),
    enabled: username.length > 0,
    retry: false, // a 404 ("no such user") is an answer, not a failure to retry
  });
}

export function useFriendProfile(id: string) {
  return useQuery({
    queryKey: ['friends', 'profile', id],
    queryFn: () => apiFetch<FriendProfile>(`/friends/${encodeURIComponent(id)}/profile`),
    retry: false,
  });
}

const errorKeys: Record<string, StringKey> = {
  already_requested: 'friends.errorAlreadyRequested',
  already_friends: 'friends.errorAlreadyFriends',
  you_blocked_them: 'friends.errorYouBlocked',
  user_not_found: 'friends.errorNotFound',
  too_many_requests: 'friends.errorTooMany',
  network_error: 'auth.errorNetwork',
};

export function friendsErrorMessage(err: unknown): string {
  return err instanceof ApiError
    ? t(errorKeys[err.code] ?? 'common.genericError')
    : t('common.genericError');
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['friends'] });
}

// Every action refreshes the friends data afterwards (and the other person's app is told live).
// Failures are shown as an alert; the server is the only source of truth, so there is nothing to undo.
function useFriendAction<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: invalidate,
    onError: (err) => Alert.alert(friendsErrorMessage(err)),
  });
}

export const useSendRequest = () =>
  useFriendAction((username: string) =>
    apiFetch('/friends/requests', { method: 'POST', body: { username } }),
  );
export const useAcceptRequest = () =>
  useFriendAction((id: string) =>
    apiFetch(`/friends/requests/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
  );
export const useDeclineRequest = () =>
  useFriendAction((id: string) =>
    apiFetch(`/friends/requests/${encodeURIComponent(id)}/decline`, { method: 'POST' }),
  );
export const useCancelRequest = () =>
  useFriendAction((id: string) =>
    apiFetch(`/friends/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
export const useRemoveFriend = () =>
  useFriendAction((friendshipId: string) =>
    apiFetch(`/friends/${encodeURIComponent(friendshipId)}`, { method: 'DELETE' }),
  );
export const useBlockUser = () =>
  useFriendAction((userId: string) =>
    apiFetch('/friends/block', { method: 'POST', body: { user_id: userId } }),
  );
export const useUnblockUser = () =>
  useFriendAction((userId: string) =>
    apiFetch(`/friends/block/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  );
