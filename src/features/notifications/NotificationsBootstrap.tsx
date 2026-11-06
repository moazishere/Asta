import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { getPermission, registerForPush, requestPermission } from './push';
import { challengeHref } from '@/features/challenges/routes';
import { friendsHref } from '@/features/friends/routes';
import { t } from '@/lib/i18n';

const ASKED_KEY = 'asta.pushPromptShown';
// The notification the app was launched from, so the same tap is not handled twice.
let lastHandledId: string | null = null;

/**
 * Mounted once while the user is fully signed in:
 *  1. registers the phone for push (silently, if already allowed),
 *  2. asks for permission ONCE, with a friendly explanation first (the system prompt can only be shown
 *     once, so it is worth explaining why), and
 *  3. opens the right screen when a notification is tapped, including when it launched the app.
 */
export function NotificationsBootstrap() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await getPermission();
      if (state === 'granted') {
        await registerForPush();
        return;
      }
      if (state !== 'undetermined') return; // denied: the settings screen explains how to turn it on
      const shown = await SecureStore.getItemAsync(ASKED_KEY).catch(() => null);
      if (shown || cancelled) return;
      await SecureStore.setItemAsync(ASKED_KEY, '1').catch(() => undefined);
      Alert.alert(t('notifications.promptTitle'), t('notifications.promptBody'), [
        { text: t('notifications.promptLater'), style: 'cancel' },
        {
          text: t('notifications.turnOn'),
          onPress: async () => {
            if (await requestPermission()) await registerForPush();
          },
        },
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (id === lastHandledId) return;
      lastHandledId = id;
      const data = response.notification.request.content.data as { type?: string; id?: string };
      if (data.type === 'friend_request') router.push(friendsHref);
      else if (data.type === 'challenge' && data.id) router.push(challengeHref(data.id));
    };
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then((r) => r && open(r));
    return () => sub.remove();
  }, [router]);

  return null;
}
