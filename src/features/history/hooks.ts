import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

import type { RunDetail, RunsPage, WeeklyStats } from './types';
import { apiFetch } from '@/lib/api';
import { invalidateRunData } from '@/lib/queryClient';

const PAGE_SIZE = 20;

/** The full history, loaded a page at a time as the list scrolls (keyset pagination on the server). */
export function useRunsInfinite() {
  return useInfiniteQuery({
    queryKey: ['runs', 'list'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<RunsPage>(
        `/runs?limit=${PAGE_SIZE}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** The latest few runs for the Home screen. */
export function useRecentRuns(count = 3) {
  return useQuery({
    queryKey: ['runs', 'recent', count],
    queryFn: () => apiFetch<RunsPage>(`/runs?limit=${count}`),
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ['runs', 'detail', id],
    queryFn: () => apiFetch<RunDetail>(`/runs/${encodeURIComponent(id)}`),
  });
}

export function useWeeklyStats() {
  return useQuery({
    queryKey: ['stats', 'weekly'],
    queryFn: () => apiFetch<WeeklyStats>('/stats/weekly'),
  });
}

export function useDeleteRun() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/runs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    // The list, the detail cache and the weekly totals all depend on this run.
    onSuccess: invalidateRunData,
  });
}
