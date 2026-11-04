import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Screen, SegmentedControl, Text } from '@/components';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

type Tab = 'active' | 'upcoming' | 'finished';

// Placeholder for phase 6: the Active / Upcoming / Finished tabs from the design, with an empty state.
export default function Challenges() {
  const [tab, setTab] = useState<Tab>('active');
  return (
    <Screen withTabBar>
      <View style={styles.stack}>
        <Text variant="display">{t('challenges.title')}</Text>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'active', label: t('challenges.active') },
            { value: 'upcoming', label: t('challenges.upcoming') },
            { value: 'finished', label: t('challenges.finished') },
          ]}
        />
        <Card>
          <Text color="textMuted">{t('challenges.empty')}</Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.lg } });
