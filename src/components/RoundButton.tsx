import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from './Icon';
import { colors, radii, sizes, type ColorToken } from '@/theme';

type Variant = 'dark' | 'light' | 'accent';

type Props = {
  icon: IconName;
  onPress?: () => void;
  /** Required: icon-only buttons have no visible text for screen readers. */
  accessibilityLabel: string;
  variant?: Variant;
};

const palette: Record<Variant, { bg: ColorToken; fg: ColorToken }> = {
  dark: { bg: 'surfaceRaised', fg: 'text' },
  light: { bg: 'surfaceLight', fg: 'textOnLight' },
  accent: { bg: 'accent', fg: 'onAccent' },
};

// The circular icon buttons from the design (menu, locate, back, pause, next).
export function RoundButton({ icon, onPress, accessibilityLabel, variant = 'dark' }: Props) {
  const p = palette[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: colors[p.bg], opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={icon} color={p.fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: sizes.roundButton,
    height: sizes.roundButton,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
