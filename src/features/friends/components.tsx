import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { personName } from './hooks';
import type { PersonCard } from './types';
import { Avatar, Icon, Text } from '@/components';
import { colors, radii, spacing } from '@/theme';

type PersonRowProps = {
  person: PersonCard;
  /** Second line under the name (defaults to @username). */
  subtitle?: string;
  /** Anything on the right: a distance, action chips... */
  trailing?: ReactNode;
  onPress?: () => void;
};

// Avatar, name and @username on one row; the whole row is tappable when `onPress` is given.
export function PersonRow({ person, subtitle, trailing, onPress }: PersonRowProps) {
  const name = personName(person);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? name : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : undefined]}
    >
      <Avatar name={name} uri={person.avatar_url} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {subtitle ?? `@${person.username}`}
        </Text>
      </View>
      {trailing}
      {onPress && !trailing ? (
        <Icon name="chevron-forward" color="textMuted" size="iconSm" />
      ) : null}
    </Pressable>
  );
}

/** A small round count badge, shown on top of a button when something needs attention. */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge} pointerEvents="none">
      <Text variant="label" color="onAccent">
        {count > 9 ? '9+' : String(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  text: { flex: 1, gap: spacing.xxs },
  badge: {
    position: 'absolute',
    top: -spacing.xs,
    right: -spacing.xs,
    minWidth: spacing.xl,
    height: spacing.xl,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
