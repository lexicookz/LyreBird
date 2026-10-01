import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';

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