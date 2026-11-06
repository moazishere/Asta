import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChallengeCard, InvitationCard } from './components';
import { useChallenges, useDeclineChallenge, useJoinChallenge, useNow } from './hooks';
import { groupChallenges } from './logic';
import { challengeHref, newChallengeHref } from './routes';
import {
  EmptyView,
  ErrorView,
  RoundButton,
  Screen,
  SegmentedControl,
  SkeletonList,
  Text,
} from '@/components';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

type Tab = 'active' | 'upcoming' | 'finished';

export function ChallengesScreen() {
  const router = useRouter();
  const query = useChallenges();
  const now = useNow();
  const join = useJoinChallenge();
  const decline = useDeclineChallenge();
  const [tab, setTab] = useState<Tab>('active');

  const grouped = useMemo(() => groupChallenges(query.data ?? []), [query.data]);
  const shown = grouped[tab];

  const empty = {
    active: { title: t('challenges.emptyActive'), body: t('challenges.emptyActiveBody') },
    upcoming: { title: t('challenges.emptyUpcoming'), body: t('challenges.emptyUpcomingBody') },
    finished: { title: t('challenges.emptyFinished'), body: t('challenges.emptyFinishedBody') },
  }[tab];

  return (
    <Screen withTabBar>
      <View style={styles.stack}>
        <View style={styles.header}>
          <Text variant="display">{t('challenges.title')}</Text>
          <RoundButton
            icon="add"
            variant="accent"
            accessibilityLabel={t('challenges.new')}
            onPress={() => router.push(newChallengeHref)}
          />
        </View>

        {query.isPending ? (
          <SkeletonList count={3} height={120} />
        ) : query.isError ? (
          <ErrorView message={t('challenges.loadError')} onRetry={() => void query.refetch()} />
        ) : (
          <>
            {grouped.invitations.length > 0 ? (
              <View style={styles.section}>
                <Text variant="h2">{t('challenges.invitations')}</Text>
                {grouped.invitations.map((c) => (
                  <InvitationCard
                    key={c.id}
                    challenge={c}
                    onOpen={() => router.push(challengeHref(c.id))}
                    onJoin={() => join.mutate(c.id)}
                    onDecline={() => decline.mutate(c.id)}
                  />
                ))}
              </View>
            ) : null}

            <SegmentedControl
              value={tab}
              onChange={setTab}
              options={[
                { value: 'active', label: t('challenges.active') },
                { value: 'upcoming', label: t('challenges.upcoming') },
                { value: 'finished', label: t('challenges.finished') },
              ]}
            />

            {shown.length === 0 ? (
              <EmptyView icon="trophy-outline" title={empty.title} body={empty.body} />
            ) : (
              <View style={styles.section}>
                {shown.map((c) => (
                  <ChallengeCard
                    key={c.id}
                    challenge={c}
                    now={now}
                    onPress={() => router.push(challengeHref(c.id))}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { gap: spacing.md },
});
