import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme';

type Props = { size?: number };

// The Asta mark: an "A" made of two rounded strokes, with a route-marker dot where the crossbar would
// be. The geometry matches docs/design/logo/mark.svg, from which the app icons are rendered.
export function Logo({ size = 48 }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      accessibilityLabel="Asta"
      accessibilityRole="image"
    >
      <Path
        d="M296 772 L512 252 L728 772"
        fill="none"
        stroke={colors.accent}
        strokeWidth={112}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={512} cy={606} r={62} fill={colors.accent} />
    </Svg>
  );
}
