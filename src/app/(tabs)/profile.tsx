import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar, Button, ListRow, Screen, Text } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/auth/useProfile';
import { useIncomingCount } from '@/features/friends/hooks';
import { friendsHref } from '@/features/friends/routes';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

export default function Profile() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: profile } = useProfile();
  const incoming = useIncomingCount();
  const name = profile?.display_name ?? profile?.username ?? '';

  return (
    <Screen withTabBar>
      <View style={styles.stack}>
        <View style={styles.head}>
          <Avatar name={name} uri={profile?.avatar_url} size="avatarLg" ring />
          <Text variant="h1">{name}</Text>
          <Text color="textMuted">@{profile?.username}</Text>
        </View>

        <ListRow
          icon="flame-outline"
          title={t('profile.dailyGoal')}
          value={profile?.daily_kcal_goal ? `${profile.daily_kcal_goal} ${t('units.kcal')}` : '-'}
        />
        <ListRow
          icon="people-outline"
          title={t('friends.title')}
          value={incoming > 0 ? String(incoming) : undefined}
          onPress={() => router.push(friendsHref)}
        />
        {__DEV__ ? (
          <ListRow
            icon="color-palette-outline"
            title={t('profile.devGallery')}
            onPress={() => router.push('/dev/gallery')}
          />
        ) : null}

        <Button label={t('auth.signOut')} variant="dark" onPress={signOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  head: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
});
