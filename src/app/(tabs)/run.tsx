import { StyleSheet, View } from 'react-native';

import { Card, Icon, RoundButton, Screen, StartBar, StatRow, StatusPill, Text } from '@/components';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

// Placeholder for phase 2. Matches the middle screen of the reference: title, menu/locate buttons,
// map area, stat strip, start bar. The Current Location / End Point cards are intentionally dropped.
export default function Run() {
  return (
    <Screen withTabBar>
      <View style={styles.stack}>
        <View style={styles.header}>
          <Text variant="display">{t('run.title')}</Text>
          <RoundButton icon="locate-outline" accessibilityLabel={t('run.locate')} />
        </View>
        <StatusPill label={t('run.gpsSearching')} tone="searching" />

        <Card style={styles.map}>
          <Icon name="map-outline" size="iconLg" color="textMuted" />
          <Text color="textMuted" style={styles.mapText}>
            {t('run.placeholder')}
          </Text>
        </Card>

        <StatRow
          stats={[
            { label: t('run.duration'), value: '00:00:00' },
            { label: t('run.avgPace'), value: '--:--', unit: t('units.paceShort') },
            { label: t('run.calories'), value: '0', unit: t('units.kcal') },
          ]}
        />
        <StartBar label={t('run.start')} onPress={() => undefined} disabled />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  map: { height: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mapText: { textAlign: 'center' },
});
