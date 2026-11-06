import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MealPicker } from './components';
import { useCreateFood, useFoodSearch, useLogEntry } from './hooks';
import { MEALS, parseNumber, pickName } from './nutrition';
import { amountHref } from './routes';
import type { Food, MealType } from './types';
import {
  Button,
  EmptyView,
  ErrorView,
  Icon,
  Input,
  ListRow,
  LoadingView,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Text,
} from '@/components';
import { ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

type Mode = 'search' | 'new' | 'quick';

const asMeal = (v: string | undefined): MealType =>
  MEALS.includes(v as MealType) ? (v as MealType) : 'snack';
const locale = () => Intl.DateTimeFormat().resolvedOptions().locale;

export function AddFoodScreen() {
  const params = useLocalSearchParams<{ date: string; meal: string }>();
  const router = useRouter();
  const meal = asMeal(params.meal);
  const [mode, setMode] = useState<Mode>('search');

  return (
    <Screen>
      <View style={styles.stack}>
        <ScreenHeader title={t('foodAdd.title')} onBack={() => router.back()} />
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'search', label: t('foodAdd.search') },
            { value: 'new', label: t('foodAdd.newFood') },
            { value: 'quick', label: t('foodAdd.quick') },
          ]}
        />
        {mode === 'search' ? <SearchFoods date={params.date} meal={meal} /> : null}
        {mode === 'new' ? <NewFoodForm date={params.date} meal={meal} /> : null}
        {mode === 'quick' ? <QuickAddForm date={params.date} initialMeal={meal} /> : null}
      </View>
    </Screen>
  );
}

// ---- search --------------------------------------------------------------------------------------

