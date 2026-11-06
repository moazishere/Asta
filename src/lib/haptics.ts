import * as Haptics from 'expo-haptics';

// Small physical confirmations at the moments that matter. Wrapped so a device without a haptic
// engine (or a failure) can never break the action that triggered it.
const run = (fn: () => Promise<void>) => void fn().catch(() => undefined);

/** A light tap: pressing the main buttons, pausing, switching tabs. */
export const tapHaptic = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
/** A firmer thump: starting or ending a run. */
export const heavyHaptic = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
/** Something good happened: saved, joined, accepted. */
export const successHaptic = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
/** Something went wrong. */
export const errorHaptic = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
/** Picking an option in a segmented control or list. */
export const selectionHaptic = () => run(() => Haptics.selectionAsync());
