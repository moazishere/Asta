import * as Location from 'expo-location';

import { ingestFixes } from './localDb';
import { LOCATION_TASK_NAME, toRawFix } from './locationTask';
import { isExpoGo } from './permissions';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

export type TrackingMode = 'background' | 'foreground';

// Sample by DISTANCE, not time: a fix is delivered only after moving ~8 m. That keeps the track
// dense while running, produces nothing while standing at a red light, and saves battery.
const DISTANCE_INTERVAL_M = 8;

let watcher: Location.LocationSubscription | null = null;

/**
 * Starts delivering GPS fixes into the local database.
 * - Development/production build: a background task (Android foreground service with a persistent
 *   notification, iOS background location with the blue status-bar pill) that keeps running with the
 *   screen off.
 * - Expo Go, or if the background task cannot start: a foreground watcher that only works while the
 *   app is open. The returned mode says which one is active.
 */
export async function startTracking(runId: string): Promise<TrackingMode> {
  await stopTracking();

  if (!isExpoGo) {
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: DISTANCE_INTERVAL_M,
        // timeInterval is Android-only; 1 s means "never wait", the distance filter does the throttling.
        timeInterval: 1000,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: t('run.notificationTitle'),
          notificationBody: t('run.notificationBody'),
          notificationColor: colors.accent,
        },
      });
      return 'background';
    } catch (err) {
      // e.g. only "While using" permission on iOS: fall back rather than failing the run.
      console.warn('Background tracking unavailable, using foreground tracking', err);
    }
  }

  watcher = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: DISTANCE_INTERVAL_M,
      timeInterval: 1000,
    },
    (location) => {
      void ingestFixes(runId, [toRawFix(location)]);
    },
  );
  return 'foreground';
}

export async function stopTracking(): Promise<void> {
  watcher?.remove();
  watcher = null;
  if (!isExpoGo) {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(
      () => false,
    );
    if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
