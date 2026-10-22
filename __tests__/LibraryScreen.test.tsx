import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import LibraryScreen from '../screens/LibraryScreen';
import { sampleLibrary } from '../data/library';
import { mockBriefs } from '../data/mockVideos';
import type { Clip } from '../types';

const NOW = Date.parse('2026-09-01T12:00:00Z');

async function renderLibrary(overrides: Partial<React.ComponentProps<typeof LibraryScreen>> = {}) {
  const sample = sampleLibrary(new Date(NOW));
  const props: React.ComponentProps<typeof LibraryScreen> = {
    clips: sample.clips,
    analyses: sample.analyses,
    briefClipIds: new Set(
      mockBriefs
        .map((brief) => brief.clip_id)
        .filter((clipId): clipId is string => clipId !== null)
    ),
    lastImportCount: 3,
    now: NOW,
    onSelectVideo: jest.fn(),
    onOpenBrandProfile: jest.fn(),
    onAddVideos: jest.fn(),
    onRetry: jest.fn(),
    onDelete: jest.fn(),
    tags: [],
    allTags: [],
    onTagsChange: jest.fn(),
    onSortChange: jest.fn(),
    hasMore: false,
    loadingMore: false,
    onLoadMore: jest.fn(),
    onSearchChange: jest.fn(),
    ...overrides,
  };
  const screen = await render(<LibraryScreen {...props} />);
  return { props, ...screen };
}

describe('LibraryScreen', () => {
  test('a clip with a thumbnail shows it inside its card', async () => {
    const sample = sampleLibrary(new Date(NOW));
    const clips = sample.clips.map((c, i) =>
      i === 0 ? { ...c, thumbnail_url: 'https://example.test/thumb.jpg' } : { ...c, thumbnail_url: null }
    );
    const { getByTestId, queryByTestId } = await renderLibrary({ clips });

    expect(getByTestId(`thumbnail-${clips[0].id}`).props.source).toEqual({
      uri: 'https://example.test/thumb.jpg',
    });
    expect(queryByTestId(`thumbnail-${clips[1].id}`)).toBeNull();
  });

  test('shows the empty state when nothing is saved', async () => {
    const onAddVideos = jest.fn();
    const screen = await renderLibrary({ clips: [], analyses: [], onAddVideos });

    expect(screen.getByText('Nothing saved yet')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add your first videos'));
    expect(onAddVideos).toHaveBeenCalled();
    expect(screen.queryByText('Just looking? Explore with sample videos')).toBeNull();
  });

  test('headline counts saved clips and clips without a brief', async () => {
    const { getByText } = await renderLibrary();

    // 5 sample clips; 3 of them have briefs in the mocks.
    expect(getByText('5 saved,\n2 untouched')).toBeTruthy();
    expect(getByText('Last import: 3 clips')).toBeTruthy();
    expect(getByText('5 results')).toBeTruthy();
  });

  test('analysed clips show their hook, stage and brief status', async () => {
    const { getByText, getAllByText } = await renderLibrary();

    expect(getByText("“I used to hit snooze 5 times. Here's what fixed it.”")).toBeTruthy();
    expect(getAllByText('Brief ready').length).toBe(3);
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

  test('typing asks the database rather than filtering what is loaded', async () => {
    jest.useFakeTimers();
    const onSearchChange = jest.fn();
    const { getByPlaceholderText } = await renderLibrary({ onSearchChange });

    await fireEvent.changeText(getByPlaceholderText('Search hooks, captions, tags'), 'snooze');

    // Debounced: a query per keystroke would flicker through the prefixes
    // of whatever is being typed.
    expect(onSearchChange).not.toHaveBeenCalledWith('snooze');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(onSearchChange).toHaveBeenCalledWith('snooze');
    jest.useRealTimers();
  });

  test('the rows it is given are the rows it shows', async () => {
    // Matching happens in Postgres against a document that includes the
    // transcript, which this screen never receives -- so it renders the
    // result rather than second-guessing it.
    const sample = sampleLibrary(new Date(NOW));
    const one = sample.clips.slice(0, 1);
    const { getByText } = await renderLibrary({
      clips: one,
      analyses: sample.analyses.filter((a) => a.clip_id === one[0].id),
    });

    expect(getByText('1 result')).toBeTruthy();
  });

  test('an empty result while filtering is not the empty library', async () => {
    // Both are zero rows. Only one of them means "add a video", and now
    // that matching happens in the query the screen has to tell them apart
    // from whether anything was asked for.
    const empty = await renderLibrary({ clips: [], analyses: [] });
    expect(empty.queryByText('No videos match your search.')).toBeNull();
    expect(empty.getByText('Add your first videos')).toBeTruthy();

    const filtered = await renderLibrary({ clips: [], analyses: [], tags: ['Beauty'] });
    expect(filtered.getByText('No videos match your search.')).toBeTruthy();
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
