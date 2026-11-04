import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { colors, radii, spacing } from '@/theme';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

// Pill tabs (Active / Upcoming / Finished) and small pickers (sex).
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.item, selected && styles.selected]}
          >
            <Text variant="bodyStrong" color={selected ? 'onAccent' : 'textMuted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: spacing.xs,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: radii.pill,
  },
  selected: { backgroundColor: colors.accent },
});
