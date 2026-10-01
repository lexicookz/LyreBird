import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

describe('App', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('a first launch starts on the opener', async () => {
    const { findByText } = await render(<App />);

    expect(await findByText("Hi. Let's start creating")).toBeTruthy();
  });

  test('once onboarded, starts on the Library tab with the bottom tab bar visible', async () => {
    await AsyncStorage.setItem('lyrebird.onboarded', 'true');
    const { findAllByText, getByText } = await render(<App />);

    // 'Library' appears twice: the screen header and the tab bar label
    expect((await findAllByText('Library')).length).toBeGreaterThan(0);

    // Other tabs should be visible in the bottom bar
    expect(getByText('Search')).toBeTruthy();
    expect(getByText('Briefs')).toBeTruthy();
    expect(getByText('Calendar')).toBeTruthy();
  });

  test('the + button in the tab bar opens Import', async () => {
    await AsyncStorage.setItem('lyrebird.onboarded', 'true');
    const { findByLabelText, findByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Add videos'));

    expect(await findByText('Import videos')).toBeTruthy();
  });

  test('skipping the opener goes straight to the app and is remembered', async () => {
    const { findByText, findAllByText } = await render(<App />);

    await fireEvent.press(await findByText('Skip'));

    expect((await findAllByText('Library')).length).toBeGreaterThan(0);
    expect(await AsyncStorage.getItem('lyrebird.onboarded')).toBe('true');
  });

  test('completing brand setup saves the answers', async () => {
    const { findByText, getByText, getByLabelText, findAllByText } = await render(<App />);

    await fireEvent.press(await findByText('Start collecting'));

    // Step 1: brand name and audience
    await fireEvent.changeText(getByLabelText('Brand name'), 'Nima Studio');
    await fireEvent.changeText(getByLabelText("Who it's for"), 'People who hate plastic');
    await fireEvent.press(getByText('Continue'));

    // Step 2: pick a tone
    await fireEvent.press(await findByText('Dry humour'));
    await fireEvent.press(getByText('Continue'));

    // Step 3: add a common one
    await fireEvent.press(await findByText('+ “Miracle”'));
    await fireEvent.press(getByText('Continue'));

    // Step 4: pick Convert and finish
    await fireEvent.press(await findByText('Convert'));
    await fireEvent.press(getByText('Finish setup'));

    expect((await findAllByText('Library')).length).toBeGreaterThan(0);
    const saved = JSON.parse((await AsyncStorage.getItem('lyrebird.brandSetup')) ?? '{}');
    expect(saved).toMatchObject({
      name: 'Nima Studio',
      target_audience: 'People who hate plastic',
      tones: ['Dry humour'],
      avoid: ['“Miracle”'],
      focus: 'BOFU',
    });
  });
});
