import { StyleSheet, View } from 'react-native';

import { weekdayLetter, weekdayName } from './format';
import { barHeights } from './stats';
import { Text } from '@/components';
import { formatKm } from '@/features/run/geo';
import { t } from '@/lib/i18n';
import { colors, radii, spacing } from '@/theme';

type Props = {
  days: { date: string; distance_m: number }[];
  /** YYYY-MM-DD of "today" in the user's time zone; that bar is highlighted. */
  today: string;
};

const CHART_HEIGHT = 96;

// Seven plain Views instead of a chart library. A distance-per-day bar chart needs no axes, tooltips
// or animation, so a charting dependency (react-native-svg based or Skia) would add weight and a
// native module for nothing; Views render identically on iOS and Android and stay accessible.
export function WeekChart({ days, today }: Props) {
  const heights = barHeights(
    days.map((d) => d.distance_m),
    CHART_HEIGHT,
  );
  const summary = days
    .map((d) => `${weekdayName(d.date)} ${formatKm(d.distance_m)} ${t('units.km')}`)
    .join(', ');

  return (
    <View accessible accessibilityLabel={t('home.chartLabel', { summary })} style={styles.chart}>
      {days.map((d, i) => {
        const isToday = d.date === today;
        return (
          <View key={d.date} style={styles.column}>
            <View style={styles.barArea}>
              <View
                style={[
                  styles.bar,
                  { height: heights[i] },
                  isToday ? styles.barToday : styles.barDay,
                ]}
              />
            </View>
            <Text variant="label" color={isToday ? 'accent' : 'textMuted'}>
              {weekdayLetter(d.date)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center', gap: spacing.sm },
  barArea: {
    height: CHART_HEIGHT,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: { width: '70%', borderRadius: radii.sm },
  barDay: { backgroundColor: colors.surfaceRaised },
  barToday: { backgroundColor: colors.accent },
});
