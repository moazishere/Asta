import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radii, sizes, spacing, type ColorToken } from '@/theme';

type Variant = 'primary' | 'dark' | 'light' | 'ghost';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

const palette: Record<Variant, { bg: ColorToken; pressed: ColorToken; fg: ColorToken }> = {
  primary: { bg: 'accent', pressed: 'accentPressed', fg: 'onAccent' },
  dark: { bg: 'surfaceRaised', pressed: 'border', fg: 'text' },
  light: { bg: 'surfaceLight', pressed: 'textMuted', fg: 'textOnLight' },
  ghost: { bg: 'bg', pressed: 'surface', fg: 'text' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  accessibilityLabel,
}: Props) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: colors[pressed ? p.pressed : p.bg] },
        variant === 'ghost' && styles.ghost,
        disabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[p.fg]} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} color={p.fg} /> : null}
          <Text variant="title" color={p.fg}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: sizes.controlHeight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
