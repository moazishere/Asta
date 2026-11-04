import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, radii, spacing } from '@/theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Avatar, rank badge, icon... anything round on the left. */
  leading?: ReactNode;
  /** Value shown on the right (e.g. "24.6 km"). */
  value?: string;
  /** Shows a chevron and makes the row tappable. */
  onPress?: () => void;
  icon?: IconName;
  highlight?: boolean;
};

export function ListRow({ title, subtitle, leading, value, onPress, icon, highlight }: Props) {
  const body = (
    <>
      {leading ?? (icon ? <Icon name={icon} /> : null)}
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? <Text variant="title">{value}</Text> : null}
      {onPress ? <Icon name="chevron-forward" color="textMuted" size="iconSm" /> : null}
    </>
  );

  const style = [styles.row, highlight && styles.highlight];
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 64,
  },
  highlight: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  text: { flex: 1, gap: 2 },
});
