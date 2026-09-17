import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';

describe('App', () => {
  test('starts on the Library screen', async () => {
    const { getByText } = await render(<App />);

    expect(getByText('Library')).toBeTruthy();
    expect(getByText('Calendar')).toBeTruthy();
    expect(getByText('Brand Profile')).toBeTruthy();
  });
});
