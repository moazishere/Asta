import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Card,
  ErrorView,
  Icon,
  LoadingView,
  ProgressRing,
  Screen,
  SectionHeader,
  StartBar,
  StatRow,
  Text,
} from '@/components';
import { useProfile } from '@/features/auth/useProfile';
import { useDay } from '@/features/food/hooks';
import { goalProgress, kcalRemaining, todayIn } from '@/features/food/nutrition';
import { useRecentRuns, useWeeklyStats } from '@/features/history/hooks';
import { historyHref, runHref } from '@/features/history/routes';
import { RunListItem } from '@/features/history/RunListItem';
import { percentChange } from '@/features/history/stats';
import { WeekChart } from '@/features/history/WeekChart';
import { formatDuration, formatKm, formatPace, paceSecPerKm } from '@/features/run/geo';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

export default function Home() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const name = profile?.display_name ?? profile?.username ?? '';
  const goal = profile?.daily_kcal_goal ?? 0;

  return (
    <Screen withTabBar>
      <View style={styles.stack}>
        <View style={styles.header}>
          <Avatar name={name} uri={profile?.avatar_url} ring />
          <Text variant="h1">{t('home.greeting', { name })}</Text>
        </View>

        <SectionHeader title={t('home.thisWeek')} />
        <WeeklySummary />

        <SectionHeader
          title={t('home.recent')}
          actionLabel={t('home.seeAll')}
          onAction={() => router.push(historyHref)}
        />
        <RecentRuns timeZone={profile?.timezone} onOpen={(id) => router.push(runHref(id))} />

        <TodayCalories goal={goal} timeZone={profile?.timezone} />

        <StartBar label={t('home.startRun')} onPress={() => router.navigate('/run')} />
      </View>
    </Screen>
  );
}

// Today's calories: live from the food log, so it matches the Food tab exactly.
function TodayCalories({ goal, timeZone }: { goal: number; timeZone?: string }) {
  const query = useDay(todayIn(timeZone));
  const consumed = query.data?.totals.kcal ?? 0;
  const left = kcalRemaining(goal, consumed);
  return (
    <Card style={styles.kcal}>
      <ProgressRing progress={goalProgress(goal, consumed)} size={96} strokeWidth={10}>
        <Text variant="numeral">{consumed}</Text>
      </ProgressRing>
      <View style={styles.kcalText}>
        <Text variant="title">{t('home.todayCalories')}</Text>
        <Text variant="caption" color="textMuted">
          {t('food.consumed', { goal })}
        </Text>
        {left !== null ? (
          <Text variant="caption" color={left < 0 ? 'danger' : 'textMuted'}>
            {left >= 0 ? t('food.kcalLeft', { kcal: left }) : t('food.kcalOver', { kcal: -left })}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function WeeklySummary() {
  const query = useWeeklyStats();

  if (query.isPending)
    return (
      <Card>
        <LoadingView />
      </Card>
    );
  if (query.isError) {
    return (
      <Card>
        <ErrorView message={t('home.weekError')} onRetry={() => void query.refetch()} />
      </Card>
    );
  }

  const { thisWeek, lastWeek, days, today } = query.data;
  const change = percentChange(thisWeek.distance_m, lastWeek.distance_m);
  const avgPace = paceSecPerKm(thisWeek.distance_m, thisWeek.moving_time_s * 1000);

  // Compared with the whole previous week. Hidden entirely when both weeks are empty.
  let comparison: {
    icon: 'trending-up' | 'trending-down' | 'remove';
    text: string;
    up: boolean;
  } | null = null;
  if (lastWeek.distance_m <= 0) {
    if (thisWeek.distance_m > 0)
      comparison = { icon: 'remove', text: t('home.noRunsLastWeek'), up: false };
  } else if (change !== null) {
    comparison =
      change > 0
        ? { icon: 'trending-up', text: t('home.changeUp', { pct: change }), up: true }
        : change < 0
          ? {
              icon: 'trending-down',
              text: t('home.changeDown', { pct: Math.abs(change) }),
              up: false,
            }
          : { icon: 'remove', text: t('home.changeSame'), up: false };
  }

  return (
    <View style={styles.stack}>
      <Card style={styles.weekCard}>
        <Text variant="label" color="textMuted">
          {t('home.distance')}
        </Text>
        <View style={styles.distanceRow}>
          <Text variant="numeralLg">{formatKm(thisWeek.distance_m)}</Text>
          <Text variant="title" color="textMuted">
            {t('units.km')}
          </Text>
        </View>
        {comparison ? (
          <View style={styles.comparison}>
            <Icon
              name={comparison.icon}
              size="iconSm"
              color={comparison.up ? 'accent' : 'textMuted'}
            />
            <Text variant="caption" color={comparison.up ? 'accent' : 'textMuted'}>
              {comparison.text}
            </Text>
          </View>
        ) : null}
        <WeekChart days={days} today={today} />
      </Card>
      <StatRow
        stats={[
          { label: t('home.runs'), value: String(thisWeek.runs) },
          { label: t('home.time'), value: formatDuration(thisWeek.moving_time_s) },
          { label: t('home.avgPace'), value: formatPace(avgPace), unit: t('units.paceShort') },
        ]}
      />
    </View>
  );
}

function RecentRuns({ timeZone, onOpen }: { timeZone?: string; onOpen: (id: string) => void }) {
  const query = useRecentRuns();

  if (query.isPending) return <LoadingView />;
  if (query.isError) {
    return <ErrorView message={t('home.recentError')} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <Card>
        <Text color="textMuted">{t('home.noRunsYet')}</Text>
      </Card>
    );
  }
  return (
    <View style={styles.list}>
      {query.data.items.map((run) => (
        <RunListItem key={run.id} run={run} timeZone={timeZone} onPress={() => onOpen(run.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weekCard: { gap: spacing.md },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  comparison: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  list: { gap: spacing.md },
  kcal: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  kcalText: { gap: spacing.xs },
});
