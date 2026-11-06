import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getPermission, requestPermission, type PermissionState } from './push';
import { apiFetch } from '@/lib/api';
import { showToast } from '@/lib/toast';
import { t } from '@/lib/i18n';

export type NotificationSettings = {
  friend_requests: boolean;
  challenge_invites: boolean;
  leaderboard_passed: boolean;
  challenge_ended: boolean;
};

const key = ['notifications', 'settings'] as const;

export function useNotificationSettings() {
  return useQuery({
    queryKey: key,
    queryFn: () => apiFetch<NotificationSettings>('/push/settings'),
  });
}

/** A switch changes instantly on screen; if the server refuses, it flips back and a toast says so. */
export function useUpdateNotificationSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationSettings>) =>
      apiFetch<NotificationSettings>('/push/settings', { method: 'PATCH', body: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NotificationSettings>(key);
      if (previous) qc.setQueryData(key, { ...previous, ...patch });
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      showToast(t('common.saveFailed'), 'error');
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

/** The phone's notification permission, refreshed when the app returns from the system Settings. */
export function usePermission() {
  const [state, setState] = useState<PermissionState | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      void getPermission().then((p) => {
        if (!cancelled) setState(p);
      });
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  const ask = useCallback(async () => {
    await requestPermission();
    setState(await getPermission());
  }, []);
  return { state, ask };
}
