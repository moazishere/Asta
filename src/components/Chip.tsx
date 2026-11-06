import { Pressable, StyleSheet } from 'react-native';

import { Text } from './Text';
import { selectionHaptic } from '@/lib/haptics';
import { colors, radii, spacing } from '@/theme';

type Props = { label: string; onPress: () => void; selected?: boolean };

// Small pill for quick choices ("1 serving", "100 g").
export function Chip({ label, onPress, selected = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text variant="bodyStrong" color={selected ? 'onAccent' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
  },
  selected: { backgroundColor: colors.accent },
});
