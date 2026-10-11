import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCalendar, type CalendarItem } from '../data/calendar';

const STORAGE_KEY = 'lyrebird.calendar';

const originalItem: CalendarItem = {
  briefId: 'bbbbbbbb-0000-4000-8000-000000000001',
  date: '2026-10-10',
  stage: 'TOFU',
  status: 'planned',
};

const rescheduledItem: CalendarItem = {
  ...originalItem,
  date: '2026-11-15',
  stage: 'BOFU',
  status: 'filmed',
};

describe('useCalendar persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('loads stored calendar entries', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([originalItem])
    );

    const { result } = await renderHook(() => useCalendar());

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.items).toEqual([originalItem]);
  });

  it('saves a scheduled entry', async () => {
    const { result } = await renderHook(() => useCalendar());

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    await act(async () => {
      result.current.schedule(originalItem);
    });

    expect(result.current.items).toEqual([originalItem]);
    expect(
      JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!)
    ).toEqual([originalItem]);
  });

  it('replaces an existing entry when the same brief is rescheduled', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([originalItem])
    );

    const { result } = await renderHook(() => useCalendar());

    await waitFor(() => {
      expect(result.current.items).toEqual([originalItem]);
    });

    await act(async () => {
      result.current.schedule(rescheduledItem);
    });

    expect(result.current.items).toEqual([rescheduledItem]);
    expect(
      JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!)
    ).toEqual([rescheduledItem]);
  });

  it('removes an unscheduled entry from state and storage', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([originalItem])
    );

    const { result } = await renderHook(() => useCalendar());

    await waitFor(() => {
      expect(result.current.items).toEqual([originalItem]);
    });

    await act(async () => {
      result.current.unschedule(originalItem.briefId);
    });

    expect(result.current.items).toEqual([]);
    expect(
      JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!)
    ).toEqual([]);
  });

  it('recovers safely from invalid stored JSON', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'invalid JSON');

    const { result } = await renderHook(() => useCalendar());

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.items).toEqual([]);
  });
});