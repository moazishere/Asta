import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/theme';

type Props = {
  /** 0..1 (clamped). */
  progress: number;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
};

// The lime ring around the runner icon in the design. Used for daily calories and challenge progress.
export function ProgressRing({ progress, size = 120, strokeWidth = 12, children }: Props) {
  const clamped = Math.min(1, Math.max(0, progress));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.surfaceRaised}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - clamped)}
          // Start at 12 o'clock instead of SVG's default 3 o'clock.
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
