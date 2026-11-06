import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatRunDate, formatRunTime } from './format';
import { RouteThumbnail } from './RouteThumbnail';
import type { RunSummary } from './types';
import { Icon, Text } from '@/components';
import { formatDuration, formatKm, formatPace } from '@/features/run/geo';
import { t } from '@/lib/i18n';
import { colors, radii, spacing } from '@/theme';

type Props = { run: RunSummary; timeZone?: string; onPress?: () => void };

function RunListItemBase({ run, timeZone, onPress }: Props) {
  const date = formatRunDate(run.started_at, timeZone);
  const time = formatRunTime(run.started_at, timeZone);
  const pace = `${formatPace(run.avg_pace_s_per_km)} ${t('units.paceShort')}`;
  const duration = formatDuration(run.moving_time_s);
  const distance = `${formatKm(run.distance_m)} ${t('units.km')}`;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      disabled={!onPress}
      accessibilityLabel={t('history.itemLabel', { date, time, distance, duration, pace })}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <RouteThumbnail route={run.route_polyline} />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {date}
          </Text>
          {run.suspicious ? <Icon name="warning-outline" size="iconSm" color="danger" /> : null}
        </View>
        <Text variant="caption" color="textMuted">
          {time} · {duration} · {pace}
        </Text>
      </View>
      <Text variant="numeral">{distance}</Text>
    </Pressable>
  );
}

// Rows re-render only when their own run changes, which keeps long infinite lists smooth.
export const RunListItem = memo(RunListItemBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  text: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
