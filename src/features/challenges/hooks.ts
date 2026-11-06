import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import type { ChallengeDetail, ChallengeSummary, ChallengeType } from './types';
import { ApiError, apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';

export function useChallenges() {
  return useQuery({
    queryKey: ['challenges', 'list'],
    queryFn: async () =>
      (await apiFetch<{ challenges: ChallengeSummary[] }>('/challenges')).challenges,
    // Live hints keep this fresh; a short stale time also covers a missed one.
    staleTime: 15_000,
  });
}

export function useChallenge(id: string) {
  return useQuery({
    queryKey: ['challenges', 'detail', id],
    queryFn: () => apiFetch<ChallengeDetail>(`/challenges/${encodeURIComponent(id)}`),
    retry: false,
    staleTime: 10_000,
  });
}

/** Current time, refreshed on an interval: drives the "ends in 2d 4h" countdowns. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['challenges'] });
}

// The server is the only source of truth for membership and scores, so these refetch afterwards instead
// of guessing the new state.
function useChallengeAction<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: invalidate,
    onError: (err) => {
      const message =
        err instanceof ApiError && err.code === 'challenge_ended'
          ? err.message
          : err instanceof ApiError && err.code === 'invalid_challenge'
            ? err.message
            : t('common.genericError');
      Alert.alert(message);
    },
  });
}

export type NewChallenge = {
  title: string;
  type: ChallengeType;
  /** Metres for distance, runs for run_count, days for kcal_streak. */
  target_value: number;
  starts_at: string;
  ends_at: string;
  invite_user_ids: string[];
};

export const useCreateChallenge = () =>
  useChallengeAction((body: NewChallenge) =>
    apiFetch<{ id: string; status: string; invited: number }>('/challenges', {
      method: 'POST',
      body,
    }),
  );
export const useJoinChallenge = () =>
  useChallengeAction((id: string) =>
    apiFetch(`/challenges/${encodeURIComponent(id)}/join`, { method: 'POST' }),
  );
export const useDeclineChallenge = () =>
  useChallengeAction((id: string) =>
    apiFetch(`/challenges/${encodeURIComponent(id)}/decline`, { method: 'POST' }),
  );
export const useLeaveChallenge = () =>
  useChallengeAction((id: string) =>
    apiFetch(`/challenges/${encodeURIComponent(id)}/leave`, { method: 'POST' }),
  );
export const useDeleteChallenge = () =>
  useChallengeAction((id: string) =>
    apiFetch(`/challenges/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
export const useInviteToChallenge = () =>
  useChallengeAction(({ id, userIds }: { id: string; userIds: string[] }) =>
    apiFetch<{ invited: number }>(`/challenges/${encodeURIComponent(id)}/invites`, {
      method: 'POST',
      body: { user_ids: userIds },
    }),
  );
