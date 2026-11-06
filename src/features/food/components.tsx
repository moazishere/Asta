import { StyleSheet, View } from 'react-native';

import { addDays, goalProgress, kcalRemaining, relationToToday } from './nutrition';
import type { LogEntry, Macros, MealType } from './types';
import { ListRow, ProgressRing, RoundButton, SegmentedControl, StatRow, Text } from '@/components';
import { t, type StringKey } from '@/lib/i18n';
import { sizes, spacing } from '@/theme';

export const mealLabel = (meal: MealType) => t(`food.${meal}` as StringKey);

/** "Wed, 5 Nov" for any YYYY-MM-DD, independent of the phone's time zone. */
function formatDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

type DateSwitcherProps = { date: string; today: string; onChange: (date: string) => void };

// Previous / next day arrows around the day label. Tapping the label jumps back to today.
export function DateSwitcher({ date, today, onChange }: DateSwitcherProps) {
  const rel = relationToToday(date, today);
  const label = rel === 'other' ? formatDay(date) : t(`food.${rel}` as StringKey);
  return (
    <View style={styles.switcher}>
      <RoundButton
        icon="chevron-back"
        accessibilityLabel={t('food.prevDay')}
        onPress={() => onChange(addDays(date, -1))}
      />
      <View style={styles.dayLabel}>
        <Text
          variant="title"
          accessibilityRole={rel === 'today' ? 'text' : 'button'}
          accessibilityLabel={rel === 'today' ? label : `${label}. ${t('food.backToToday')}`}
          onPress={rel === 'today' ? undefined : () => onChange(today)}
        >
          {label}
        </Text>
        {rel !== 'other' ? (
          <Text variant="caption" color="textMuted">
            {formatDay(date)}
          </Text>
        ) : null}
      </View>
      <RoundButton
        icon="chevron-forward"
        accessibilityLabel={t('food.nextDay')}
        onPress={() => onChange(addDays(date, 1))}
      />
    </View>
  );
}

/** The big calorie ring: eaten vs goal, with calories left (or over) underneath. */
export function CalorieRing({ consumed, goal }: { consumed: number; goal: number | null }) {
  const left = kcalRemaining(goal, consumed);
  return (
    <View style={styles.ringWrap}>
      <ProgressRing progress={goalProgress(goal, consumed)} size={sizes.foodRing} strokeWidth={16}>
        <Text variant="numeralLg">{consumed}</Text>
        <Text variant="caption" color="textMuted">
          {goal ? t('food.consumed', { goal }) : t('food.consumedNoGoal')}
        </Text>
      </ProgressRing>
      <Text variant="bodyStrong" color={left !== null && left < 0 ? 'danger' : 'textMuted'}>
        {left === null
          ? t('food.noGoal')
          : left >= 0
            ? t('food.kcalLeft', { kcal: left })
            : t('food.kcalOver', { kcal: -left })}
      </Text>
    </View>
  );
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Calories and the three macros for one portion or a whole day. */
export function MacroRow({ macros, showKcal = true }: { macros: Macros; showKcal?: boolean }) {
  return (
    <StatRow
      stats={[
        ...(showKcal
          ? [{ label: t('run.calories'), value: String(macros.kcal), unit: t('units.kcal') }]
          : []),
        { label: t('food.protein'), value: fmt(macros.protein_g), unit: 'g' },
        { label: t('food.carbs'), value: fmt(macros.carbs_g), unit: 'g' },
        { label: t('food.fat'), value: fmt(macros.fat_g), unit: 'g' },
      ]}
    />
  );
}

export function MealPicker({
  value,
  onChange,
}: {
  value: MealType;
  onChange: (meal: MealType) => void;
}) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      options={(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((m) => ({
        value: m,
        label: mealLabel(m),
      }))}
    />
  );
}

type MealSectionProps = {
  meal: MealType;
  kcal: number;
  entries: LogEntry[];
  nameFor: (e: LogEntry) => string;
  onAdd: () => void;
  onOpen: (entry: LogEntry) => void;
};

export function MealSection({ meal, kcal, entries, nameFor, onAdd, onOpen }: MealSectionProps) {
  return (
    <View style={styles.meal}>
      <View style={styles.mealHeader}>
        <View style={styles.mealTitle}>
          <Text variant="h2">{mealLabel(meal)}</Text>
          {entries.length > 0 ? (
            <Text variant="bodyStrong" color="textMuted">
              {kcal} {t('units.kcal')}
            </Text>
          ) : null}
        </View>
        <RoundButton
          icon="add"
          variant="accent"
          accessibilityLabel={t('food.addToMeal', { meal: mealLabel(meal) })}
          onPress={onAdd}
        />
      </View>
      {entries.length === 0 ? (
        <Text variant="caption" color="textMuted">
          {t('food.mealEmpty')}
        </Text>
      ) : (
        entries.map((e) => (
          <ListRow
            key={e.id}
            title={nameFor(e)}
            subtitle={e.grams ? t('food.gramsShort', { grams: Math.round(e.grams) }) : undefined}
            value={`${e.kcal} ${t('units.kcal')}`}
            onPress={() => onOpen(e)}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayLabel: { alignItems: 'center', gap: spacing.xxs },
  ringWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  meal: { gap: spacing.md },
  mealHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealTitle: { gap: spacing.xxs },
});
