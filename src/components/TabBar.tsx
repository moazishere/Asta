import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radii, sizes, spacing } from '@/theme';

// expo-router does not re-export the tab bar props type from its root, so derive it from <Tabs>.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

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
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
      <View style={styles.bar}>
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
                color={focused ? 'onAccent' : 'textMuted'}
              />
              {focused ? (
                <Text variant="bodyStrong" color="onAccent">
                  {label}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: sizes.gutter, right: sizes.gutter },
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
