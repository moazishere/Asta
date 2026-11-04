import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Screen, StartBar, Text } from '@/components';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

// Landing screen: the light-grey hero card from the reference design, minus the photo.
export default function Welcome() {
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <View style={styles.root}>
        <Card tone="light" style={styles.hero}>
          <View style={styles.icon}>
            <Icon name="walk" size="iconLg" color="textMutedOnLight" />
          </View>
          <View style={styles.copy}>
            <Text variant="display" color="textOnLight">
              {t('auth.welcomeTitle')}
            </Text>
            <Text variant="display" color="accentOnLight">
              {t('auth.welcomeAccent')}
            </Text>
            <Text color="textMutedOnLight">{t('auth.welcomeBody')}</Text>
          </View>
        </Card>
        <View style={styles.actions}>
          <StartBar label={t('auth.signUp')} icon="walk" onPress={() => router.push('/sign-up')} />
          <Button
            label={t('auth.signIn')}
            variant="ghost"
            onPress={() => router.push('/sign-in')}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.xl },
  hero: { flex: 1, justifyContent: 'space-between', padding: spacing.xxl },
  icon: { alignSelf: 'flex-end', opacity: 0.6 },
  copy: { gap: spacing.xs },
  actions: { gap: spacing.md },
});
