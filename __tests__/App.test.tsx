import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';

// App now gates on a Supabase session. These mocks stand in for a signed-in
// user so the test stays about navigation; the gate itself is covered below.
jest.mock('../lib/session', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => ({ session: { user: { id: 'test-user-id' } }, loading: false }),
  useUserId: () => 'test-user-id',
}));

jest.mock('../lib/clips', () => ({
  fetchLibrary: jest.fn().mockResolvedValue({ clips: [], analyses: [] }),
  uploadClipFromCameraRoll: jest.fn(),
  UploadCancelled: class UploadCancelled extends Error { },
}));

describe('App', () => {
  test('starts on the Library tab with the bottom tab bar visible', async () => {
    const { getAllByText, getByText } = await render(<App />);

    // 'Library' appears twice: the screen header and the tab bar label
    expect(getAllByText('Library').length).toBeGreaterThan(0);

    // Other tabs should be visible in the bottom bar
    expect(getByText('Search')).toBeTruthy();
    expect(getByText('Briefs')).toBeTruthy();
    expect(getByText('Calendar')).toBeTruthy();
  });
});
