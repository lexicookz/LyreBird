import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import App from '../App';
import { sampleCalendar } from '../data/calendar';

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn(async () => ({
    granted: false,
    canAskAgain: true,
    status: 'undetermined',
  })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [
      { uri: 'file:///a.mov', fileName: 'a.mov', duration: 31_000, width: 1080, height: 1920 },
      { uri: 'file:///b.mov', fileName: 'b.mov', duration: 44_000, width: 1080, height: 1920 },
      { uri: 'file:///c.mov', fileName: 'c.mov', duration: 120_000, width: 1080, height: 1920 },
    ],
  })),
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

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

  test('a new library shows the empty state', async () => {
    await AsyncStorage.setItem('lyrebird.onboarded', 'true');
    const { findByText } = await render(<App />);

    expect(await findByText('Nothing saved yet')).toBeTruthy();
  });

  test('the + button imports videos from the camera roll and starts analysing them', async () => {
    await AsyncStorage.setItem('lyrebird.onboarded', 'true');
    const { findByLabelText, findByText, getByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Add videos'));

    // First time: our explainer, then the system permission prompt and picker.
    expect(await findByText('We need to see your saved videos')).toBeTruthy();
    await fireEvent.press(getByText('Continue'));
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();

    // The 2-minute video is over the 90-second cap and is left out.
    expect(await findByText('2 videos selected')).toBeTruthy();
    await fireEvent.press(getByText('Import'));

    expect(await findByText('Analysing 2 new clips')).toBeTruthy();
  });

  test('a new calendar starts empty', async () => {
    await AsyncStorage.setItem('lyrebird.onboarded', 'true');
    const { findByLabelText, findByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Calendar'));

    expect(await findByText('Nothing to film\nthis week')).toBeTruthy();
    expect(await AsyncStorage.getItem('lyrebird.calendar')).toBeNull();
  });

  test('an entry on the calendar can be rescheduled and its status changed', async () => {
    await AsyncStorage.setItem('lyrebird.onboarded', 'true');
    await AsyncStorage.setItem('lyrebird.calendar', JSON.stringify(sampleCalendar()));
    const { findByLabelText, findByText, getByText, getAllByText, queryByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Calendar'));
    await fireEvent.press(await findByText("“I used to hit snooze 5 times. Here's what fixed it.”"));

    expect(await findByText('Schedule brief')).toBeTruthy();
    expect(getByText('Remove from calendar')).toBeTruthy();
    await fireEvent.press(getAllByText('Posted')[0]);
    await fireEvent.press(getByText('Save schedule'));

    expect(queryByText('Schedule brief')).toBeNull();
    expect(getByText('Posted')).toBeTruthy();
    const saved = JSON.parse((await AsyncStorage.getItem('lyrebird.calendar')) ?? '[]');
    expect(saved).toContainEqual(
      expect.objectContaining({ briefId: 'bbbbbbbb-0000-4000-8000-000000000001', status: 'posted' })
    );
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
