import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radii, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  /** "light" is the pale grey card used on top of the dark background (landing/summary cards). */
  tone?: 'dark' | 'light';
  style?: ViewStyle;
};

export function Card({ children, tone = 'dark', style }: Props) {
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: tone === 'light' ? colors.surfaceLight : colors.surface },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.lg, padding: spacing.lg },
});
