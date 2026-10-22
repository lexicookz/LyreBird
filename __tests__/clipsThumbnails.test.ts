// fetchLibrary signs each clip's thumbnail so the private image can be shown.
// Supabase is replaced with a small fake that answers the two queries
// fetchLibrary makes (clips, then analyses) and the storage signing call.

const mockCreateSignedUrls = jest.fn();

const mockAnalysesOr = jest.fn();

jest.mock('expo-file-system', () => ({ File: jest.fn() }));

jest.mock('../lib/supabase', () => {
  const clips = [
    { id: 'c1', thumbnail_path: 'u1/a-thumb.jpg', thumbnail_url: null, created_at: '2026-10-01T00:00:00Z' },
    { id: 'c2', thumbnail_path: null, thumbnail_url: null, created_at: '2026-10-02T00:00:00Z' },
    { id: 'c3', thumbnail_path: 'u1/c-thumb.jpg', thumbnail_url: null, created_at: '2026-10-03T00:00:00Z' },
  ];

  const analyses = [
    {
      id: 'a-deleted',
      clip_id: null,
      payload: { funnelStage: 'BOFU' },
      created_at: '2026-10-03T00:00:00Z',
    },
  ];
  // A query builder whose every method returns itself, and which resolves
  // to `result` when awaited -- the shape supabase-js's builder has.
  const query = (result: unknown) => {
    const q: any = {};

    for (const method of [
      'select',
      'order',
      'range',
      'in',
      'is',
      'textSearch',
      'contains',
      'eq',
    ]) {
      q[method] = () => q;
    }

    q.or = (...args: unknown[]) => {
      mockAnalysesOr(...args);
      return q;
    };

    q.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);

    return q;
  };
  return {
    supabase: {
      from: (table: string) =>
        table === 'clips'
          ? query({ data: clips, error: null, count: clips.length })
          : query({ data: analyses, error: null }),
      storage: { from: () => ({ createSignedUrls: mockCreateSignedUrls }) },
    },
  };
});

import { fetchLibrary } from '../lib/clips';

describe('thumbnails in fetchLibrary', () => {
  beforeEach(() => {
    mockCreateSignedUrls.mockReset();
    mockAnalysesOr.mockReset();
  });

  test('signs every thumbnail on the page in one request and fills thumbnail_url', async () => {
    mockCreateSignedUrls.mockResolvedValue({
      data: [
        { path: 'u1/a-thumb.jpg', signedUrl: 'https://signed/a', error: null },
        { path: 'u1/c-thumb.jpg', signedUrl: 'https://signed/c', error: null },
      ],
      error: null,
    });

    const page = await fetchLibrary();

    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrls).toHaveBeenCalledWith(['u1/a-thumb.jpg', 'u1/c-thumb.jpg'], 3600);
    expect(page.clips.map((c) => c.thumbnail_url)).toEqual(['https://signed/a', null, 'https://signed/c']);
  });

  test('if signing fails, the library still loads without thumbnails', async () => {
    mockCreateSignedUrls.mockResolvedValue({ data: null, error: { message: 'storage down' } });

    const page = await fetchLibrary();

    expect(page.clips).toHaveLength(3);
    expect(page.clips.every((c) => c.thumbnail_url === null)).toBe(true);
  });
});


test('loads preserved analyses whose source clips were deleted', async () => {
  mockCreateSignedUrls.mockResolvedValue({ data: [], error: null });

  const page = await fetchLibrary();

  expect(mockAnalysesOr).toHaveBeenCalledWith(
    expect.stringContaining('clip_id.is.null')
  );
  expect(page.analyses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'a-deleted',
        clip_id: null,
        payload: { funnelStage: 'BOFU' },
      }),
    ])
  );
});
