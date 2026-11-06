import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { useRunsInfinite } from './hooks';
import { runHref } from './routes';
import { RunListItem } from './RunListItem';
import type { RunSummary } from './types';
import {
  EmptyView,
  ErrorView,
  LoadingView,
  Screen,
  ScreenHeader,
  SkeletonList,
} from '@/components';
import { useProfile } from '@/features/auth/useProfile';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

export function RunsScreen() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const query = useRunsInfinite();

  const runs = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const timeZone = profile?.timezone;

  const renderItem = useCallback(
    ({ item }: { item: RunSummary }) => (
      <RunListItem run={item} timeZone={timeZone} onPress={() => router.push(runHref(item.id))} />
    ),
    [router, timeZone],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  let body;
  if (query.isPending) {
    body = <SkeletonList count={5} height={88} />;
  } else if (query.isError && runs.length === 0) {
    body = <ErrorView message={t('history.error')} onRetry={() => void query.refetch()} />;
  } else if (runs.length === 0) {
    body = (
      <EmptyView icon="walk-outline" title={t('history.empty')} body={t('history.emptyBody')} />
    );
  } else {
    body = (
      <FlatList
        data={runs}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => void query.refetch()}
        ListFooterComponent={
          query.isFetchNextPageError ? (
            <ErrorView message={t('history.error')} onRetry={loadMore} />
          ) : query.isFetchingNextPage ? (
            <LoadingView />
          ) : undefined
        }
      />
    );
  }

  return (
    <Screen scroll={false}>
      <View style={styles.stack}>
        <ScreenHeader title={t('history.title')} onBack={() => router.back()} />
        <View style={styles.body}>{body}</View>
      </View>
    </Screen>
  );
}

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  stack: { flex: 1, gap: spacing.lg },
  body: { flex: 1 },
  separator: { height: spacing.md },
});
