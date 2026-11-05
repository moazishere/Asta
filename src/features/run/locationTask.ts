import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { getUnfinishedRun, ingestFixes } from './localDb';

export const LOCATION_TASK_NAME = 'asta-run-location';

export function toRawFix(l: LocationObject) {
  return {
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    t: l.timestamp,
    accuracy: l.coords.accuracy,
    alt: l.coords.altitude,
    spd: l.coords.speed,
  };
}

// Must be defined at module top level and imported when the app starts (see src/app/_layout.tsx): when
// the OS wakes the app in the background it runs this BEFORE any screen exists. It deliberately uses
// nothing but the database, so it works with the UI dead: the run it belongs to is whatever run is
// currently active on disk.
TaskManager.defineTask<{ locations: LocationObject[] }>(
  LOCATION_TASK_NAME,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const run = await getUnfinishedRun();
    if (!run || run.status !== 'active') return;
    await ingestFixes(run.id, data.locations.map(toRawFix));
  },
);
