import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';

// The gate is the reason the rest of the app can assume auth.uid() exists.
// Every RLS policy is `to authenticated`, so rendering the tabs while signed
// out would show an empty library and fail on upload with no visible cause.

const mockUseSession = jest.fn();

jest.mock('../lib/session', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => mockUseSession(),
  useUserId: () => null,
}));

jest.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: {} },
}));

jest.mock('../lib/clips', () => ({
  fetchLibrary: jest.fn().mockResolvedValue({ clips: [], analyses: [] }),
  uploadClipFromCameraRoll: jest.fn(),
  UploadCancelled: class UploadCancelled extends Error { },
}));

describe('auth gate', () => {
  test('shows the sign-in screen when there is no session', async () => {
    mockUseSession.mockReturnValue({ session: null, loading: false });

    const { getByPlaceholderText, queryByText } = await render(<App />);

    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    // The tab bar must not be reachable while signed out.
    expect(queryByText('Briefs')).toBeNull();
  });

  test('does not flash the sign-in screen while the stored session loads', async () => {
    mockUseSession.mockReturnValue({ session: null, loading: true });

    const { queryByPlaceholderText, queryByText } = await render(<App />);

    // A persisted session is read from AsyncStorage asynchronously. Showing
    // sign-in during that window would bounce an already-signed-in user.
    expect(queryByPlaceholderText('Email')).toBeNull();
    expect(queryByText('Briefs')).toBeNull();
  });
});
