import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/api';
import { colors } from '@/theme';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

// Show notifications that arrive while the app is open (as a banner), instead of silently swallowing them.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted
    ? 'granted'
    : p.canAskAgain && p.status === 'undetermined'
      ? 'undetermined'
      : 'denied';
}

export async function requestPermission(): Promise<boolean> {
  return (await Notifications.requestPermissionsAsync()).granted;
}

let registeredToken: string | null = null;

/**
 * Registers this phone for push with the server. Returns the token, or null when it cannot happen:
 * simulators have no push, the user has not allowed notifications, or the app has no EAS project id yet
 * (run `eas init`). Failures are swallowed on purpose: push is a nice-to-have and must never break sign-in.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    if ((await getPermission()) !== 'granted') return null;

    // Android requires a channel before any notification can be shown (and from Android 8 the user can
    // tune it in system settings).
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Asta',
        importance: AndroidImportance.DEFAULT,
        lightColor: colors.accent,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      if (__DEV__) console.warn('Push disabled: no EAS projectId (run `npx eas-cli init`).');
      return null;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiFetch('/push/token', {
      method: 'PUT',
      body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
    registeredToken = token;
    return token;
  } catch (err) {
    if (__DEV__) console.warn('Push registration failed', err);
    return null;
  }
}

/** On sign-out: stop this phone receiving the account's notifications. Best effort. */
export async function unregisterPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await apiFetch('/push/token', { method: 'DELETE', body: { token } }).catch(() => undefined);
}
