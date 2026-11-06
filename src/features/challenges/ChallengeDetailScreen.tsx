import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { FriendPicker, LeaderboardRow, timeLabel, typeLabel, unitLabel } from './components';
import {
  useChallenge,
  useDeclineChallenge,
  useDeleteChallenge,
  useInviteToChallenge,
  useJoinChallenge,
  useLeaveChallenge,
  useNow,
} from './hooks';
import { formatAmount, phaseAt, progress } from './logic';
import {
  Button,
  Card,
  EmptyView,
  ErrorView,
  Icon,
  LoadingView,
  ProgressRing,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { personName } from '@/features/friends/hooks';
import { ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';
import { showToast } from '@/lib/toast';
import { sizes, spacing } from '@/theme';

export function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useChallenge(id);
  const now = useNow();
  const join = useJoinChallenge();
  const decline = useDeclineChallenge();
  const leave = useLeaveChallenge();
  const remove = useDeleteChallenge();
  const invite = useInviteToChallenge();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/challenges'));

  if (query.isPending) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('challenges.title')} onBack={back} />
        <LoadingView />
      </Screen>
    );
  }
  if (query.isError) {
    const gone = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('challenges.title')} onBack={back} />
        {gone ? (
          <EmptyView icon="trophy-outline" title={t('challenges.notFound')} />
        ) : (
          <ErrorView message={t('challenges.detailError')} onRetry={() => void query.refetch()} />
        )}
      </Screen>
    );
  }

  const c = query.data;
  const { phase } = phaseAt(c.starts_at, c.ends_at, now);
  const started = phase !== 'upcoming';
  const unit = unitLabel(c.type);
  const joined = c.my_status === 'joined';
  const ended = c.status === 'ended' || phase === 'ended';
  const memberIds = c.leaderboard.map((r) => r.user.id);

  function confirmLeave() {
    Alert.alert(t('challenges.leaveTitle'), t('challenges.leaveBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('challenges.leave'),
        style: 'destructive',
        onPress: () => leave.mutate(c.id, { onSuccess: back }),
      },
    ]);
  }
  function confirmDelete() {
    Alert.alert(t('challenges.deleteTitle'), t('challenges.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('challenges.delete'),
        style: 'destructive',
        onPress: () => remove.mutate(c.id, { onSuccess: back }),
      },
    ]);
  }
  function sendInvites() {
    invite.mutate(
      { id: c.id, userIds: picked },
      {
        onSuccess: (result) => {
          setPicking(false);
          setPicked([]);
          showToast(t('challenges.inviteSent', { count: result.invited }), 'success');
        },
      },
    );
  }

  return (
    <Screen>
      <View style={styles.stack}>
        <ScreenHeader title={c.title} onBack={back} />

        <View style={styles.meta}>
          <Text color="textMuted">
            {typeLabel(c.type)} · {t('challenges.members', { count: c.member_count })}
            {c.creator ? ` · ${t('challenges.by', { name: personName(c.creator) })}` : ''}
          </Text>
          <Text variant="bodyStrong" color={phase === 'ended' ? 'textMuted' : 'accent'}>
            {timeLabel(c.starts_at, c.ends_at, now)}
          </Text>
        </View>

        {c.my_status === 'invited' ? (
          <Card style={styles.card}>
            <Text variant="h2">
              {t('challenges.invitedBy', { name: c.creator ? personName(c.creator) : '' })}
            </Text>
            <Text color="textMuted">{t('challenges.invitedOnly')}</Text>
            {!ended ? (
              <Button
                label={t('challenges.join')}
                onPress={() => join.mutate(c.id)}
                loading={join.isPending}
              />
            ) : null}
            <Button
              label={t('challenges.decline')}
              variant="ghost"
              onPress={() => decline.mutate(c.id, { onSuccess: back })}
            />
          </Card>
        ) : null}

        {joined ? (
          <Card style={styles.progress}>
            <ProgressRing
              progress={progress(c.my_value, c.target_value)}
              size={sizes.foodRing * 0.75}
              strokeWidth={14}
            >
              <Text variant="numeral">{formatAmount(c.type, c.my_value ?? 0)}</Text>
              <Text variant="caption" color="textMuted">
                / {formatAmount(c.type, c.target_value)} {unit}
              </Text>
            </ProgressRing>
            {c.my_rank && started ? (
              <Text variant="title">
                {t('challenges.rank', { rank: c.my_rank, count: c.member_count })}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {ended && joined ? (
          <Card style={styles.winner}>
            <Icon name="trophy" size="iconLg" color="accent" />
            <Text variant="h2">
              {c.winner ? personName(c.winner.user) : t('challenges.noWinner')}
            </Text>
            {c.winner ? (
              <Text color="textMuted">
                {t('challenges.winner')} · {formatAmount(c.type, c.winner.value)} {unit}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {joined ? (
          <View style={styles.board}>
            <Text variant="h2">{t('challenges.leaderboard')}</Text>
            {c.leaderboard.map((entry) => (
              <LeaderboardRow
                key={entry.user.id}
                entry={entry}
                type={c.type}
                isMe={entry.rank === c.my_rank}
                isWinner={ended && c.winner?.user.id === entry.user.id}
              />
            ))}
            <Text variant="caption" color="textMuted">
              {t('challenges.tieHint')}
            </Text>
          </View>
        ) : null}

        {c.is_creator && !ended ? (
          picking ? (
            <View style={styles.board}>
              <Text variant="h2">{t('challenges.inviteMore')}</Text>
              <FriendPicker
                selected={picked}
                onToggle={(uid) =>
                  setPicked((cur) =>
                    cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid],
                  )
                }
                exclude={memberIds}
              />
              <Button
                label={t('challenges.inviteFriends')}
                onPress={sendInvites}
                disabled={picked.length === 0}
                loading={invite.isPending}
              />
            </View>
          ) : (
            <Button
              label={t('challenges.inviteMore')}
              variant="dark"
              icon="person-add-outline"
              onPress={() => setPicking(true)}
            />
          )
        ) : null}

        {c.is_creator && c.status === 'draft' ? (
          <Button
            label={t('challenges.delete')}
            variant="danger"
            onPress={confirmDelete}
            loading={remove.isPending}
          />
        ) : null}
        {joined && !c.is_creator && !ended ? (
          <Button
            label={t('challenges.leave')}
            variant="ghost"
            onPress={confirmLeave}
            loading={leave.isPending}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xl },
  meta: { gap: spacing.xs, alignItems: 'center' },
  card: { gap: spacing.md },
  progress: { alignItems: 'center', gap: spacing.lg },
  winner: { alignItems: 'center', gap: spacing.sm },
  board: { gap: spacing.md },
});
