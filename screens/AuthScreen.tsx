// screens/AuthScreen.tsx
// Log in (Figma: "Log-in", 96:1825) and Sign up. Sign up mirrors the log-in
// layout; the Figma "Sign up" frame couldn't be read when this was built.
// Accounts are a local stand-in for now -- see data/account.ts.
import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eyebrow, PrimaryButton } from '../components/ui';
import { MIN_PASSWORD_LENGTH, isValidEmail } from '../data/account';
import { fonts, pagePadding, radius, Colors, useStyles, useTheme } from '../theme';

export type AuthMode = 'login' | 'signup';

const COPY: Record<AuthMode, { title: string; body: string; button: string; switchPrompt: string; switchLink: string }> = {
  login: {
    title: 'Welcome back',
    body: 'Your swipe file is where you left it. We analysed the clips you added while you were away.',
    button: 'Log in',
    switchPrompt: 'New here?',
    switchLink: 'Create an account',
  },
  signup: {
    title: 'Create your account',
    body: 'Save the videos you keep meaning to copy. It takes a minute, and you can change everything later.',
    button: 'Create account',
    switchPrompt: 'Already have an account?',
    switchLink: 'Log in',
  },
};

export default function AuthScreen({
  mode,
  savedCount = 0,
  onSubmit,
  onSwitchMode,
}: {
  mode: AuthMode;
  /** Shown on the mascot's tag when logging back in. */
  savedCount?: number;
  onSubmit: (email: string) => void;
  onSwitchMode: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const s = width / 402;
  const copy = COPY[mode];

  function handleSubmit() {
    if (!isValidEmail(email)) {
      setError('That email doesn’t look right.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setError(null);
    onSubmit(email);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
          <Text style={styles.wordmark}>LYREBIRD</Text>

          <View style={{ height: 220 * s }}>
            <View style={[styles.shape, { backgroundColor: colors.green, right: -pagePadding, top: 18 * s, width: 80 * s, height: 110 * s }]} />
            <View style={[styles.shape, { backgroundColor: colors.peach, left: -pagePadding - 30 * s, top: 150 * s, width: 90 * s, height: 90 * s, borderRadius: 999 }]} />
            <Image
              source={require('../assets/mascots/hero.png')}
              style={{ position: 'absolute', left: 50 * s, top: 18 * s, width: 245 * s, height: 200 * s }}
              resizeMode="contain"
            />
            {mode === 'login' && savedCount > 0 && (
              <View style={[styles.tag, { left: 0, top: 36 * s }]}>
                <Text style={styles.tagText}>{savedCount} saved</Text>
              </View>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.body}>{copy.body}</Text>
          </View>

          <View style={styles.field}>
            <Eyebrow>Email</Eyebrow>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@brand.com"
              placeholderTextColor={colors.textPlaceholder}
              accessibilityLabel="Email"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Eyebrow>Password</Eyebrow>
            <View style={styles.passwordRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters` : ''}
                placeholderTextColor={colors.textPlaceholder}
                accessibilityLabel="Password"
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={8}
                accessibilityRole="button"
                style={styles.show}
              >
                <Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>
          </View>

          {error && (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <PrimaryButton label={copy.button} onPress={handleSubmit} style={styles.buttonShadow} />

          <Text style={styles.switchRow}>
            {copy.switchPrompt}{' '}
            <Text onPress={onSwitchMode} style={styles.switchLink} accessibilityRole="link">
              {copy.switchLink}
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: pagePadding + 8,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
    overflow: 'hidden',
  },
  wordmark: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 1.54,
    color: colors.textLabel,
  },
  shape: {
    position: 'absolute',
  },
  tag: {
    position: 'absolute',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.pink,
    transform: [{ rotate: '-8deg' }],
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  tagText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.onPastel,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -1.3,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textMuted,
  },
  field: {
    gap: 6,
  },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radius.field,
    backgroundColor: colors.field,
    fontFamily: fonts.body,
    fontSize: 14.5,
    color: colors.ink,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.field,
    backgroundColor: colors.field,
  },
  show: {
    paddingHorizontal: 16,
  },
  showText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textStrong,
  },
  error: {
    borderRadius: radius.card,
    backgroundColor: colors.pink,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.onPastel,
  },
  buttonShadow: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 7,
    elevation: 6,
  },
  switchRow: {
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  switchLink: {
    fontFamily: fonts.bodySemiBold,
    color: colors.ink,
  },
});
