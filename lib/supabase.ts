// lib/supabase.ts
//
// The app's Supabase client. It uses the **anon** key and is constrained by
// RLS — the service role key lives only in /worker and must never reach here.
//
// Config comes from EXPO_PUBLIC_* env vars, which Expo inlines at build time.
// Copy .env.example to .env and fill it in; .env is gitignored.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../supabase/database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Whether both env vars were present at build time. Screens check this so a
 * missing .env surfaces as a readable message instead of a network error with
 * no explanation.
 *
 * Deliberately not a throw at module scope: that would take down the jest
 * suite in CI, which has no .env and does not need one.
 */
export const isSupabaseConfigured = url !== '' && anonKey !== '';

export const supabase = createClient<Database>(
  // Placeholders keep createClient from throwing on an empty string. Nothing
  // reaches them: screens gate on isSupabaseConfigured first.
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key-placeholder',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar for an OAuth redirect to come back through.
      detectSessionInUrl: false,
    },
  },
);
