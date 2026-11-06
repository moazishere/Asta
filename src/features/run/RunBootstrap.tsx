import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';

import { getUnfinishedRun, pruneOldRuns, type LocalRun } from './localDb';
import { refreshLive, resumeRecovered, saveRecovered } from './runController';
import { useRunStore } from './runStore';
import { syncPendingRuns } from './sync';
import { summaryHref } from './routes';
import { t } from '@/lib/i18n';
import { showToast } from '@/lib/toast';

/**
 * Mounted once while signed in. On app start it
 *  1. offers to resume or save a run that was interrupted (crash, kill, dead battery), and
 *  2. uploads runs that are still waiting (they were finished offline).
 * It uploads again whenever the app returns to the foreground.
 */
export function RunBootstrap() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function offerRecovery(run: LocalRun) {
      Alert.alert(
        t('run.recoverTitle'),
        t('run.recoverBody', { time: new Date(run.started_at).toLocaleTimeString() }),
        [
          {
            text: t('run.recoverSave'),
            onPress: async () => {
              const id = await saveRecovered(run);
              if (id) router.push(summaryHref(id));
              else showToast(t('run.tooShort'), 'info');
            },
          },
          { text: t('run.recoverResume'), onPress: () => void resumeRecovered(run) },
        ],
        { cancelable: false },
      );
    }

    (async () => {
      // A run already live in memory (app was only backgrounded) needs no recovery.
      if (useRunStore.getState().phase === 'idle') {
        const unfinished = await getUnfinishedRun();
        if (unfinished && !cancelled) await offerRecovery(unfinished);
      }
      await syncPendingRuns();
      await pruneOldRuns();
    })();

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refreshLive();
      void syncPendingRuns();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router]);

  return null;
}
