import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CalorieRing, DateSwitcher, MacroRow, MealSection } from './components';
import { useDay } from './hooks';
import { groupByMeal, pickName, todayIn } from './nutrition';
import { addFoodHref, entryHref } from './routes';
import type { LogEntry } from './types';
import { ErrorView, Screen, SkeletonList, Text } from '@/components';
import { useProfile } from '@/features/auth/useProfile';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

const locale = () => Intl.DateTimeFormat().resolvedOptions().locale;

export function FoodScreen() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const today = todayIn(profile?.timezone);
  // Follows "today" (even across midnight) until the user picks another day.
  const [selected, setSelected] = useState<string | null>(null);
  const date = selected ?? today;
  const query = useDay(date);

  const nameFor = (e: LogEntry) => pickName(e, locale());

  return (
    <Screen withTabBar>
      <View style={styles.stack}>
        <Text variant="display">{t('food.title')}</Text>
        <DateSwitcher date={date} today={today} onChange={setSelected} />

        {query.isPending ? (
          <SkeletonList count={4} height={96} />
        ) : query.isError ? (
          <ErrorView message={t('food.loadError')} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <CalorieRing
              consumed={query.data.totals.kcal}
              goal={query.data.goal_kcal ?? profile?.daily_kcal_goal ?? null}
            />
            <MacroRow macros={query.data.totals} showKcal={false} />
            {groupByMeal(query.data.entries).map((g) => (
              <MealSection
                key={g.meal}
                meal={g.meal}
                kcal={g.kcal}
                entries={g.entries}
                nameFor={nameFor}
                onAdd={() => router.push(addFoodHref(date, g.meal))}
                onOpen={(entry) => router.push(entryHref(entry.id))}
              />
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.xl } });
