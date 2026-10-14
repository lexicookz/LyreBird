import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImagePickerAsset } from 'expo-image-picker';
import {
  clipsFromAssets,
  useLibrary,
} from '../data/library';

// Clips live in Supabase now. These tests are about the hook's wiring --
// an import shows placeholders, then shows what the database returned -- so
// the data layer is mocked. Whether the upload and RLS actually work is an
// integration question and is covered against a real stack instead.
jest.mock('../lib/clips', () => ({
  CLIPS_BUCKET: 'clips',
  LIBRARY_PAGE_SIZE: 24,
  fetchLibrary: jest.fn(),
  fetchTags: jest.fn(async () => []),
  uploadClip: jest.fn(),
  prepareClip: jest.fn(),
  requestAnalysis: jest.fn(),
  markAnalysisFailed: jest.fn(),
  deleteClip: jest.fn(),
}));

jest.mock('../data/account', () => ({
  currentUserId: jest.fn(async () => 'user-1'),
}));

const clipsApi = require('../lib/clips');

jest.mock('expo-file-system', () => ({
  File: class extends Blob {
    uri: string;

    constructor(uri: string) {
      super(['video'], { type: 'video/mp4' });
      this.uri = uri;
    }

    get name() {
      return this.uri.split('/').pop() ?? 'video.mp4';
    }
  },
}));

function asset(fileName: string, durationMs: number): ImagePickerAsset {
  return { uri: `file:///${fileName}`, fileName, duration: durationMs, width: 1080, height: 1920 };
}


// The analysis path posts the video to the pipeline API. In a test runner
// there is no server at that address, so every imported clip failed and the
// "finishes analysing" expectations never had a chance. Mock the reply with a
// valid analysis so these tests exercise the flow rather than the network.
function mockAnalyzeVideo(delayMs = 60_000) {
  const reply = {
    ok: true,
    status: 200,
    json: async () => ({
      status: 'success',
      data: {
        hook: 'Opening hook',
        transcript: null,
        onScreenText: [],
        shotBeats: [],
        pacing: null,
        audioStyle: { backgroundMusic: null, voiceover: null },
        cta: null,
        whyItWorks: [],
        format: 'talking_head',
        funnelStage: 'TOFU',
        description: 'A test clip.',
      },
      model_version: 'gemini-3.8-flash',
      prompt_version: 'v2',
    }),
  } as Response;

  // Resolves on a timer rather than immediately, so a clip is observably
  // 'processing' before it is 'ready'. A suite on fake timers advances past
  // delayMs to finish the analysis; one on real timers leaves it pending and
  // sees the analysing state, which is what it is asserting.
  return jest
    .spyOn(global, 'fetch')
    .mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(reply), delayMs))
    );
}

