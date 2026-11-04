import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from './AuthProvider';
import { Button, Input, Screen, Text } from '@/components';
import { t } from '@/lib/i18n';
import { colors, spacing } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const isSignUp = mode === 'sign-up';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailError = submitted && !EMAIL_RE.test(email.trim()) ? t('auth.errorEmail') : undefined;
  const passwordError = submitted && password.length < 8 ? t('auth.errorPassword') : undefined;

  async function onSubmit() {
    setSubmitted(true);
    setError(null);
    setNotice(null);
    if (!EMAIL_RE.test(email.trim()) || password.length < 8) return;

    setBusy('password');
    const cleanEmail = email.trim().toLowerCase();
    if (isSignUp) {
      const res = await signUp(cleanEmail, password);
      if (res.error) setError(res.error);
      else if (res.needsConfirmation) setNotice(t('auth.checkEmail'));
    } else {
      const res = await signIn(cleanEmail, password);
      if (res.error) setError(res.error);
    }
    setBusy(null);
  }

  async function onGoogle() {
    setError(null);
    setBusy('google');
    const res = await signInWithGoogle();
    if (res.error) setError(res.error);
    setBusy(null);
  }

  return (
    <Screen>
      <View style={styles.form}>
        <Text variant="h1">{isSignUp ? t('auth.signUpTitle') : t('auth.signInTitle')}</Text>

        <Input
          label={t('auth.email')}
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Input
          label={t('auth.password')}
          icon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          textContentType={isSignUp ? 'newPassword' : 'password'}
        />

        {error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text variant="caption" color="accent" accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}

        <Button
          label={isSignUp ? t('auth.signUp') : t('auth.signIn')}
          onPress={onSubmit}
          loading={busy === 'password'}
          disabled={busy === 'google'}
        />

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text variant="caption" color="textMuted">
            {t('auth.or')}
          </Text>
          <View style={styles.line} />
        </View>

        <Button
          label={t('auth.google')}
          icon="logo-google"
          variant="light"
          onPress={onGoogle}
          loading={busy === 'google'}
          disabled={busy === 'password'}
        />

        <Link href={isSignUp ? '/sign-in' : '/sign-up'} replace style={styles.switch}>
          <Text variant="bodyStrong" color="textMuted">
            {isSignUp ? t('auth.haveAccount') : t('auth.noAccount')}
          </Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg, paddingTop: spacing.xxxl },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  switch: { textAlign: 'center', paddingVertical: spacing.md },
});