function SearchFoods({ date, meal }: { date: string; meal: MealType }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const query = useFoodSearch(text);

  return (
    <View style={styles.stack}>
      <Input
        label={t('foodAdd.searchLabel')}
        icon="search"
        placeholder={t('foodAdd.searchPlaceholder')}
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {query.isPending ? (
        <LoadingView />
      ) : query.isError ? (
        <ErrorView message={t('foodAdd.searchError')} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyView
          icon="search-outline"
          title={t('foodAdd.noResults')}
          body={t('foodAdd.noResultsBody')}
        />
      ) : (
        <View style={styles.list}>
          {query.data.items.map((food) => (
            <FoodRow
              key={food.id}
              food={food}
              onPress={() => router.push(amountHref(food.id, date, meal))}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function FoodRow({ food, onPress }: { food: Food; onPress: () => void }) {
  const name = pickName(food, locale());
  // Show the other language underneath so both names are searchable-looking and recognisable.
  const other = name === food.name ? food.name_ar : food.name;
  return (
    <ListRow
      title={name}
      subtitle={[other, t('foodAdd.per100', { kcal: food.kcal_per_100g })]
        .filter(Boolean)
        .join(' · ')}
      leading={food.mine ? <Icon name="person-circle-outline" color="accent" /> : undefined}
      onPress={onPress}
    />
  );
}

// ---- new custom food -----------------------------------------------------------------------------

function NewFoodForm({ date, meal }: { date: string; meal: MealType }) {
  const router = useRouter();
  const create = useCreateFood();
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [serving, setServing] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Empty macro fields count as 0; empty serving means "none".
  const num = (text: string) => (text.trim() === '' ? 0 : parseNumber(text));
  const k = parseNumber(kcal);
  const p = num(protein);
  const c = num(carbs);
  const f = num(fat);
  const s = serving.trim() === '' ? null : parseNumber(serving);

  const inRange = (v: number, min: number, max: number) =>
    Number.isFinite(v) && v >= min && v <= max;
  const range = (min: number, max: number) => t('foodNew.errorRange', { min, max });
  const errors = {
    name: name.trim() === '' ? t('foodNew.nameRequired') : undefined,
    kcal: inRange(k, 0, 1000) ? undefined : range(0, 1000),
    protein: inRange(p, 0, 100) ? undefined : range(0, 100),
    carbs: inRange(c, 0, 100) ? undefined : range(0, 100),
    fat: inRange(f, 0, 100) ? undefined : range(0, 100),
    serving: s === null || inRange(s, 1, 2000) ? undefined : range(1, 2000),
  };
  const macroSumTooHigh = p + c + f > 100.5;
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);

  async function onSave() {
    setSubmitted(true);
    setServerError(null);
    if (Object.values(errors).some(Boolean) || macroSumTooHigh) return;
    try {
      const food = await create.mutateAsync({
        name: name.trim(),
        name_ar: nameAr.trim() || null,
        kcal_per_100g: k,
        protein_g: p,
        carbs_g: c,
        fat_g: f,
        serving_g: s,
      });
      // Straight on to "how much did you have?" for the food that was just created.
      router.replace(amountHref(food.id, date, meal));
    } catch (err) {
      setServerError(
        err instanceof ApiError && err.code === 'food_exists'
          ? t('foodNew.exists')
          : t('common.genericError'),
      );
    }
  }

  return (
    <View style={styles.stack}>
      <Input
        label={t('foodNew.name')}
        value={name}
        onChangeText={setName}
        error={show('name')}
        maxLength={80}
      />
      <Input label={t('foodNew.nameAr')} value={nameAr} onChangeText={setNameAr} maxLength={80} />
      <Input
        label={t('foodNew.kcal')}
        suffix={t('units.kcal')}
        value={kcal}
        onChangeText={setKcal}
        error={show('kcal')}
        keyboardType="decimal-pad"
      />
      <View style={styles.row}>
        <View style={styles.third}>
          <Input
            label={t('food.protein')}
            suffix="g"
            value={protein}
            onChangeText={setProtein}
            error={show('protein')}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.third}>
          <Input
            label={t('food.carbs')}
            suffix="g"
            value={carbs}
            onChangeText={setCarbs}
            error={show('carbs')}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.third}>
          <Input
            label={t('food.fat')}
            suffix="g"
            value={fat}
            onChangeText={setFat}
            error={show('fat')}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      {submitted && macroSumTooHigh ? (
        <Text variant="caption" color="danger">
          {t('foodNew.macroSum')}
        </Text>
      ) : null}
      <Input
        label={t('foodNew.serving')}
        suffix="g"
        value={serving}
        onChangeText={setServing}
        error={show('serving')}
        keyboardType="decimal-pad"
      />
      {serverError ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {serverError}
        </Text>
      ) : null}
      <Button label={t('foodNew.save')} onPress={onSave} loading={create.isPending} />
    </View>
  );
}

// ---- quick add -----------------------------------------------------------------------------------

function QuickAddForm({ date, initialMeal }: { date: string; initialMeal: MealType }) {
  const router = useRouter();
  const log = useLogEntry();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [submitted, setSubmitted] = useState(false);

  const k = parseNumber(kcal);
  const nameError = name.trim() === '' ? t('foodNew.nameRequired') : undefined;
  const kcalError =
    Number.isFinite(k) && k >= 0 && k <= 20000
      ? undefined
      : t('foodNew.errorRange', { min: 0, max: 20000 });

  function onSave() {
    setSubmitted(true);
    if (nameError || kcalError) return;
    // Fire and navigate: the day screen updates instantly from the optimistic cache.
    log.mutate({ log_date: date, meal_type: meal, custom_name: name.trim(), kcal: k });
    router.dismissTo('/food');
  }

  return (
    <View style={styles.stack}>
      <Input
        label={t('quick.name')}
        value={name}
        onChangeText={setName}
        error={submitted ? nameError : undefined}
        maxLength={80}
      />
      <Input
        label={t('quick.kcal')}
        suffix={t('units.kcal')}
        value={kcal}
        onChangeText={setKcal}
        error={submitted ? kcalError : undefined}
        keyboardType="number-pad"
      />
      <MealPicker value={meal} onChange={setMeal} />
      <Text variant="caption" color="textMuted">
        {t('quick.hint')}
      </Text>
      <Button label={t('quick.save')} onPress={onSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  list: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  third: { flex: 1 },
});