describe('library data', () => {
  test('picked videos become processing clips', () => {
    const [clip] = clipsFromAssets([asset('IMG_0001.MOV', 31_400)], new Date('2026-09-01T00:00:00Z'));

    expect(clip).toMatchObject({
      title: 'IMG_0001',
      status: 'processing',
      duration_seconds: 31,
      created_at: '2026-09-01T00:00:00.000Z',
    });
  });

  describe('useLibrary', () => {
    const clipRow = (id: string, title: string, status = 'ready') => ({
      id,
      owner_id: 'user-1',
      recording_id: null,
      storage_path: `user-1/${title}`,
      thumbnail_path: null,
      thumbnail_url: null,
      title,
      tags: [],
      duration_seconds: 20,
      position_in_parent: null,
      status,
      error_message: null,
      created_at: '2026-10-11T00:00:00Z',
      updated_at: '2026-10-11T00:00:00Z',
    });

    beforeEach(() => {
      jest.clearAllMocks();
      clipsApi.fetchLibrary.mockResolvedValue({ clips: [], analyses: [], hasMore: false, total: 0 });
      clipsApi.uploadClip.mockImplementation(async (_userId: string, a: ImagePickerAsset) =>
        clipRow(`db-${a.fileName}`, a.fileName ?? 'clip', 'processing')
      );
      clipsApi.prepareClip.mockResolvedValue(undefined);
      clipsApi.requestAnalysis.mockResolvedValue(undefined);
      clipsApi.markAnalysisFailed.mockResolvedValue(undefined);
      clipsApi.deleteClip.mockResolvedValue(undefined);
    });

    test('an import uploads each video, asks for an analysis, and shows what the database returned', async () => {
      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});
      expect(result.current.loaded).toBe(true);

      // Once the uploads are done the hook re-reads, so the rows it ends up
      // showing are the database's, not the placeholders it made.
      clipsApi.fetchLibrary.mockResolvedValue({
        clips: [clipRow('db-one.mp4', 'one.mp4'), clipRow('db-two.mp4', 'two.mp4')],
        analyses: [], hasMore: false, total: 2,
      });

      await act(async () => {
        await result.current.importVideos([asset('one.mp4', 20_000), asset('two.mp4', 30_000)]);
      });

      expect(clipsApi.uploadClip).toHaveBeenCalledTimes(2);
      expect(clipsApi.requestAnalysis).toHaveBeenCalledWith('db-one.mp4');
      expect(clipsApi.requestAnalysis).toHaveBeenCalledWith('db-two.mp4');

      expect(result.current.clips.map((c) => c.id)).toEqual(['db-one.mp4', 'db-two.mp4']);
      expect(result.current.lastImportCount).toBe(2);
      expect(result.current.error).toBeNull();
    });

    test('prepares each clip before analysing it', async () => {
      const order: string[] = [];
      clipsApi.prepareClip.mockImplementation(async (id: string) => {
        order.push(`prepare:${id}`);
      });
      clipsApi.requestAnalysis.mockImplementation(async (id: string) => {
        order.push(`analyse:${id}`);
      });

      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});
      await act(async () => {
        await result.current.importVideos([asset('one.mp4', 10_000)]);
      });

      // Order is the point: prepare replaces the file with a 480p version
      // and deletes the original, so analysing afterwards fetches the small
      // one. Reversed, the analysis downloads a full phone capture and the
      // original sits in the 1GB tier until prepare gets to it.
      expect(order).toEqual(['prepare:db-one.mp4', 'analyse:db-one.mp4']);
    });

    test('a clip is still analysed when preparing it fails', async () => {
      clipsApi.prepareClip.mockRejectedValue(new Error('ffmpeg fell over'));

      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});
      await act(async () => {
        await result.current.importVideos([asset('one.mp4', 10_000)]);
      });

      // Downscaling is an optimisation. Losing it costs storage, not the
      // import, and the worker records the reason on the row itself.
      expect(clipsApi.requestAnalysis).toHaveBeenCalledWith('db-one.mp4');
      expect(result.current.error).toBeNull();
    });

    test('a failed upload marks that clip failed and says why, without losing the others', async () => {
      clipsApi.uploadClip.mockImplementationOnce(async () => {
        throw new Error('Upload failed: network');
      });

      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});

      await act(async () => {
        await result.current.importVideos([asset('bad.mp4', 10_000), asset('good.mp4', 10_000)]);
      });

      expect(result.current.error).toContain('Upload failed');
      // The one that worked still got analysed.
      expect(clipsApi.requestAnalysis).toHaveBeenCalledTimes(1);
    });

    test('a clip saved but not analysed is kept, not discarded', async () => {
      clipsApi.requestAnalysis.mockRejectedValue(new Error('worker unreachable'));
      clipsApi.fetchLibrary.mockResolvedValue({
        clips: [clipRow('db-one.mp4', 'one.mp4', 'processing')],
        analyses: [], hasMore: false, total: 1,
      });

      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});
      await act(async () => {
        await result.current.importVideos([asset('one.mp4', 10_000)]);
      });

      // The upload succeeded, so the clip exists. A failed analysis is not a
      // lost video, and the row is still there to retry from.
      expect(result.current.clips).toHaveLength(1);
      expect(clipsApi.uploadClip).toHaveBeenCalledTimes(1);

      // But it has to say so. This was swallowed, which is how an
      // unreachable worker ended up looking like a slow one.
      expect(result.current.error).toContain('worker unreachable');
      expect(clipsApi.markAnalysisFailed).toHaveBeenCalledWith(
        'db-one.mp4',
        expect.stringContaining('worker unreachable')
      );
    });

    test('a failed retry is written to the row, not just to the screen', async () => {
      clipsApi.fetchLibrary.mockResolvedValue({
        clips: [clipRow('db-one.mp4', 'one.mp4', 'failed')],
        analyses: [], hasMore: false, total: 1,
      });
      clipsApi.requestAnalysis.mockRejectedValue(new Error('worker unreachable'));

      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});
      await act(async () => {
        await result.current.retryAnalysis('db-one.mp4');
      });

      // retryAnalysis refreshes straight afterwards, so a status set only in
      // React state is overwritten by the re-read and the clip goes back to
      // looking like it is processing.
      expect(clipsApi.markAnalysisFailed).toHaveBeenCalledWith(
        'db-one.mp4',
        expect.stringContaining('worker unreachable')
      );
      expect(result.current.error).toContain('worker unreachable');
    });

    test('retrying actually re-runs the analysis', async () => {
      clipsApi.fetchLibrary.mockResolvedValue({
        clips: [clipRow('db-one.mp4', 'one.mp4', 'failed')],
        analyses: [], hasMore: false, total: 1,
      });

      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});

      await act(async () => {
        await result.current.retryAnalysis('db-one.mp4');
      });

      // The old version only set the status back to 'processing' and nothing
      // ran, so a failed clip could never recover.
      expect(clipsApi.requestAnalysis).toHaveBeenCalledWith('db-one.mp4');
    });

    test('the query asks Postgres for the filter, the sort and the page', async () => {
      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});

      await act(async () => {
        result.current.setTags(['morning']);
      });
      await act(async () => {});

      // The filter is an argument to the query, not something applied after
      // the rows arrive -- that is the whole point of BE-18.
      expect(clipsApi.fetchLibrary).toHaveBeenLastCalledWith(
        expect.objectContaining({ tags: ['morning'] })
      );

      await act(async () => {
        result.current.setSort('oldest');
      });
      await act(async () => {});
      expect(clipsApi.fetchLibrary).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'oldest', tags: ['morning'] })
      );
    });

    test('loadMore appends the next page instead of replacing it', async () => {
      const first = [clipRow('a', 'a.mp4'), clipRow('b', 'b.mp4')];
      const second = [clipRow('c', 'c.mp4')];
      clipsApi.fetchLibrary.mockImplementation(async (q: any = {}) =>
        (q.page ?? 0) === 0
          ? { clips: first, analyses: [], hasMore: true, total: 3 }
          : { clips: second, analyses: [], hasMore: false, total: 3 }
      );

      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});
      expect(result.current.clips).toHaveLength(2);
      expect(result.current.hasMore).toBe(true);

      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.clips.map((c) => c.id)).toEqual(['a', 'b', 'c']);
      expect(result.current.hasMore).toBe(false);
    });

    test('loading more twice does not duplicate rows', async () => {
      clipsApi.fetchLibrary.mockImplementation(async (q: any = {}) =>
        (q.page ?? 0) === 0
          ? { clips: [clipRow('a', 'a.mp4')], analyses: [], hasMore: true, total: 2 }
          : { clips: [clipRow('b', 'b.mp4')], analyses: [], hasMore: false, total: 2 }
      );

      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});

      // A scroll handler can fire twice before the first request returns.
      await act(async () => {
        await Promise.all([result.current.loadMore(), result.current.loadMore()]);
      });

      expect(result.current.clips.map((c) => c.id)).toEqual(['a', 'b']);
    });

    test('changing a filter goes back to the first page', async () => {
      clipsApi.fetchLibrary.mockImplementation(async (q: any = {}) => ({
        clips: [clipRow(`p${q.page ?? 0}`, 'x.mp4')],
        analyses: [],
        hasMore: true,
        total: 99,
      }));

      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});
      await act(async () => {
        await result.current.loadMore();
      });
      expect(result.current.clips).toHaveLength(2);

      await act(async () => {
        result.current.setTags(['saas']);
      });
      await act(async () => {});

      // Keeping page two of the old filter would be showing answers to a
      // question nobody asked.
      const lastCall = clipsApi.fetchLibrary.mock.calls.at(-1)[0];
      expect(lastCall.tags).toEqual(['saas']);
      // No page asked for at all, which is page one.
      expect(lastCall.page ?? 0).toBe(0);
      expect(result.current.clips).toHaveLength(1);
    });

    test('deleting removes the row and the file', async () => {
      const row = clipRow('db-one.mp4', 'one.mp4');
      clipsApi.fetchLibrary.mockResolvedValue({ clips: [row], analyses: [], hasMore: false, total: 1 });

      const { result } = await renderHook(() => useLibrary());
      await act(async () => {});

      clipsApi.fetchLibrary.mockResolvedValue({ clips: [], analyses: [], hasMore: false, total: 0 });
      await act(async () => {
        await result.current.removeClip('db-one.mp4');
      });

      expect(clipsApi.deleteClip).toHaveBeenCalledWith(expect.objectContaining({ id: 'db-one.mp4' }));
      expect(result.current.clips).toHaveLength(0);
    });
  });
});
