import { useRouter } from 'expo-router';
import { Linking, StyleSheet, Switch, View } from 'react-native';

import {
  useNotificationSettings,
  usePermission,
  useUpdateNotificationSetting,
  type NotificationSettings,
} from './hooks';
import {
  Button,
  Card,
  ErrorView,
  Icon,
  Screen,
  ScreenHeader,
  SkeletonList,
  Text,
} from '@/components';
import { selectionHaptic } from '@/lib/haptics';
import { t, type StringKey } from '@/lib/i18n';
import { colors, radii, spacing } from '@/theme';

const ROWS: { key: keyof NotificationSettings; title: StringKey; body: StringKey }[] = [
  {
    key: 'friend_requests',
    title: 'notifications.friendRequests',
    body: 'notifications.friendRequestsBody',
  },
  {
    key: 'challenge_invites',
    title: 'notifications.challengeInvites',
    body: 'notifications.challengeInvitesBody',
  },
  {
    key: 'leaderboard_passed',
    title: 'notifications.leaderboardPassed',
    body: 'notifications.leaderboardPassedBody',
  },
  {
    key: 'challenge_ended',
    title: 'notifications.challengeEnded',
    body: 'notifications.challengeEndedBody',
  },
];

export function NotificationSettingsScreen() {
  const router = useRouter();
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSetting();
  const permission = usePermission();

  return (
    <Screen>
      <View style={styles.stack}>
        <ScreenHeader title={t('notifications.title')} onBack={() => router.back()} />

        {permission.state && permission.state !== 'granted' ? (
          <Card style={styles.card}>
            <Icon name="notifications-off-outline" size="iconLg" color="textMuted" />
            <Text variant="h2">{t('notifications.offTitle')}</Text>
            <Text color="textMuted">
              {permission.state === 'denied'
                ? t('notifications.deniedBody')
                : t('notifications.offBody')}
            </Text>
            {permission.state === 'denied' ? (
              <Button
                label={t('run.permissionOpenSettings')}
                onPress={() => void Linking.openSettings()}
              />
            ) : (
              <Button label={t('notifications.turnOn')} onPress={() => void permission.ask()} />
            )}
          </Card>
        ) : null}

        {settings.isPending ? (
          <SkeletonList count={4} height={76} />
        ) : settings.isError ? (
          <ErrorView
            message={t('notifications.loadError')}
            onRetry={() => void settings.refetch()}
          />
        ) : (
          <View style={styles.list}>
            {ROWS.map((row) => (
              <View key={row.key} style={styles.row}>
                <View style={styles.text}>
                  <Text variant="bodyStrong">{t(row.title)}</Text>
                  <Text variant="caption" color="textMuted">
                    {t(row.body)}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel={t(row.title)}
                  value={settings.data[row.key]}
                  onValueChange={(value) => {
                    selectionHaptic();
                    update.mutate({ [row.key]: value });
                  }}
                  trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
                  thumbColor={colors.text}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xl },
  card: { gap: spacing.md },
  list: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  text: { flex: 1, gap: spacing.xs },
});
