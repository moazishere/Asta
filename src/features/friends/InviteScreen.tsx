import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { useLookup } from './hooks';
import { FoundPerson } from './FriendsScreen';
import { usePendingInvite } from './pendingInvite';
import {
  Button,
  Card,
  EmptyView,
  ErrorView,
  LoadingView,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/auth/useProfile';
import { ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

// Where an invite link lands (asta://invite/<username>, opened from the web page the shared link shows).
export function InviteScreen() {
  const { username: raw } = useLocalSearchParams<{ username: string }>();
  const username = String(raw ?? '').toLowerCase();
  const router = useRouter();
  const { session, loading } = useAuth();
  const profile = useProfile();
  const setPending = usePendingInvite((s) => s.set);

  const ready = !!session && !!profile.data?.onboarded_at;
  // Not signed in yet (or still onboarding): remember who invited us and come back after.
  useEffect(() => {
    if (!loading && !ready && !profile.isPending) setPending(username);
  }, [loading, ready, profile.isPending, setPending, username]);

  const lookup = useLookup(ready ? username : '');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (loading || (session && profile.isPending)) {
    return (
      <Screen scroll={false}>
        <LoadingView />
      </Screen>
    );
  }

  if (!ready) {
    // The root layout shows sign-in or onboarding; once finished it brings the user back here.
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <Text variant="h2" style={styles.text}>
            {t('invite.signInFirst', { username })}
          </Text>
          <Button label={t('common.continue')} onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  if (profile.data?.username === username) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('invite.title')} onBack={back} />
        <EmptyView icon="share-outline" title={t('invite.own')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.stack}>
        <ScreenHeader title={t('invite.title')} onBack={back} />
        {lookup.isPending || lookup.isFetching ? (
          <LoadingView />
        ) : lookup.isError ? (
          lookup.error instanceof ApiError && lookup.error.status === 404 ? (
            <EmptyView
              icon="search-outline"
              title={t('friends.notFound')}
              body={t('friends.notFoundBody')}
            />
          ) : (
            <ErrorView message={t('common.genericError')} onRetry={() => void lookup.refetch()} />
          )
        ) : (
          <Card style={styles.card}>
            <Text variant="h2">{t('invite.invitedYou', { username })}</Text>
            <FoundPerson result={lookup.data} />
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xl },
  card: { gap: spacing.lg },
  center: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  text: { textAlign: 'center' },
});
