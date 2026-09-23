// screens/SignInScreen.tsx
//
// Email/password sign-in. Deliberately minimal: the app needs a session
// because every RLS policy is `to authenticated`, so this exists to satisfy
// that, not as a finished onboarding flow.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { isSupabaseConfigured, supabase } from '../lib/supabase';

type Mode = 'signIn' | 'signUp';

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setNotice(null);

    if (!email.trim() || !password) {
      setError('Enter an email and password.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signIn') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        // No navigation here: SessionProvider is listening to auth state and
        // swaps the screen once the session lands.
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        // With email confirmations on, signUp returns no session and the user
        // has to confirm first. Say so rather than appearing to hang.
        if (!data.session) {
          setNotice('Account created. Check your email to confirm, then sign in.');
          setMode('signIn');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>Not configured</Text>
          <Text style={styles.configText}>
            EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are not set.
            Copy .env.example to .env, fill both in, and restart the dev server.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.centered}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.brand}>LYREBIRD</Text>
        <Text style={styles.title}>{mode === 'signIn' ? 'Sign in' : 'Create an account'}</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!busy}
        />

        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#aaa"
          secureTextEntry
          autoCapitalize="none"
          editable={!busy}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Pressable
          style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {mode === 'signIn' ? 'Sign in' : 'Sign up'}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
            setError(null);
            setNotice(null);
          }}
          disabled={busy}
        >
          <Text style={styles.switchLink}>
            {mode === 'signIn' ? 'No account? Sign up' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  brand: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#888',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  error: {
    fontSize: 13,
    color: '#c0392b',
    marginBottom: 12,
  },
  notice: {
    fontSize: 13,
    color: '#1d7a4c',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  switchLink: {
    marginTop: 18,
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
  },
  configText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
});
