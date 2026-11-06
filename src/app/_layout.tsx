import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, Screen, Text } from '@/components';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/auth/useProfile';
import { FriendsBootstrap } from '@/features/friends/FriendsBootstrap';
import { RunBootstrap } from '@/features/run/RunBootstrap';
import { t } from '@/lib/i18n';
import { queryClient } from '@/lib/queryClient';
import { colors, spacing } from '@/theme';

// Registers the background location task. Must be imported at startup so the OS can run it even
// when no screen exists (the app was woken in the background).
import '@/features/run/locationTask';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Route protection: exactly one of the three groups below is reachable at any time, and expo-router
// redirects automatically when the guard flips (e.g. sign-out, or onboarding finishing).
function RootNavigator() {
  const { session, loading, offline, retry } = useAuth();
  const profile = useProfile();

  const ready = !loading && (!session || !profile.isPending);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  // Startup could not reach the API, so we cannot tell whether the stored login is still valid.
  if (offline) {
    return (
      <Screen scroll={false}>
        <View style={styles.error}>
          <Text variant="h2">{t('auth.errorNetwork')}</Text>
          <Button label={t('common.retry')} onPress={retry} />
        </View>
      </Screen>
    );
  }

  if (session && profile.isError) {
    return (
      <Screen scroll={false}>
        <View style={styles.error}>
          <Text variant="h2">{t('common.genericError')}</Text>
          <Button label={t('common.retry')} onPress={() => profile.refetch()} />
        </View>
      </Screen>
    );
  }

  const signedIn = !!session;
  const needsOnboarding = signedIn && !profile.data?.onboarded_at;

  return (
    <>
      {signedIn && !needsOnboarding ? (
        <>
          <RunBootstrap />
          <FriendsBootstrap />
        </>
      ) : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={needsOnboarding}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !needsOnboarding}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="run-summary" options={{ presentation: 'modal' }} />
          <Stack.Screen name="runs/index" />
          <Stack.Screen name="runs/[id]" />
          <Stack.Screen name="food-log/add" />
          <Stack.Screen name="food-log/amount" />
          <Stack.Screen name="food-log/[id]" />
          <Stack.Screen name="challenges/new" />
          <Stack.Screen name="challenges/[id]" />
          <Stack.Screen name="friends/index" />
          <Stack.Screen name="friends/[id]" />
        </Stack.Protected>
        {/* invite/[username] is deliberately not listed in a guarded group: an invite link must open even
          while signed out (it then remembers the invite and sends the user to sign in). */}
        {/* Dev-only component gallery: not reachable in release builds. */}
        <Stack.Protected guard={__DEV__ && signedIn && !needsOnboarding}>
          <Stack.Screen name="dev/gallery" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  error: { flex: 1, justifyContent: 'center', gap: spacing.lg },
});
