import { StyleSheet, View } from 'react-native';

import { Card, ProgressRing, Screen, StatRow, Text } from '@/components';
import { useProfile } from '@/features/auth/useProfile';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

// Placeholder for phase 4: calorie ring, macro strip, empty meal list.
export default function Food() {
  const { data: profile } = useProfile();
  const goal = profile?.daily_kcal_goal ?? 0;
  return (
    <Screen withTabBar>
      <View style={styles.stack}>
        <Text variant="display">{t('food.title')}</Text>

        <View style={styles.ring}>
          <ProgressRing progress={0} size={180} strokeWidth={16}>
            <Text variant="numeralLg">0</Text>
            <Text variant="caption" color="textMuted">
              {t('food.consumed', { goal })}
            </Text>
          </ProgressRing>
        </View>

        <StatRow
          stats={[
            { label: t('food.protein'), value: '0', unit: 'g' },
            { label: t('food.carbs'), value: '0', unit: 'g' },
            { label: t('food.fat'), value: '0', unit: 'g' },
          ]}
        />
        <Card>
          <Text color="textMuted">{t('food.empty')}</Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  ring: { alignItems: 'center', paddingVertical: spacing.lg },
});
