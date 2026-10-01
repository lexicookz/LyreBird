import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LibraryScreen from '../screens/LibraryScreen';
import { sampleLibrary } from '../data/library';
import type { Clip } from '../types';

const NOW = Date.parse('2026-09-01T12:00:00Z');

async function renderLibrary(overrides: Partial<React.ComponentProps<typeof LibraryScreen>> = {}) {
  const sample = sampleLibrary(new Date(NOW));
  const props: React.ComponentProps<typeof LibraryScreen> = {
    clips: sample.clips,
    analyses: sample.analyses,
    lastImportCount: 3,
    now: NOW,
    onSelectVideo: jest.fn(),
    onOpenBrandProfile: jest.fn(),
    onAddVideos: jest.fn(),
    onLoadSamples: jest.fn(),
    onRetry: jest.fn(),
    ...overrides,
  };
  const screen = await render(<LibraryScreen {...props} />);
  return { props, ...screen };
}

describe('LibraryScreen', () => {
  test('shows the empty state when nothing is saved', async () => {
    const onAddVideos = jest.fn();
    const onLoadSamples = jest.fn();
    const screen = await renderLibrary({ clips: [], analyses: [], onAddVideos, onLoadSamples });

    expect(screen.getByText('Nothing saved yet')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add your first videos'));
    expect(onAddVideos).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Just looking? Explore with sample videos'));
    expect(onLoadSamples).toHaveBeenCalled();
  });

  test('headline counts saved clips and clips without a brief', async () => {
    const { getByText } = await renderLibrary();

    // 5 sample clips; 2 of them have briefs in the mocks.
    expect(getByText('5 saved,\n3 untouched')).toBeTruthy();
    expect(getByText('Last import: 3 clips')).toBeTruthy();
    expect(getByText('5 results')).toBeTruthy();
  });

  test('analysed clips show their hook, stage and brief status', async () => {
    const { getByText, getAllByText } = await renderLibrary();

    expect(getByText("“I used to hit snooze 5 times. Here's what fixed it.”")).toBeTruthy();
    expect(getAllByText('Brief ready').length).toBe(2);
    expect(getAllByText('Awareness').length).toBeGreaterThan(0);
  });

  test('a processing clip shows the analysing banner and placeholder', async () => {
    const { getByText, getByLabelText } = await renderLibrary();

    expect(getByText('Analysing 1 new clip')).toBeTruthy();
    expect(getByLabelText('Analysing POV: your product finally sells itself')).toBeTruthy();
  });

  test('a failed clip can be retried', async () => {
    const { getByLabelText, props } = await renderLibrary();

    await fireEvent.press(
      getByLabelText('Try analysing The pricing page mistake costing you customers again')
    );
    expect(props.onRetry).toHaveBeenCalledWith('cccccccc-0000-4000-8000-000000000004');
  });

  test('search matches hooks', async () => {
    const { getByPlaceholderText, getByText, queryByText } = await renderLibrary();

    await fireEvent.changeText(getByPlaceholderText('Search hooks, captions, tags'), 'snooze');

    expect(getByText("“I used to hit snooze 5 times. Here's what fixed it.”")).toBeTruthy();
    expect(queryByText('“Your welcome email has a 3-second window. Most brands waste it.”')).toBeNull();
    expect(getByText('1 result')).toBeTruthy();
  });

  test('shows a message when nothing matches', async () => {
    const { getByPlaceholderText, getByText } = await renderLibrary();

    await fireEvent.changeText(
      getByPlaceholderText('Search hooks, captions, tags'),
      'this query matches nothing at all'
    );

    expect(getByText('No videos match your search.')).toBeTruthy();
  });

  test('funnel chips filter by stage', async () => {
    const { getByText, getAllByText, queryByText } = await renderLibrary();

    // The chip row renders before the cards, which also carry stage labels.
    await fireEvent.press(getAllByText('Consider')[0]);

    expect(getByText('“Your welcome email has a 3-second window. Most brands waste it.”')).toBeTruthy();
    expect(queryByText("“I used to hit snooze 5 times. Here's what fixed it.”")).toBeNull();
  });

  test('tapping a card opens it', async () => {
    const { getByText, props } = await renderLibrary();

    await fireEvent.press(getByText("“I used to hit snooze 5 times. Here's what fixed it.”"));

    expect(props.onSelectVideo).toHaveBeenCalledWith(
      expect.objectContaining<Partial<Clip>>({ id: 'cccccccc-0000-4000-8000-000000000001' })
    );
  });
});
