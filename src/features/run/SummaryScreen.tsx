import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatDuration, formatKm, formatPace, paceSecPerKm, type LatLng } from './geo';
import { getAcceptedPoints, getRun, type LocalRun } from './localDb';
import { RunMap } from './RunMap';
import { syncPendingRuns } from './sync';
import { Button, Card, Screen, StatRow, Text } from '@/components';
import { t } from '@/lib/i18n';
import { radii, sizes, spacing } from '@/theme';

const POLL_MS = 3000;

export function SummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<LocalRun | null | undefined>(undefined);
  const [route, setRoute] = useState<LatLng[]>([]);

  const load = useCallback(async () => {
    const next = await getRun(id);
    setRun(next);
    return next;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    getAcceptedPoints(id).then((points) => {
      if (!cancelled) setRoute(points.map((p) => ({ latitude: p.lat, longitude: p.lng })));
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // While the upload is pending, keep checking so the screen flips to "Saved" by itself.
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      void getRun(id).then((next) => {
        if (!cancelled) setRun(next);
      });
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  if (run === undefined) return <Screen scroll={false}>{null}</Screen>;
  if (run === null) {
    return (
      <Screen scroll={false}>
        <Text variant="h2">{t('summary.missing')}</Text>
        <Button label={t('summary.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const movingS = Math.floor(run.moving_ms / 1000);
  const pace = paceSecPerKm(run.distance_m, run.moving_ms);
  const status = run.uploaded_at ? 'saved' : run.upload_error ? 'failed' : 'pending';

  return (
    <Screen>
      <View style={styles.stack}>
        <Text variant="display">{t('summary.title')}</Text>

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
            { label: t('summary.moving'), value: formatDuration(movingS) },
            { label: t('run.pace'), value: formatPace(pace), unit: t('units.paceShort') },
            { label: t('run.calories'), value: String(run.kcal ?? 0), unit: t('units.kcal') },
          ]}
        />
        <Text variant="caption" color="textMuted">
          {t('summary.estimateNote')}
        </Text>

        {run.suspicious ? (
          <Text variant="caption" color="danger">
            {t('summary.suspicious')}
          </Text>
        ) : null}

        <Text
          variant="bodyStrong"
          color={status === 'saved' ? 'accent' : status === 'failed' ? 'danger' : 'textMuted'}
          accessibilityLiveRegion="polite"
        >
          {status === 'saved'
            ? t('summary.saved')
            : status === 'failed'
              ? t('summary.failed')
              : t('summary.pending')}
        </Text>
        {status === 'pending' ? (
          <Button
            label={t('summary.retry')}
            variant="ghost"
            onPress={async () => {
              await syncPendingRuns();
              await load();
            }}
          />
        ) : null}

        <Button label={t('summary.done')} onPress={() => router.dismissTo('/run')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  map: { height: sizes.mapMinHeight * 1.4, borderRadius: radii.lg, overflow: 'hidden' },
  distanceCard: { gap: spacing.xs, alignItems: 'center' },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
});
