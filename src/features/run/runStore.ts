import { create } from 'zustand';

import type { LatLng } from './geo';
import type { TrackingMode } from './tracking';

export type LivePhase = 'idle' | 'active' | 'paused';

// In-memory mirror of the run in progress, only for rendering. The database is the source of truth:
// this is rebuilt from it (hydrate/refreshLive), never the other way around.
export type LiveRun = {
  phase: LivePhase;
  runId: string | null;
  startedAt: number;
  pausedTotalMs: number;
  pauseStartedAt: number | null;
  distanceM: number;
  movingMs: number;
  weightKg: number;
  /** Time and accuracy of the latest fix, for the GPS signal indicator. */
  fixAt: number | null;
  fixAcc: number | null;
  route: LatLng[];
  lastSeq: number;
  mode: TrackingMode | null;
};

const idle: LiveRun = {
  phase: 'idle',
  runId: null,
  startedAt: 0,
  pausedTotalMs: 0,
  pauseStartedAt: null,
  distanceM: 0,
  movingMs: 0,
  weightKg: 70,
  fixAt: null,
  fixAcc: null,
  route: [],
  lastSeq: -1,
  mode: null,
};

type Store = LiveRun & { apply: (patch: Partial<LiveRun>) => void; reset: () => void };

export const useRunStore = create<Store>((set) => ({
  ...idle,
  apply: (patch) => set(patch),
  reset: () => set(idle),
}));
