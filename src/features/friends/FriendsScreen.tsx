import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { PersonRow } from './components';
import {
  friendsErrorMessage,
  useAcceptRequest,
  useCancelRequest,
  useDeclineRequest,
  useFriends,
  useLookup,
  useSendRequest,
  useUnblockUser,
} from './hooks';
import { friendHref, inviteLink } from './routes';
import type { LookupResult } from './types';
import {
  Button,
  Card,
  Chip,
  EmptyView,
  ErrorView,
  Icon,
  Input,
  LoadingView,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { useProfile } from '@/features/auth/useProfile';
import { formatKm } from '@/features/run/geo';
import { ApiError } from '@/lib/api';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

export function FriendsScreen() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const query = useFriends();
  const accept = useAcceptRequest();
  const decline = useDeclineRequest();
  const cancel = useCancelRequest();
  const unblock = useUnblockUser();

  const username = profile?.username ?? '';
  const nothingYet =
    query.data &&
    query.data.friends.length === 0 &&
    query.data.incoming.length === 0 &&
    query.data.outgoing.length === 0;

  return (
    <Screen>
      <View style={styles.stack}>
        <ScreenHeader title={t('friends.title')} onBack={() => router.back()} />

        <AddFriend />

        {username ? (
          <View style={styles.share}>
            <Text variant="caption" color="textMuted" style={styles.center}>
              {t('friends.myUsername', { username })}
            </Text>
            <Button
              label={t('friends.shareInvite')}
              icon="share-outline"
              variant="dark"
              onPress={() =>
                void Share.share({
                  message: t('friends.shareMessage', { username, link: inviteLink(username) }),
                })
              }
            />
          </View>
        ) : null}

        {query.isPending ? (
          <LoadingView />
        ) : query.isError ? (
          <ErrorView message={t('friends.loadError')} onRetry={() => void query.refetch()} />
        ) : (
          <>
            {query.data.incoming.length > 0 ? (
              <Section title={t('friends.requests')}>
                {query.data.incoming.map((r) => (
                  <PersonRow
                    key={r.friendship_id}
                    person={r.user}
                    trailing={
                      <View style={styles.actions}>
                        <Chip
                          label={t('friends.accept')}
                          selected
                          onPress={() => accept.mutate(r.friendship_id)}
                        />
                        <Chip
                          label={t('friends.decline')}
                          onPress={() => decline.mutate(r.friendship_id)}
                        />
                      </View>
                    }
                  />
                ))}
              </Section>
            ) : null}

            {query.data.outgoing.length > 0 ? (
              <Section title={t('friends.sent')}>
                {query.data.outgoing.map((r) => (
                  <PersonRow
                    key={r.friendship_id}
                    person={r.user}
                    trailing={
                      <Chip
                        label={t('friends.cancel')}
                        onPress={() => cancel.mutate(r.friendship_id)}
                      />
                    }
                  />
                ))}
              </Section>
            ) : null}

            {query.data.friends.length > 0 ? (
              <Section title={t('friends.yourFriends')}>
                {query.data.friends.map((f) => (
                  <PersonRow
                    key={f.friendship_id}
                    person={f.user}
                    subtitle={t('friends.weekDistance', { km: formatKm(f.week_distance_m) })}
                    onPress={() => router.push(friendHref(f.user.id))}
                  />
                ))}
              </Section>
            ) : null}

            {nothingYet ? (
              <EmptyView
                icon="people-outline"
                title={t('friends.empty')}
                body={t('friends.emptyBody')}
              />
            ) : null}

            {query.data.blocked.length > 0 ? (
              <Section title={t('friends.blocked')}>
                {query.data.blocked.map((b) => (
                  <PersonRow
                    key={b.friendship_id}
                    person={b.user}
                    trailing={
                      <Chip
                        label={t('friends.unblock')}
                        onPress={() => unblock.mutate(b.user.id)}
                      />
                    }
                  />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="h2">{title}</Text>
      {children}
    </View>
  );
}

// Search by exact username, then act on the result right here.
function AddFriend() {
  const [text, setText] = useState('');
  const [searched, setSearched] = useState('');
  const lookup = useLookup(searched);

  const submit = () => setSearched(text.trim().toLowerCase().replace(/^@/, ''));

  return (
    <Card style={styles.add}>
      <Text variant="title">{t('friends.addTitle')}</Text>
      <Input
        label={t('friends.usernameLabel')}
        icon="at"
        value={text}
        onChangeText={(v) => {
          setText(v);
          if (v.trim() === '') setSearched('');
        }}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={submit}
      />
      <Button
        label={t('friends.find')}
        variant="dark"
        onPress={submit}
        disabled={text.trim() === ''}
      />
      {searched ? <LookupResultView query={lookup} /> : null}
    </Card>
  );
}

function LookupResultView({ query }: { query: ReturnType<typeof useLookup> }) {
  if (query.isPending || query.isFetching) return <LoadingView />;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return notFound ? (
      <View style={styles.found}>
        <Text variant="bodyStrong">{t('friends.notFound')}</Text>
        <Text variant="caption" color="textMuted">
          {t('friends.notFoundBody')}
        </Text>
      </View>
    ) : (
      <ErrorView message={friendsErrorMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  }
  return <FoundPerson result={query.data} />;
}

/** The person found by username, with the one action that makes sense for the current relationship. */
export function FoundPerson({ result }: { result: LookupResult }) {
  const send = useSendRequest();
  const accept = useAcceptRequest();
  const { user, relationship, friendship_id } = result;

  let action;
  switch (relationship) {
    case 'none':
      action = (
        <Button
          label={t('friends.sendRequest')}
          icon="person-add-outline"
          onPress={() => send.mutate(user.username)}
          loading={send.isPending}
        />
      );
      break;
    case 'incoming':
      action = (
        <Button
          label={t('friends.accept')}
          onPress={() => friendship_id && accept.mutate(friendship_id)}
          loading={accept.isPending}
        />
      );
      break;
    case 'outgoing':
      action = <StatusLine icon="time-outline" text={t('friends.requestSent')} />;
      break;
    case 'friends':
      action = <StatusLine icon="checkmark-circle-outline" text={t('friends.alreadyFriends')} />;
      break;
    default:
      action = <StatusLine icon="ban-outline" text={t('friends.blockedByYou')} />;
  }

  return (
    <View style={styles.found}>
      <PersonRow
        person={user}
        subtitle={relationship === 'incoming' ? t('friends.theyAsked') : `@${user.username}`}
      />
      {action}
    </View>
  );
}

function StatusLine({
  icon,
  text,
}: {
  icon: 'time-outline' | 'checkmark-circle-outline' | 'ban-outline';
  text: string;
}) {
  return (
    <View style={styles.status}>
      <Icon name={icon} color="textMuted" size="iconSm" />
      <Text variant="bodyStrong" color="textMuted">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xl },
  center: { textAlign: 'center' },
  add: { gap: spacing.md },
  share: { gap: spacing.sm },
  section: { gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  found: { gap: spacing.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
