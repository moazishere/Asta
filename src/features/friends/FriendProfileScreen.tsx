import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { personName, useBlockUser, useFriendProfile, useRemoveFriend } from './hooks';
import type { FriendRun } from './types';
import {
  Avatar,
  Button,
  EmptyView,
  ErrorView,
  LoadingView,
  Screen,
  ScreenHeader,
  StatRow,
  Text,
} from '@/components';
import { useProfile } from '@/features/auth/useProfile';
import { RunListItem } from '@/features/history/RunListItem';
import type { RunSummary } from '@/features/history/types';
import { formatDuration, formatKm } from '@/features/run/geo';
import { ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

// A friend's runs as the app shows them: the SAME list row as your own history, but built from the
// friend view of the data, which only has the trimmed route (no calories, GPS points or flags).
const asSummary = (r: FriendRun): RunSummary => ({
  ...r,
  kcal_est: null,
  suspicious: false,
  route_polyline: r.route_polyline_public,
});

export function FriendProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: me } = useProfile();
  const query = useFriendProfile(id);
  const remove = useRemoveFriend();
  const block = useBlockUser();
  const back = () => router.back();

  if (query.isPending) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('friends.title')} onBack={back} />
        <LoadingView />
      </Screen>
    );
  }
  if (query.isError) {
    const gone = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('friends.title')} onBack={back} />
        {gone ? (
          <EmptyView icon="person-remove-outline" title={t('friends.profileGone')} />
        ) : (
          <ErrorView message={t('friends.profileError')} onRetry={() => void query.refetch()} />
        )}
      </Screen>
    );
  }

  const { user, friendship_id, week_distance_m, week_runs, runs } = query.data;
  const name = personName(user);
  const totalS = runs.reduce((sum, r) => sum + r.moving_time_s, 0);

  function confirmRemove() {
    Alert.alert(t('friends.removeTitle', { name }), t('friends.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('friends.remove'),
        style: 'destructive',
        onPress: () => remove.mutate(friendship_id, { onSuccess: back }),
      },
    ]);
  }

  function confirmBlock() {
    Alert.alert(t('friends.blockTitle', { name }), t('friends.blockBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('friends.block'),
        style: 'destructive',
        onPress: () => block.mutate(user.id, { onSuccess: back }),
      },
    ]);
  }

  return (
    <Screen>
      <View style={styles.stack}>
        <ScreenHeader title={name} onBack={back} />

        <View style={styles.head}>
          <Avatar name={name} uri={user.avatar_url} size="avatarLg" ring />
          <Text variant="h1">{name}</Text>
          <Text color="textMuted">@{user.username}</Text>
        </View>

        <StatRow
          stats={[
            { label: t('friends.thisWeek'), value: formatKm(week_distance_m), unit: t('units.km') },
            { label: t('home.runs'), value: String(week_runs) },
            { label: t('home.time'), value: formatDuration(totalS) },
          ]}
        />

        <View style={styles.runs}>
          <Text variant="h2">{t('friends.recentRuns')}</Text>
          {runs.length === 0 ? (
            <Text color="textMuted">{t('friends.noRuns')}</Text>
          ) : (
            <>
              {runs.map((r) => (
                <RunListItem key={r.id} run={asSummary(r)} timeZone={me?.timezone} />
              ))}
              <Text variant="caption" color="textMuted">
                {t('friends.routeNote')}
              </Text>
            </>
          )}
        </View>

        <Button
          label={t('friends.remove')}
          variant="danger"
          onPress={confirmRemove}
          loading={remove.isPending}
        />
        <Button
          label={t('friends.block')}
          variant="ghost"
          onPress={confirmBlock}
          loading={block.isPending}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xl },
  head: { alignItems: 'center', gap: spacing.sm },
  runs: { gap: spacing.md },
});
