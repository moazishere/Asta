import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, StartBar, Text } from '@/components';
import { t } from '@/lib/i18n';
import { colors, radii, spacing } from '@/theme';

const heroImage = require('../../../assets/images/enter.jpg');

// Landing screen: a full-bleed photo card with the headline over a dark fade, then the two actions.
export default function Welcome() {
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <View style={styles.root}>
        <View style={styles.hero}>
          {/* Decorative: the headline carries the meaning, so screen readers skip the photo. */}
          <Image
            source={heroImage}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <LinearGradient
            colors={[colors.scrimClear, colors.scrimDark]}
            locations={[0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.copy}>
            <Text variant="display">{t('auth.welcomeTitle')}</Text>
            <Text variant="display" color="accent">
              {t('auth.welcomeAccent')}
            </Text>
            <Text color="textMuted">{t('auth.welcomeBody')}</Text>
          </View>
        </View>
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
  hero: {
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
  },
  copy: { gap: spacing.xs, padding: spacing.xxl },
  actions: { gap: spacing.md },
});
