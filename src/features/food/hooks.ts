import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';

import { macrosForGrams, scaleMacros, sumTotals } from './nutrition';
import type { DayLog, Food, LogEntry, MealType } from './types';
import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';
import { showToast } from '@/lib/toast';

export const dayKey = (date: string) => ['food', 'day', date] as const;
const entryKey = (id: string) => ['food', 'entry', id] as const;

// ---- reads -------------------------------------------------------------------------------------

export function useDay(date: string) {
  return useQuery({
    queryKey: dayKey(date),
    queryFn: () => apiFetch<DayLog>(`/food-logs?date=${date}`),
  });
}

export function useEntry(id: string) {
  return useQuery({
    queryKey: entryKey(id),
    queryFn: () => apiFetch<LogEntry>(`/food-logs/${encodeURIComponent(id)}`),
  });
}

export function useFood(id: string) {
  return useQuery({
    queryKey: ['food', 'item', id],
    queryFn: () => apiFetch<Food>(`/foods/${encodeURIComponent(id)}`),
  });
}

/** Waits for the user to pause typing, so a search does not fire on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function useFoodSearch(text: string) {
  const q = useDebounced(text.trim(), 250);
  return useQuery({
    queryKey: ['food', 'search', q],
    queryFn: () => apiFetch<{ items: Food[] }>(`/foods?q=${encodeURIComponent(q)}&limit=30`),
    // Keep the previous results on screen while the next ones load: no flicker between keystrokes.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function useCreateFood() {
  return useMutation({
    mutationFn: (food: {
      name: string;
      name_ar?: string | null;
      kcal_per_100g: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      serving_g?: number | null;
    }) => apiFetch<Food>('/foods', { method: 'POST', body: food }),
  });
}

// ---- writes with instant (optimistic) updates ---------------------------------------------------
// Each change is applied to the cached day immediately, so totals move the moment you tap Save. If the
// server then refuses it, the cache is rolled back and the user is told. Either way the day is
// refetched afterwards, so the screen always ends up showing what the server has.

const withEntries = (day: DayLog, entries: LogEntry[]): DayLog => ({
  ...day,
  entries,
  totals: sumTotals(entries),
});

const failed = () => showToast(t('food.saveError'), 'error');

export type LogInput = { log_date: string; meal_type: MealType } & (
  { food: Food; grams: number } | { custom_name: string; kcal: number }
);

export function useLogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LogInput) =>
      apiFetch<LogEntry>('/food-logs', {
        method: 'POST',
        body:
          'food' in input
            ? {
                food_id: input.food.id,
                grams: input.grams,
                meal_type: input.meal_type,
                log_date: input.log_date,
              }
            : {
                custom_name: input.custom_name,
                kcal: input.kcal,
                meal_type: input.meal_type,
                log_date: input.log_date,
              },
      }),
    onMutate: async (input) => {
      const key = dayKey(input.log_date);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DayLog>(key);
      if (previous) {
        const draft: LogEntry =
          'food' in input
            ? {
                id: `draft-${Crypto.randomUUID()}`,
                log_date: input.log_date,
                meal_type: input.meal_type,
                food_id: input.food.id,
                name: input.food.name,
                name_ar: input.food.name_ar,
                grams: input.grams,
                ...macrosForGrams(input.food, input.grams),
              }
            : {
                id: `draft-${Crypto.randomUUID()}`,
                log_date: input.log_date,
                meal_type: input.meal_type,
                food_id: null,
                name: input.custom_name,
                name_ar: null,
                grams: null,
                kcal: Math.round(input.kcal),
                protein_g: 0,
                carbs_g: 0,
                fat_g: 0,
              };
        qc.setQueryData(key, withEntries(previous, [...previous.entries, draft]));
      }
      return { previous, key };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
      failed();
    },
    onSettled: (_data, _err, input) =>
      void qc.invalidateQueries({ queryKey: dayKey(input.log_date) }),
  });
}

export type EntryPatch = {
  meal_type?: MealType;
  log_date?: string;
  grams?: number;
  kcal?: number;
  custom_name?: string;
};

export function useUpdateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entry, patch }: { entry: LogEntry; patch: EntryPatch }) =>
      apiFetch<LogEntry>(`/food-logs/${encodeURIComponent(entry.id)}`, {
        method: 'PATCH',
        body: patch,
      }),
    onMutate: async ({ entry, patch }) => {
      const key = dayKey(entry.log_date);
      await qc.cancelQueries({ queryKey: key });
      const previousDay = qc.getQueryData<DayLog>(key);
      const previousEntry = qc.getQueryData<LogEntry>(entryKey(entry.id));

      let updated: LogEntry = { ...entry };
      if (patch.meal_type) updated.meal_type = patch.meal_type;
      if (patch.log_date) updated.log_date = patch.log_date;
      if (patch.custom_name !== undefined) updated.name = patch.custom_name;
      if (patch.kcal !== undefined) updated.kcal = Math.round(patch.kcal);
      if (patch.grams !== undefined && entry.grams) {
        updated = {
          ...updated,
          grams: patch.grams,
          ...scaleMacros(entry, patch.grams / entry.grams),
        };
      }

      if (previousDay) {
        const moved = updated.log_date !== entry.log_date;
        const entries = moved
          ? previousDay.entries.filter((e) => e.id !== entry.id)
          : previousDay.entries.map((e) => (e.id === entry.id ? updated : e));
        qc.setQueryData(key, withEntries(previousDay, entries));
      }
      qc.setQueryData(entryKey(entry.id), updated);
      return { previousDay, previousEntry, key };
    },
    onError: (_err, { entry }, ctx) => {
      if (ctx?.previousDay) qc.setQueryData(ctx.key, ctx.previousDay);
      if (ctx?.previousEntry) qc.setQueryData(entryKey(entry.id), ctx.previousEntry);
      failed();
    },
    onSettled: (_data, _err, { entry, patch }) => {
      void qc.invalidateQueries({ queryKey: dayKey(entry.log_date) });
      if (patch.log_date) void qc.invalidateQueries({ queryKey: dayKey(patch.log_date) });
      void qc.invalidateQueries({ queryKey: entryKey(entry.id) });
    },
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entry: LogEntry) =>
      apiFetch<void>(`/food-logs/${encodeURIComponent(entry.id)}`, { method: 'DELETE' }),
    onMutate: async (entry) => {
      const key = dayKey(entry.log_date);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DayLog>(key);
      if (previous) {
        qc.setQueryData(
          key,
          withEntries(
            previous,
            previous.entries.filter((e) => e.id !== entry.id),
          ),
        );
      }
      return { previous, key };
    },
    onError: (_err, _entry, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
      failed();
    },
    onSettled: (_data, _err, entry) => {
      void qc.invalidateQueries({ queryKey: dayKey(entry.log_date) });
      qc.removeQueries({ queryKey: entryKey(entry.id) });
    },
  });
}
