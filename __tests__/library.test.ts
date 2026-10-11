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
      expect(result.hook).toBe('Opening hook');
    } finally {
      fetch.mockRestore();
      global.FormData = originalFormData;
    }
  });

  describe('useLibrary', () => {
    beforeEach(async () => {
      await AsyncStorage.clear();
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
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
