import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radii, sizes, spacing } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
};

// The big lime "Start My Ride" bar: dark round icon on the left, centred label, chevrons on the right.
export function StartBar({ label, onPress, icon = 'walk', disabled = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bar,
        pressed && { backgroundColor: colors.accentPressed },
        disabled && { opacity: 0.4 },
      ]}
    >
      <View style={styles.badge}>
        <Icon name={icon} color="accent" />
      </View>
      <Text variant="title" color="onAccent" style={styles.label}>
        {label}
      </Text>
      <Icon name="chevron-forward" color="onAccent" />
      <Icon name="chevron-forward" color="onAccent" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    padding: spacing.sm,
    paddingRight: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  badge: {
    width: sizes.controlHeight,
    height: sizes.controlHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, textAlign: 'center' },
});
