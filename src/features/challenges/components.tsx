import { Pressable, StyleSheet, View } from 'react-native';

import { formatAmount, formatDuration, phaseAt, progress, unitKey } from './logic';
import type { ChallengeSummary, ChallengeType, LeaderboardEntry } from './types';
import { Avatar, Card, Chip, Icon, ProgressBar, Text, type IconName } from '@/components';
import { personName, useFriends } from '@/features/friends/hooks';
import { t } from '@/lib/i18n';
import { colors, radii, sizes, spacing } from '@/theme';

const typeIcon: Record<ChallengeType, IconName> = {
  distance: 'walk',
  run_count: 'repeat',
  kcal_streak: 'flame',
};

export const typeLabel = (type: ChallengeType) =>
  type === 'distance'
    ? t('challenges.typeDistance')
    : type === 'run_count'
      ? t('challenges.typeRuns')
      : t('challenges.typeCalories');

export const unitLabel = (type: ChallengeType) => t(unitKey(type));

const durationUnits = () => ({
  d: t('challenges.d'),
  h: t('challenges.h'),
  m: t('challenges.m'),
  lessThanMinute: t('challenges.lessThanMinute'),
});

/** "Ends in 2d 4h" / "Starts in 5h" / "Ended 3d ago", from the dates (not the server status). */
export function timeLabel(startsAt: string, endsAt: string, now: number): string {
  const { phase, ms } = phaseAt(startsAt, endsAt, now);
  const time = formatDuration(ms, durationUnits());
  return phase === 'upcoming'
    ? t('challenges.startsIn', { time })
    : phase === 'active'
      ? t('challenges.endsIn', { time })
      : t('challenges.endedAgo', { time });
}

export function TypeBadge({ type }: { type: ChallengeType }) {
  return (
    <View style={styles.typeBadge} accessibilityLabel={typeLabel(type)}>
      <Icon name={typeIcon[type]} color="accent" />
    </View>
  );
}

type CardProps = { challenge: ChallengeSummary; now: number; onPress: () => void };

// One challenge in a list: name, how I'm doing against the target, my rank and the time left.
export function ChallengeCard({ challenge: c, now, onPress }: CardProps) {
  const unit = unitLabel(c.type);
  const label = timeLabel(c.starts_at, c.ends_at, now);
  const started = phaseAt(c.starts_at, c.ends_at, now).phase !== 'upcoming';
  const creator = c.creator ? personName(c.creator) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.title}. ${label}`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <TypeBadge type={c.type} />
          <View style={styles.grow}>
            <Text variant="title" numberOfLines={1}>
              {c.title}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {[
                creator ? t('challenges.by', { name: creator }) : null,
                c.member_count ? t('challenges.members', { count: c.member_count }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {c.my_rank && c.member_count ? (
            <View style={styles.rank}>
              <Text variant="bodyStrong" color="onAccent">
                {t('challenges.rank', { rank: c.my_rank, count: c.member_count })}
              </Text>
            </View>
          ) : null}
        </View>

        {started ? <ProgressBar progress={progress(c.my_value, c.target_value)} /> : null}
        <View style={styles.rowBetween}>
          <Text variant="caption" color="textMuted">
            {started
              ? t('challenges.progressOf', {
                  value: formatAmount(c.type, c.my_value ?? 0),
                  target: formatAmount(c.type, c.target_value),
                  unit,
                })
              : `${formatAmount(c.type, c.target_value)} ${unit}`}
          </Text>
          <Text variant="caption" color="textMuted">
            {label}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

type InviteCardProps = {
  challenge: ChallengeSummary;
  onJoin: () => void;
  onDecline: () => void;
  onOpen: () => void;
};

export function InvitationCard({ challenge: c, onJoin, onDecline, onOpen }: InviteCardProps) {
  const inviter = c.creator ? personName(c.creator) : '';
  return (
    <Card style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.row}>
        <TypeBadge type={c.type} />
        <View style={styles.grow}>
          <Text variant="title" numberOfLines={1}>
            {c.title}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {inviter ? t('challenges.invitedBy', { name: inviter }) : typeLabel(c.type)} ·{' '}
            {formatAmount(c.type, c.target_value)} {unitLabel(c.type)}
          </Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Chip label={t('challenges.join')} selected onPress={onJoin} />
        <Chip label={t('challenges.decline')} onPress={onDecline} />
      </View>
    </Card>
  );
}

type RowProps = { entry: LeaderboardEntry; type: ChallengeType; isMe: boolean; isWinner: boolean };

// One line of the leaderboard. "Me" is outlined in lime; the winner of a finished challenge gets a trophy.
export function LeaderboardRow({ entry, type, isMe, isWinner }: RowProps) {
  const name = personName(entry.user);
  const value = `${formatAmount(type, entry.value)} ${unitLabel(type)}`;
  return (
    <View
      style={[styles.board, isMe && styles.boardMe]}
      accessible
      accessibilityLabel={`${entry.rank}. ${name}${isMe ? `, ${t('challenges.you')}` : ''}, ${value}`}
    >
      <View style={styles.rankSlot}>
        {isWinner ? (
          <Icon name="trophy" color="accent" />
        ) : (
          <Text variant="numeral" color={entry.rank === 1 ? 'accent' : 'textMuted'}>
            {entry.rank}
          </Text>
        )}
      </View>
      <Avatar name={name} uri={entry.user.avatar_url} size="avatarSm" ring={isMe} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        {isMe ? (
          <Text variant="caption" color="accent">
            {t('challenges.you')}
          </Text>
        ) : null}
      </View>
      <Text variant="title">{value}</Text>
    </View>
  );
}

type PickerProps = {
  selected: string[];
  onToggle: (userId: string) => void;
  /** Friends that should not be offered (already in the challenge). */
  exclude?: string[];
};

/** Tick-list of my accepted friends, for choosing who to invite. */
export function FriendPicker({ selected, onToggle, exclude = [] }: PickerProps) {
  const query = useFriends();
  const friends = (query.data?.friends ?? []).filter((f) => !exclude.includes(f.user.id));
  if (friends.length === 0) {
    return (
      <Text color="textMuted">
        {query.isPending ? t('common.loading') : t('challenges.noFriends')}
      </Text>
    );
  }
  return (
    <View style={styles.picker}>
      {friends.map((f) => {
        const on = selected.includes(f.user.id);
        const name = personName(f.user);
        return (
          <Pressable
            key={f.user.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={name}
            onPress={() => onToggle(f.user.id)}
            style={[styles.pick, on && styles.pickOn]}
          >
            <Avatar name={name} uri={f.user.avatar_url} size="avatarSm" />
            <Text variant="bodyStrong" style={styles.grow} numberOfLines={1}>
              {name}
            </Text>
            <Icon
              name={on ? 'checkmark-circle' : 'ellipse-outline'}
              color={on ? 'accent' : 'textMuted'}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grow: { flex: 1, gap: spacing.xxs },
  typeBadge: {
    width: sizes.avatarMd,
    height: sizes.avatarMd,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  actions: { flexDirection: 'row', gap: spacing.md },
  board: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  boardMe: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  rankSlot: { width: sizes.splitLabelWidth / 2, alignItems: 'center' },
  picker: { gap: spacing.sm },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  pickOn: { borderColor: colors.accent },
});
