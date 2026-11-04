import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { spacing } from '@/theme';

type Props = { title: string; actionLabel?: string; onAction?: () => void };

export function SectionHeader({ title, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <Text variant="h2">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={spacing.md}>
          <Text variant="bodyStrong" color="accent">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
