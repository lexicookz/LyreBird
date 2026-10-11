// data/account.ts
// Who is signed in.
//
// Real Supabase accounts, replacing the local stand-in that accepted any
// email and password. The client persists the session in AsyncStorage and
// refreshes it, so a signed-in user stays signed in across restarts without
// this module storing anything itself.
//
// This matters beyond logging in. Every RLS policy is
// `to authenticated using (auth.uid() = owner_id)`, and the storage policies
// compare (storage.foldername(name))[1] to auth.uid(). Without a real session
// there is no uid, so a signed-out app cannot read its own rows or write a
// file to a path it owns -- it is not a gate in front of working features,
// it is what makes them work.
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type Account = { email: string };

export const MIN_PASSWORD_LENGTH = 6;

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Carries a message worth showing a user. */
export class AuthError extends Error {}

const NOT_CONFIGURED =
  'This build has no Supabase configuration. Copy .env.example to .env and fill in ' +
  'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';

function requireConfig() {
  if (!isSupabaseConfigured) throw new AuthError(NOT_CONFIGURED);
}

/**
 * Supabase writes its messages for developers. These are the ones a user can
 * act on; anything else passes through rather than hiding behind something
 * vague, because a wrong guess is worse than an unfamiliar message.
 */
function readable(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password don’t match.';
  if (m.includes('already registered')) return 'There’s already an account with that email.';
  if (m.includes('email not confirmed')) return 'Check your email to confirm the account first.';
  if (m.includes('network') || m.includes('failed to fetch')) {
    return 'Could not reach the server. Check your connection.';
  }
  return message;
}

function accountFrom(email: string | undefined): Account {
  return { email: (email ?? '').toLowerCase() };
}

/** The signed-in account, or null. Reads the persisted session. */
export async function loadAccount(): Promise<Account | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user?.email;
  return email ? accountFrom(email) : null;
}

export async function signIn(email: string, password: string): Promise<Account> {
  requireConfig();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new AuthError(readable(error.message));
  return accountFrom(data.user?.email);
}

export async function signUp(email: string, password: string): Promise<Account> {
  requireConfig();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new AuthError(readable(error.message));

  // With email confirmation enabled, signUp succeeds but returns no session.
  // The app would look signed in while every RLS query came back empty, so
  // say so rather than letting it through.
  if (!data.session) {
    throw new AuthError('Check your email to confirm the account, then log in.');
  }
  return accountFrom(data.user?.email);
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}
