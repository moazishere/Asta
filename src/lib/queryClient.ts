import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

/** Call after a run is uploaded or deleted: refreshes the history list, run details and weekly totals. */
export function invalidateRunData() {
  void queryClient.invalidateQueries({ queryKey: ['runs'] });
  void queryClient.invalidateQueries({ queryKey: ['stats'] });
}
