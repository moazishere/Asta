import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/theme';

type Props = { progress: number; height?: number };

export function ProgressBar({ progress, height = 8 }: Props) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height }]}
    >
      <View style={[styles.fill, { width: `${clamped * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.accent },
});
