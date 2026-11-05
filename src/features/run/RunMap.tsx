import { memo, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Polyline, type Region } from 'react-native-maps';

import type { LatLng } from './geo';
import { darkMapStyle } from './mapStyle';
import { colors, spacing } from '@/theme';

type Props = {
  /** The route to draw. */
  route: LatLng[];
  /** Live mode: show the user's position and keep the camera on the newest point. */
  follow?: boolean;
  /** Summary mode: zoom out to show the whole route. */
  fitRoute?: boolean;
  /** Where to look when there is no route yet. */
  center?: LatLng | null;
};

const FOLLOW_ZOOM = 17;
const EDGE = spacing.xxxl;

function RunMapBase({ route, follow = false, fitRoute = false, center }: Props) {
  const ref = useRef<MapView>(null);
  const last = route[route.length - 1];

  useEffect(() => {
    if (follow && last)
      ref.current?.animateCamera({ center: last, zoom: FOLLOW_ZOOM }, { duration: 600 });
  }, [follow, last]);

  useEffect(() => {
    if (fitRoute && route.length > 1) {
      ref.current?.fitToCoordinates(route, {
        edgePadding: { top: EDGE, right: EDGE, bottom: EDGE, left: EDGE },
        animated: false,
      });
    }
  }, [fitRoute, route]);

  const start = last ?? route[0] ?? center ?? null;
  const initialRegion: Region | undefined = start
    ? { ...start, latitudeDelta: 0.004, longitudeDelta: 0.004 }
    : undefined;

  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      showsUserLocation={follow || !fitRoute}
      showsCompass={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
      // A read-only route preview sits inside a scrolling screen: let swipes scroll the page, not pan the map.
      scrollEnabled={!fitRoute}
      zoomEnabled={!fitRoute}
      // Android (Google Maps) uses the custom style; iOS (Apple Maps) uses the dark appearance.
      customMapStyle={darkMapStyle}
      userInterfaceStyle="dark"
    >
      {route.length > 1 ? (
        <Polyline
          coordinates={route}
          strokeColor={colors.accent}
          strokeWidth={5}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}
    </MapView>
  );
}

// The route array only changes when a new GPS point arrives, so this skips the per-second re-renders.
export const RunMap = memo(RunMapBase);
