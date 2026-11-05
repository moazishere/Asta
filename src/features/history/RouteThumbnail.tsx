import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { decodePolyline, projectRoute, toSvgPath } from './stats';
import { Icon } from '@/components';
import { colors, radii, spacing } from '@/theme';

type Props = { route: string | null; size?: number };

const STROKE = 2.5;

// A route drawn as a tiny vector line instead of a map. A real map per list row would load tiles for
// every visible run (slow, data-hungry, and on Android needs a Google Maps view per row); an SVG is
// instant, identical on iOS and Android, and fits the app's dark look.
export function RouteThumbnail({ route, size = 64 }: Props) {
  const geometry = useMemo(() => {
    const points = route ? decodePolyline(route) : [];
    if (points.length === 0) return null;
    const xy = projectRoute(points, size, size, spacing.md);
    return { xy, path: toSvgPath(xy) };
  }, [route, size]);

  return (
    <View style={[styles.box, { width: size, height: size }]} accessibilityElementsHidden>
      {geometry && geometry.xy.length > 1 ? (
        <Svg width={size} height={size}>
          <Path
            d={geometry.path}
            stroke={colors.accent}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Circle
            cx={geometry.xy[0]!.x}
            cy={geometry.xy[0]!.y}
            r={STROKE * 1.4}
            fill={colors.text}
          />
        </Svg>
      ) : (
        <Icon name="map-outline" color="textMuted" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
