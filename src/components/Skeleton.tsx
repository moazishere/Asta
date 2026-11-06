import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';

import { t } from '@/lib/i18n';
import { colors, radii, spacing } from '@/theme';

type Props = { height?: number; width?: DimensionValue; radius?: number };

// A grey placeholder that gently pulses while real content loads: the screen keeps its shape instead of
// jumping when data arrives (better than a lone spinner).
export function Skeleton({ height = spacing.xxl, width = '100%', radius = radii.md }: Props) {
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[styles.base, { height, width, borderRadius: radius, opacity: pulse }]}
      importantForAccessibility="no"
    />
  );
}

/** A column of card-shaped placeholders. Announced to screen readers as a single "Loading". */
export function SkeletonList({ count = 3, height = 72 }: { count?: number; height?: number }) {
  return (
    <View
      style={styles.list}
      accessible
      accessibilityLabel={t('common.loading')}
      accessibilityRole="progressbar"
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} radius={radii.lg} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surfaceRaised },
  list: { gap: spacing.md },
});
