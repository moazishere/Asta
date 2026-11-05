import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';

/** Expo Go cannot run background location (it needs the app's own native build). */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export type Access = 'granted' | 'denied' | 'undetermined';

export type LocationAccess = {
  foreground: Access;
  background: Access;
  /** False after the user chose "don't ask again": only the system Settings can change it now. */
  canAskAgain: boolean;
};

const toAccess = (r: Location.LocationPermissionResponse): Access =>
  r.granted
    ? 'granted'
    : r.status === Location.PermissionStatus.UNDETERMINED
      ? 'undetermined'
      : 'denied';

export async function getLocationAccess(): Promise<LocationAccess> {
  const fg = await Location.getForegroundPermissionsAsync();
  // In Expo Go there is no background permission to ask for, so treat it as satisfied.
  const bg = isExpoGo ? null : await Location.getBackgroundPermissionsAsync().catch(() => null);
  return {
    foreground: toAccess(fg),
    background: isExpoGo ? 'granted' : bg ? toAccess(bg) : 'undetermined',
    canAskAgain: fg.canAskAgain,
  };
}

/** Step 1: "While using the app". Must come first; the OS refuses background without it. */
export async function requestForegroundAccess(): Promise<boolean> {
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

/** Step 2: "Always" (iOS) / "Allow all the time" (Android), asked separately with an explanation. */
export async function requestBackgroundAccess(): Promise<boolean> {
  if (isExpoGo) return true;
  try {
    return (await Location.requestBackgroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}
