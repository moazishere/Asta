import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useToastStore, type ToastKind } from '@/lib/toast';
import { colors, radii, spacing } from '@/theme';

const DURATION_MS = 3500;

const look: Record<ToastKind, { icon: IconName; color: 'danger' | 'accent' | 'textMuted' }> = {
  error: { icon: 'alert-circle', color: 'danger' },
  success: { icon: 'checkmark-circle', color: 'accent' },
  info: { icon: 'information-circle', color: 'textMuted' },
};

// Mounted once in the root layout. Shows the latest toast near the top for a few seconds; tap to dismiss.
export function ToastHost() {
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dismiss(toast.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  const { icon, color } = look[toast.kind];
  return (
    <Pressable
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={toast.message}
      onPress={() => dismiss(toast.id)}
      style={[styles.toast, { top: insets.top + spacing.sm }]}
    >
      <Icon name={icon} color={color} />
      <Text variant="bodyStrong" style={styles.text}>
        {toast.message}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: { flex: 1 },
});
