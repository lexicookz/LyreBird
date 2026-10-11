import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImagePickerAsset } from 'expo-image-picker';
import {
  ANALYSIS_MS,
  analysisProgress,
  clipsFromAssets,
  uploadToAnalyze,
  useLibrary,
} from '../data/library';

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

  test('analysis progress runs from 0 to 1 over ANALYSIS_MS', () => {
    const [clip] = clipsFromAssets([asset('a.mp4', 10_000)], new Date(1_000_000));

    expect(analysisProgress(clip, 1_000_000)).toBe(0);
    expect(analysisProgress(clip, 1_000_000 + ANALYSIS_MS / 2)).toBeCloseTo(0.5);
    expect(analysisProgress(clip, 1_000_000 + ANALYSIS_MS * 2)).toBe(1);
  });

  test('upload sends an Expo File part and returns the analysis from the worker envelope', async () => {
    const originalFormData = global.FormData;
    const append = jest.fn();
    global.FormData = class {
      append = append;
    } as unknown as typeof FormData;
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          hook: 'Opening hook',
          transcript: null,
          onScreenText: [],
          shotBeats: [],
          pacing: null,
          cta: null,
          format: 'talking_head',
          funnelStage: 'TOFU',
        },
        model_version: 'gemini-3.8-flash',
        prompt_version: 'v2',
      }),
    } as Response);

    try {
      const result = await uploadToAnalyze({
        uri: 'file:///cache/temporary.mp4',
        fileName: 'original-video.mp4',
      });

      expect(append).toHaveBeenCalledTimes(1);
      const uploadedFile = append.mock.calls[0][1];
      expect(uploadedFile).toBeInstanceOf(Blob);
      expect(uploadedFile).toMatchObject({
        name: 'original-video.mp4',
        type: 'video/mp4',
      });
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'POST', body: expect.any(Object) })
      );
      expect(result.payload.hook).toBe('Opening hook');
      // Taken from the response, not hardcoded: the endpoint defaults to
      // prompt v2, and the app used to record v1 regardless.
      expect(result.promptVersion).toBe('v2');
      expect(result.modelVersion).toBe('gemini-3.8-flash');
    } finally {
      fetch.mockRestore();
      global.FormData = originalFormData;
    }
  });

  describe('useLibrary', () => {
    let analyzeFetch: jest.SpyInstance;

    beforeEach(async () => {
      await AsyncStorage.clear();
      analyzeFetch = mockAnalyzeVideo(ANALYSIS_MS);
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
      analyzeFetch.mockRestore();
    });

    test('imported clips finish analysing on their own and are saved', async () => {
      const { result } = await renderHook(() => useLibrary());
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });
      expect(result.current.loaded).toBe(true);

      await act(async () => {
        result.current.importVideos([asset('one.mp4', 20_000), asset('two.mp4', 30_000)]);
      });
      expect(result.current.clips.map((c) => c.status)).toEqual(['processing', 'processing']);
      expect(result.current.lastImportCount).toBe(2);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(ANALYSIS_MS + 500);
      });

      expect(result.current.clips.map((c) => c.status)).toEqual(['ready', 'ready']);
      expect(result.current.analyses).toHaveLength(2);
      const saved = JSON.parse((await AsyncStorage.getItem('lyrebird.library')) ?? '{}');
      expect(saved.clips).toHaveLength(2);
    });
  });
});
