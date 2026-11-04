import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Card,
  ProgressRing,
  Screen,
  SectionHeader,
  StartBar,
  StatRow,
  Text,
} from '@/components';
import { useProfile } from '@/features/auth/useProfile';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

// Placeholder: layout is final, numbers are zero until runs and food logs exist (phases 2-4).
export default function Home() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const name = profile?.display_name ?? profile?.username ?? '';
  const goal = profile?.daily_kcal_goal ?? 0;

  return (
    <Screen withTabBar>
      <View style={styles.stack}>
        <View style={styles.header}>
          <Avatar name={name} uri={profile?.avatar_url} ring />
          <Text variant="h1">{t('home.greeting', { name })}</Text>
        </View>

        <SectionHeader title={t('home.thisWeek')} />
        <StatRow
          stats={[
            { label: t('home.distance'), value: '0.0', unit: t('units.km') },
            { label: t('home.runs'), value: '0' },
            { label: t('home.time'), value: '00:00' },
          ]}
        />
        <Card>
          <Text color="textMuted">{t('home.noRunsYet')}</Text>
        </Card>

        <Card style={styles.kcal}>
          <ProgressRing progress={0} size={96} strokeWidth={10}>
            <Text variant="numeral">0</Text>
          </ProgressRing>
          <View style={styles.kcalText}>
            <Text variant="title">{t('home.todayCalories')}</Text>
            <Text variant="caption" color="textMuted">
              {t('food.consumed', { goal })}
            </Text>
          </View>
        </Card>

        <StartBar label={t('home.startRun')} onPress={() => router.navigate('/run')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kcal: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  kcalText: { gap: spacing.xs },
});
