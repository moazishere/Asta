import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radii, sizes, spacing } from '@/theme';

// expo-router does not re-export the tab bar props type from its root, so derive it from <Tabs>.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// Platform check: Liquid Glass is an iOS 26+ system effect. Everywhere else (Android, older iOS) the
// check is false and the bar keeps its solid dark surface.
const supportsGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/** People who enable "Reduce Transparency" in iOS accessibility settings get the solid bar instead. */
function useReduceTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (!supportsGlass) return;
    let cancelled = false;
    AccessibilityInfo.isReduceTransparencyEnabled().then((v) => !cancelled && setReduced(v));
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return reduced;
}

// Icon per route; the outline glyph is used when idle and the filled one when active.
const icons: Record<string, { idle: IconName; active: IconName }> = {
  index: { idle: 'home-outline', active: 'home' },
  run: { idle: 'walk-outline', active: 'walk' },
  food: { idle: 'restaurant-outline', active: 'restaurant' },
  challenges: { idle: 'trophy-outline', active: 'trophy' },
  profile: { idle: 'person-outline', active: 'person' },
};

// Floating dark pill bar. The active tab expands into a lime pill with its label, like the design's
// lime CTA, so the accent colour always marks "where you are / what to do".
export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceTransparency = useReduceTransparency();
  const glass = supportsGlass && !reduceTransparency;
  // Screens (e.g. an active run) can hide the bar with options.tabBarStyle = { display: 'none' }.
  const focusedStyle = descriptors[state.routes[state.index]?.key ?? '']?.options.tabBarStyle as
    { display?: string } | undefined;
  if (focusedStyle?.display === 'none') return null;
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
      <BarSurface glass={glass}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = typeof options.title === 'string' ? options.title : route.name;
          const glyph = icons[route.name] ?? icons.index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = emitter.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              style={[styles.item, focused && styles.itemActive]}
            >
              <Icon
                name={focused ? glyph.active : glyph.idle}
                color={focused ? 'onAccent' : glass ? 'text' : 'textMuted'}
              />
              {focused ? (
                <Text variant="bodyStrong" color="onAccent">
                  {label}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </BarSurface>
    </View>
  );
}

// iOS 26+: the system's Liquid Glass (content scrolling underneath is refracted and blurred, and the
// glass reacts to touch). Elsewhere: the plain dark surface from the design.
function BarSurface({ glass, children }: { glass: boolean; children: ReactNode }) {
  if (glass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive
        style={styles.glassBar}
      >
        {children}
      </GlassView>
    );
  }
  return <View style={styles.bar}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: sizes.gutter, right: sizes.gutter },
  glassBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: sizes.tabBarHeight,
    padding: spacing.sm,
    borderRadius: radii.pill,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: sizes.tabBarHeight,
    padding: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: sizes.tabBarHeight - spacing.lg,
    minWidth: sizes.tabBarHeight - spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  itemActive: { backgroundColor: colors.accent, paddingHorizontal: spacing.lg },
});
