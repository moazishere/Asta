import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { formatRunDate, formatRunTime } from './format';
import { useDeleteRun, useRun } from './hooks';
import { decodePolyline, speedRatios } from './stats';
import type { Split } from './types';
import {
  Button,
  Card,
  EmptyView,
  ErrorView,
  LoadingView,
  ProgressBar,
  Screen,
  ScreenHeader,
  StatRow,
  Text,
} from '@/components';
import { useProfile } from '@/features/auth/useProfile';
import { formatDuration, formatKm, formatPace } from '@/features/run/geo';
import { RunMap } from '@/features/run/RunMap';
import { ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';
import { radii, sizes, spacing } from '@/theme';

export function RunDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: profile } = useProfile();
  const query = useRun(id);
  const remove = useDeleteRun();

  const run = query.data;
  const route = useMemo(
    () => (run?.route_polyline ? decodePolyline(run.route_polyline) : []),
    [run],
  );
  const ratios = useMemo(() => speedRatios((run?.splits ?? []).map((s) => s.pace_s_per_km)), [run]);

  const timeZone = profile?.timezone;
  const title = run ? formatRunDate(run.started_at, timeZone) : t('history.title');
  const back = () => router.back();

  function confirmDelete() {
    Alert.alert(t('detail.deleteTitle'), t('detail.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('detail.deleteConfirm'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: back,
            onError: () => Alert.alert(t('detail.deleteError')),
          }),
      },
    ]);
  }

  if (query.isPending) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title={title} onBack={back} />
        <LoadingView />
      </Screen>
    );
  }

  if (query.isError || !run) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Screen scroll={false}>
        <ScreenHeader title={title} onBack={back} />
        {missing ? (
          <EmptyView icon="trash-outline" title={t('detail.notFound')} />
        ) : (
          <ErrorView message={t('detail.error')} onRetry={() => void query.refetch()} />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.stack}>
        <ScreenHeader title={title} onBack={back} />
        <Text variant="caption" color="textMuted" style={styles.center}>
          {formatRunTime(run.started_at, timeZone)}
        </Text>

        <View style={styles.map}>
          <RunMap route={route} fitRoute />
        </View>

        <Card style={styles.distanceCard}>
          <Text variant="label" color="textMuted">
            {t('run.distance')}
          </Text>
          <View style={styles.distanceRow}>
            <Text variant="numeralLg">{formatKm(run.distance_m)}</Text>
            <Text variant="title" color="textMuted">
              {t('units.km')}
            </Text>
          </View>
        </Card>

        <StatRow
          stats={[
            { label: t('summary.moving'), value: formatDuration(run.moving_time_s) },
            {
              label: t('run.pace'),
              value: formatPace(run.avg_pace_s_per_km),
              unit: t('units.paceShort'),
            },
            { label: t('run.calories'), value: String(run.kcal_est ?? 0), unit: t('units.kcal') },
          ]}
        />
        <Text variant="caption" color="textMuted" style={styles.center}>
          {t('summary.estimateNote')}
        </Text>
        {run.suspicious ? (
          <Text variant="caption" color="danger" style={styles.center}>
            {t('summary.suspicious')}
          </Text>
        ) : null}

        {run.splits.length > 0 ? (
          <View style={styles.splits}>
            <Text variant="h2">{t('detail.splits')}</Text>
            <Text variant="caption" color="textMuted">
              {t('detail.splitsHint')}
            </Text>
            {run.splits.map((s, i) => (
              <SplitRow key={s.km} split={s} ratio={ratios[i] ?? 0} />
            ))}
          </View>
        ) : null}

        <Button
          label={t('detail.delete')}
          variant="danger"
          onPress={confirmDelete}
          loading={remove.isPending}
        />
      </View>
    </Screen>
  );
}

function SplitRow({ split, ratio }: { split: Split; ratio: number }) {
  const full = split.distance_m >= 999;
  const label = full
    ? String(split.km)
    : t('detail.splitPartial', { km: formatKm(split.distance_m) });
  const pace = `${formatPace(split.pace_s_per_km)} ${t('units.paceShort')}`;
  return (
    <View
      style={styles.splitRow}
      accessible
      accessibilityLabel={`${t('units.km')} ${label}: ${pace}`}
    >
      <Text variant="bodyStrong" style={styles.splitLabel}>
        {label}
      </Text>
      <View style={styles.splitBar}>
        <ProgressBar progress={ratio} height={spacing.md} />
      </View>
      <Text variant="bodyStrong" style={styles.splitPace}>
        {pace}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  center: { textAlign: 'center' },
  map: { height: sizes.mapMinHeight * 1.3, borderRadius: radii.lg, overflow: 'hidden' },
  distanceCard: { gap: spacing.xs, alignItems: 'center' },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  splits: { gap: spacing.md },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  splitLabel: { width: sizes.splitLabelWidth },
  splitBar: { flex: 1 },
  splitPace: { width: sizes.splitPaceWidth, textAlign: 'right' },
});
