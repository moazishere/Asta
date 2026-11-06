import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MacroRow, MealPicker } from './components';
import { useFood, useLogEntry } from './hooks';
import { MEALS, macrosForGrams, parseNumber, pickName } from './nutrition';
import type { MealType } from './types';
import {
  Button,
  Chip,
  EmptyView,
  ErrorView,
  Input,
  LoadingView,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { ApiError } from '@/lib/api';
import { successHaptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

const asMeal = (v: string | undefined): MealType =>
  MEALS.includes(v as MealType) ? (v as MealType) : 'snack';

// "How much?": amount in grams (or one serving), the meal, and a live preview of the macros.
export function AmountScreen() {
  const params = useLocalSearchParams<{ foodId: string; date: string; meal: string }>();
  const router = useRouter();
  const query = useFood(params.foodId);
  const log = useLogEntry();

  // null = the user has not typed yet, so the amount follows the food's serving (or 100 g).
  const [gramsText, setGramsText] = useState<string | null>(null);
  const [meal, setMeal] = useState<MealType>(asMeal(params.meal));
  const [submitted, setSubmitted] = useState(false);

  const back = () => router.back();

  if (query.isPending) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('amount.title')} onBack={back} />
        <LoadingView />
      </Screen>
    );
  }
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('amount.title')} onBack={back} />
        {missing ? (
          <EmptyView icon="restaurant-outline" title={t('amount.notFound')} />
        ) : (
          <ErrorView message={t('amount.loadError')} onRetry={() => void query.refetch()} />
        )}
      </Screen>
    );
  }

  const food = query.data;
  const text = gramsText ?? String(food.serving_g ?? 100);
  const grams = parseNumber(text);
  const valid = Number.isFinite(grams) && grams >= 1 && grams <= 5000;
  const preview = valid ? macrosForGrams(food, grams) : null;

  function onSave() {
    setSubmitted(true);
    if (!valid) return;
    // Fire and navigate: the Food screen updates instantly from the optimistic cache.
    successHaptic();
    log.mutate({ food, grams, log_date: params.date, meal_type: meal });
    router.dismissTo('/food');
  }

  return (
    <Screen>
      <View style={styles.stack}>
        <ScreenHeader title={t('amount.title')} onBack={back} />
        <View style={styles.name}>
          <Text variant="h2" style={styles.center}>
            {pickName(food, Intl.DateTimeFormat().resolvedOptions().locale)}
          </Text>
          <Text variant="caption" color="textMuted" style={styles.center}>
            {t('foodAdd.per100', { kcal: food.kcal_per_100g })}
          </Text>
        </View>

        <Input
          label={t('amount.grams')}
          suffix="g"
          value={text}
          onChangeText={setGramsText}
          error={submitted && !valid ? t('amount.errorRange') : undefined}
          keyboardType="decimal-pad"
          selectTextOnFocus
        />
        <View style={styles.chips}>
          {food.serving_g ? (
            <Chip
              label={t('amount.serving', { grams: Math.round(food.serving_g) })}
              selected={grams === food.serving_g}
              onPress={() => setGramsText(String(food.serving_g))}
            />
          ) : null}
          <Chip label="100 g" selected={grams === 100} onPress={() => setGramsText('100')} />
        </View>

        <View style={styles.group}>
          <Text variant="caption" color="textMuted">
            {t('amount.meal')}
          </Text>
          <MealPicker value={meal} onChange={setMeal} />
        </View>

        <View style={styles.group}>
          <Text variant="caption" color="textMuted">
            {t('amount.preview')}
          </Text>
          <MacroRow macros={preview ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }} />
        </View>

        <Button label={t('amount.save')} onPress={onSave} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  name: { gap: spacing.xs },
  center: { textAlign: 'center' },
  chips: { flexDirection: 'row', gap: spacing.md },
  group: { gap: spacing.sm },
});
