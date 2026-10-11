// data/account.ts
// Who is signed in -- a LOCAL STAND-IN until real accounts exist.
//
// The Log in and Sign up screens are built, but nothing is checked: any email
// and password (6+ characters) gets in, and only the email is remembered on the
// device. Real accounts are being built separately with Supabase auth (branch
// be-09); when that lands, replace these three functions with supabase.auth
// calls (signUp / signInWithPassword / signOut) and read the session instead.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Account = { email: string };

const ACCOUNT_KEY = 'lyrebird.account';

export const MIN_PASSWORD_LENGTH = 6;

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function loadAccount(): Promise<Account | null> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

/** Stand-in for both sign up and log in. */
export async function signIn(email: string): Promise<Account> {
  const account = { email: email.trim().toLowerCase() };
  await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

export async function signOut() {
  await AsyncStorage.removeItem(ACCOUNT_KEY);
}
