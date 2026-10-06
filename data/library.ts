// data/library.ts
// The user's saved clips and their analyses, kept on the device for now.
//
// Two stand-ins live here until the backend exists:
//   - storage: AsyncStorage instead of the `clips` / `analyses` tables
//   - analysis: SIMULATED. There is no Gemini endpoint yet, so a clip marked
//     'processing' turns 'ready' after ANALYSIS_MS with a sample analysis drawn
//     from SAMPLE_PAYLOADS. The hooks it shows are not about the real video.
// When the worker's analyse endpoint lands, replace `finishAnalysis` with a
// poll of the clip's status and a read of its `analyses` row.
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImagePickerAsset } from 'expo-image-picker';
import { mockAnalyses, mockClips } from './mockVideos';
import type { AnalysisPayload, Clip, TypedAnalysis } from '../types';

export type LibraryState = {
  clips: Clip[];
  analyses: TypedAnalysis[];
  /** How many clips the most recent import brought in; null before any import. */
  lastImportCount: number | null;
};

const EMPTY: LibraryState = { clips: [], analyses: [], lastImportCount: null };
const STORAGE_KEY = 'lyrebird.library';
const OWNER_ID = mockClips[0]?.owner_id ?? 'local';

/** How long a simulated analysis takes. */
export const ANALYSIS_MS = 6000;
/** Clips longer than this are skipped at import. */
export const MAX_CLIP_SECONDS = 90;

// Sample analyses handed out by the simulator, in order: three written for it
// (one per funnel stage), then the three mock analyses. The new ones come first
// so the sample library doesn't show the same hook twice.
const SAMPLE_PAYLOADS: AnalysisPayload[] = [
  {
    hook: 'I wasted $4k on skincare so you don’t have to',
    transcript: 'I wasted four thousand dollars on skincare so you don’t have to…',
    onScreenText: '$4,000 later',
    shotBeats: ['Handheld close-up, direct address', 'Cut to shelf of products', 'Three fast product holds', 'Back to face, spoken CTA'],
    pacing: 'Fast cuts for the first 10 seconds, then slows for the CTA',
    cta: 'Spoken, not shown',
    format: 'talking_head',
    funnelStage: 'TOFU',
  },
  {
    hook: 'Three things I check before I buy',
    transcript: 'Three things I check before I buy anything for my skin…',
    onScreenText: '1. Ingredients 2. Bottle 3. Refills',
    shotBeats: ['Product on bench', 'Close-up of label', 'Pour test', 'Verdict to camera'],
    pacing: 'Even, one beat per point',
    cta: 'Comment which one you check',
    format: 'voiceover',
    funnelStage: 'MOFU',
  },
  {
    hook: 'Last day at this price',
    transcript: 'This is the last day you can get it at this price…',
    onScreenText: 'Ends tonight',
    shotBeats: ['Price card', 'Product in hand', 'Checkout screen'],
    pacing: 'Quick, under 15 seconds',
    cta: 'Link in bio, shown on screen',
    format: 'text_overlay',
    funnelStage: 'BOFU',
  },
  ...mockAnalyses.map((a) => a.payload),
];

// ---------- storage ----------

async function loadLibrary(): Promise<LibraryState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function saveLibrary(state: LibraryState) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

// ---------- pure helpers (exported for tests) ----------

/** The mock clips and analyses, for "explore with sample videos". */
export function sampleLibrary(now = new Date()): LibraryState {
  return {
    // Restart processing clips from now, so the sample shows analysis finishing.
    clips: mockClips.map((c) =>
      c.status === 'processing' ? { ...c, updated_at: now.toISOString() } : c
    ),
    analyses: [...mockAnalyses],
    lastImportCount: null,
  };
}

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `local-${Date.now().toString(36)}-${idCounter}`;
}

/** Picker assets -> clip rows, marked 'processing' so analysis starts on its own. */
export function clipsFromAssets(assets: ImagePickerAsset[], now = new Date()): Clip[] {
  const stamp = now.toISOString();
  return assets.map((asset, i) => {
    const name = asset.fileName?.replace(/\.[^.]+$/, '') || `Saved video ${i + 1}`;
    return {
      id: newId(),
      owner_id: OWNER_ID,
      recording_id: null,
      // Not uploaded yet: there is no bucket path until the upload step exists.
      storage_path: `local/${asset.fileName ?? name}`,
      thumbnail_path: null,
      thumbnail_url: null,
      title: name,
      tags: [],
      duration_seconds: asset.duration ? Math.round(asset.duration / 1000) : null,
      position_in_parent: null,
      status: 'processing',
      created_at: stamp,
      updated_at: stamp,
    };
  });
}

/** Simulated analysis result for a clip (see the note at the top). */
export function finishAnalysis(clip: Clip, index: number): TypedAnalysis {
  const payload = SAMPLE_PAYLOADS[index % SAMPLE_PAYLOADS.length];
  return {
    id: newId(),
    owner_id: clip.owner_id,
    clip_id: clip.id,
    payload,
    model_version: 'simulated',
    prompt_version: 'simulated',
    created_at: new Date().toISOString(),
  };
}

/** 0-1 progress of a processing clip's simulated analysis. */
export function analysisProgress(clip: Clip, now = Date.now()) {
  const started = Date.parse(clip.updated_at);
  return Math.min(1, Math.max(0, (now - started) / ANALYSIS_MS));
}

// ---------- hook ----------

export function useLibrary() {
  const [state, setState] = useState<LibraryState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const completed = useRef(0);

  useEffect(() => {
    loadLibrary().then((stored) => {
      setState(stored);
      setLoaded(true);
    });
  }, []);

  const update = useCallback((fn: (s: LibraryState) => LibraryState) => {
    setState((current) => {
      const next = fn(current);
      saveLibrary(next);
      return next;
    });
  }, []);

  const processing = state.clips.filter((c) => c.status === 'processing');

  // While anything is analysing, tick so progress bars move, and finish clips
  // whose time is up.
  useEffect(() => {
    if (!loaded || processing.length === 0) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const due = processing.filter((c) => analysisProgress(c, t) >= 1);
      if (due.length === 0) return;
      update((s) => {
        const dueIds = new Set(due.map((c) => c.id));
        const newAnalyses = due.map((c) => finishAnalysis(c, completed.current++));
        return {
          ...s,
          clips: s.clips.map((c) =>
            dueIds.has(c.id)
              ? { ...c, status: 'ready', updated_at: new Date(t).toISOString() }
              : c
          ),
          analyses: [...s.analyses.filter((a) => !dueIds.has(a.clip_id)), ...newAnalyses],
        };
      });
    }, 250);
    return () => clearInterval(timer);
  }, [loaded, processing.map((c) => c.id).join(','), update]);

  const importVideos = useCallback(
    (assets: ImagePickerAsset[]) => {
      const clips = clipsFromAssets(assets);
      update((s) => ({ ...s, clips: [...clips, ...s.clips], lastImportCount: clips.length }));
    },
    [update]
  );

  const loadSamples = useCallback(() => update(() => sampleLibrary()), [update]);

  const retryAnalysis = useCallback(
    (clipId: string) =>
      update((s) => ({
        ...s,
        clips: s.clips.map((c) =>
          c.id === clipId
            ? { ...c, status: 'processing', updated_at: new Date().toISOString() }
            : c
        ),
      })),
    [update]
  );

  return { ...state, loaded, now, importVideos, loadSamples, retryAnalysis };
}

export type Library = ReturnType<typeof useLibrary>;
