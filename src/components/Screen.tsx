import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, sizes, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  /** Scrolls the content. Use false for screens that manage their own scrolling (FlatList). */
  scroll?: boolean;
  /** Reserve space for the floating tab bar at the bottom. */
  withTabBar?: boolean;
};

export function Screen({ children, scroll = true, withTabBar = false }: Props) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + spacing.lg,
    // Only Android has our floating custom bar that overlaps content and needs reserved space; on iOS the
    // system tab bar sits in its own area.
    paddingBottom:
      insets.bottom +
      spacing.xl +
      (withTabBar && Platform.OS !== 'ios' ? sizes.tabBarHeight + spacing.xl : 0),
    paddingHorizontal: sizes.gutter,
  };

  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[padding, styles.grow]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padding]}>{children}</View>
  );

  return (
    // Platform check: iOS needs "padding" behaviour to lift inputs above the keyboard; Android resizes
    // the window itself (adjustResize), so wrapping it again would double-apply the offset.
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {content}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
