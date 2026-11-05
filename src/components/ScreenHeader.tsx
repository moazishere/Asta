import { StyleSheet, View } from 'react-native';

import { RoundButton } from './RoundButton';
import { Text } from './Text';
import { t } from '@/lib/i18n';
import { sizes, spacing } from '@/theme';

type Props = { title: string; onBack: () => void };

// Title row for pushed screens: round back button (like the reference's live view) and the title.
export function ScreenHeader({ title, onBack }: Props) {
  return (
    <View style={styles.row}>
      <RoundButton icon="chevron-back" accessibilityLabel={t('common.back')} onPress={onBack} />
      <Text variant="h1" numberOfLines={1} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {/* Same width as the back button, so the title stays visually centred-ish and never collides. */}
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { flex: 1, textAlign: 'center' },
  spacer: { width: sizes.roundButton },
});
