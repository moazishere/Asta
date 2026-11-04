import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { colors, radii, spacing, type ColorToken } from '@/theme';

type Tone = 'good' | 'weak' | 'searching';

const dot: Record<Tone, ColorToken> = { good: 'accent', weak: 'danger', searching: 'textMuted' };

// Replaces the design's "Connected" pill: shows GPS signal status.
export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <View style={styles.pill} accessible accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: colors[dot[tone]] }]} />
      <Text variant="caption">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
});
