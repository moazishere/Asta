import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { MacroRow, MealPicker } from './components';
import { useDeleteEntry, useEntry, useUpdateEntry, type EntryPatch } from './hooks';
import { parseNumber, pickName, scaleMacros } from './nutrition';
import type { LogEntry, MealType } from './types';
import {
  Button,
  EmptyView,
  ErrorView,
  Input,
  LoadingView,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

// Edit or delete a logged entry. Food entries change amount (the stored macros are rescaled); quick
// adds change name and calories.
export function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useEntry(id);
  const back = () => router.back();

  if (query.isPending) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('entry.title')} onBack={back} />
        <LoadingView />
      </Screen>
    );
  }
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('entry.title')} onBack={back} />
        {missing ? (
          <EmptyView icon="trash-outline" title={t('entry.notFound')} />
        ) : (
          <ErrorView message={t('entry.loadError')} onRetry={() => void query.refetch()} />
        )}
      </Screen>
    );
  }
  return <EntryForm entry={query.data} onDone={back} />;
}

function EntryForm({ entry, onDone }: { entry: LogEntry; onDone: () => void }) {
  const update = useUpdateEntry();
  const remove = useDeleteEntry();
  const isFood = entry.grams !== null;

  const [meal, setMeal] = useState<MealType>(entry.meal_type);
  const [gramsText, setGramsText] = useState(entry.grams !== null ? String(entry.grams) : '');
  const [name, setName] = useState(entry.name);
  const [kcalText, setKcalText] = useState(String(entry.kcal));
  const [submitted, setSubmitted] = useState(false);

  const grams = parseNumber(gramsText);
  const kcal = parseNumber(kcalText);
  const gramsOk = Number.isFinite(grams) && grams >= 1 && grams <= 5000;
  const kcalOk = Number.isFinite(kcal) && kcal >= 0 && kcal <= 20000;
  const nameOk = name.trim() !== '';
  const valid = isFood ? gramsOk : kcalOk && nameOk;

  // Live preview of what the entry will become (food entries only; quick adds have no macros).
  const preview =
    isFood && gramsOk && entry.grams
      ? { ...entry, ...scaleMacros(entry, grams / entry.grams) }
      : entry;

  function onSave() {
    setSubmitted(true);
    if (!valid) return;
    // Send only what actually changed.
    const patch: EntryPatch = {};
    if (meal !== entry.meal_type) patch.meal_type = meal;
    if (isFood && grams !== entry.grams) patch.grams = grams;
    if (!isFood && Math.round(kcal) !== entry.kcal) patch.kcal = kcal;
    if (!isFood && name.trim() !== entry.name) patch.custom_name = name.trim();
    if (Object.keys(patch).length > 0) update.mutate({ entry, patch });
    onDone();
  }

  function onDelete() {
    Alert.alert(t('entry.deleteTitle'), t('entry.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('detail.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          remove.mutate(entry);
          onDone();
        },
      },
    ]);
  }

  return (
    <Screen>
      <View style={styles.stack}>
        <ScreenHeader title={t('entry.title')} onBack={onDone} />
        {isFood ? (
          <Text variant="h2" style={styles.center}>
            {pickName(entry, Intl.DateTimeFormat().resolvedOptions().locale)}
          </Text>
        ) : null}

        {isFood ? (
          <Input
            label={t('amount.grams')}
            suffix="g"
            value={gramsText}
            onChangeText={setGramsText}
            error={submitted && !gramsOk ? t('amount.errorRange') : undefined}
            keyboardType="decimal-pad"
          />
        ) : (
          <>
            <Input
              label={t('quick.name')}
              value={name}
              onChangeText={setName}
              error={submitted && !nameOk ? t('foodNew.nameRequired') : undefined}
              maxLength={80}
            />
            <Input
              label={t('quick.kcal')}
              suffix={t('units.kcal')}
              value={kcalText}
              onChangeText={setKcalText}
              error={
                submitted && !kcalOk ? t('foodNew.errorRange', { min: 0, max: 20000 }) : undefined
              }
              keyboardType="number-pad"
            />
          </>
        )}

        <View style={styles.group}>
          <Text variant="caption" color="textMuted">
            {t('amount.meal')}
          </Text>
          <MealPicker value={meal} onChange={setMeal} />
        </View>

        {isFood ? <MacroRow macros={preview} /> : null}

        <Button label={t('entry.save')} onPress={onSave} />
        <Button label={t('entry.delete')} variant="danger" onPress={onDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  center: { textAlign: 'center' },
  group: { gap: spacing.sm },
});
