import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { colors, radii, spacing } from '@/theme';

type Stat = { label: string; value: string; unit?: string };

// One metric: small muted label above a big tabular numeral ("Duration" / "01:15:42").
export function StatTile({ label, value, unit }: Stat) {
  return (
    <View
      style={styles.tile}
      accessible
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
    >
      <Text variant="label" color="textMuted">
        {label}
      </Text>
      <View style={styles.valueRow}>
        <Text variant="numeral">{value}</Text>
        {unit ? (
          <Text variant="caption" color="textMuted">
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// The dark rounded strip with three metrics separated by hairlines (Duration | Avg Pace | Calories).
export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <View style={styles.row}>
      {stats.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 ? <View style={styles.divider} /> : null}
          <StatTile {...s} />
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  tile: { flex: 1, gap: spacing.xs, alignItems: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
});
