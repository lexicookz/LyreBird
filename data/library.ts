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

/** Clips longer than this are skipped at import. */
export const MAX_CLIP_SECONDS = 90;

// Sample analyses handed out by the simulator, in order: three written for it
// (one per funnel stage), then the three mock analyses. The new ones come first
// so the sample library doesn't show the same hook twice.
const SAMPLE_PAYLOADS: AnalysisPayload[] = [
  {
    hook: 'I wasted $4k on skincare so you don’t have to',
    transcript: 'I wasted four thousand dollars on skincare so you don’t have to…',
    onScreenText: ['$4,000 later'],
    shotBeats: ['Handheld close-up, direct address', 'Cut to shelf of products', 'Three fast product holds', 'Back to face, spoken CTA'],
    pacing: 'Fast cuts for the first 10 seconds, then slows for the CTA',
    cta: 'Spoken, not shown',
    format: 'talking_head',
    funnelStage: 'TOFU',
  },
  {
    hook: 'Three things I check before I buy',
    transcript: 'Three things I check before I buy anything for my skin…',
    onScreenText: ['1. Ingredients 2. Bottle 3. Refills'],
    shotBeats: ['Product on bench', 'Close-up of label', 'Pour test', 'Verdict to camera'],
    pacing: 'Even, one beat per point',
    cta: 'Comment which one you check',
    format: 'voiceover',
    funnelStage: 'MOFU',
  },
  {
    hook: 'Last day at this price',
    transcript: 'This is the last day you can get it at this price…',
    onScreenText: ['Ends tonight'],
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
      local_uri: asset.uri,
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
type UploadVideoInput = {
  uri: string;
  fileName: string;
};

export async function uploadToAnalyze(
  video: UploadVideoInput
): Promise<AnalysisPayload> {
  const formData = new FormData();
  
  console.log('VIDEO INPUT', video);
  console.log('URI', video.uri);
  console.log('FILENAME', video.fileName);
  console.log('upload video', video);
  formData.append('file', {
    uri: video.uri,
    name: video.fileName,
    type: 'video/mp4',
  } as any);

  console.log('UPLOAD', video.uri); //to be removed
  console.log(JSON.stringify(video, null, 2)); //to be removed

  const response = await fetch('http://192.168.1.18:8000/analyze-video',
    { method: 'POST',
      body: formData,});
  if (!response.ok) {
    throw new Error(
      `Failed to upload video: ${response.status} ${response.statusText}`
    );
  }
  const result = await response.json();
  return result;
}

export async function finishAnalysis(clip: Clip, asset: ImagePickerAsset,index: number): Promise<TypedAnalysis> {
  console.log('asset', asset);
  console.log('CALLING BACKEND', clip.id); // to be removed
  try {
    const payload = await uploadToAnalyze({
      uri: (clip as any).local_uri,
      fileName: `${clip.id}.mp4`,
    } );

    return {
      id: newId(),
      owner_id: clip.owner_id,
      clip_id: clip.id,
      payload,
      model_version: 'gemini-3.8-flash',
      prompt_version: 'v1',
      created_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      `Analysis failed for clip ${clip.id}:`,
      error
    );

    throw error;
  }
}

// ---------- hook ----------

export function useLibrary() {
  const [state, setState] = useState<LibraryState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const completed = useRef(0);
  const assetMap = useRef<Record<string, ImagePickerAsset>>({});

  const update = useCallback((fn: (s: LibraryState) => LibraryState) => {
    setState((current) => {
      const next = fn(current);
      saveLibrary(next);
      return next;
    });
  }, []);

  const runAnalysis = useCallback( 
    async (clip: Clip) => {
      console.log('RUN ANALYSIS START', clip.id); //to be removed
    const asset = assetMap.current[clip.id];
    if (!asset) {return;}
    try {
      const analysis = await finishAnalysis(clip, asset, completed.current++);

      update((s) => ({
        ...s,
        clips: s.clips.map((c) =>
          c.id === clip.id
            ? {
                ...c,
                status: 'ready',
                updated_at: new Date().toISOString(),
              }
            : c
        ),
        analyses: [
          ...s.analyses.filter(
            (a) => a.clip_id !== clip.id
          ),
          analysis,
        ],
      }));
    } catch {
       update((s) => ({
        ...s,
        clips: s.clips.map((c) =>
          c.id === clip.id
            ? {
              ...c,
              status: 'failed',
              updated_at: new Date().toISOString(),
              }
            : c
        ),
      }));
    }
  },
  [update]
);
``
  useEffect(() => {
    loadLibrary().then((stored) => {
      setState(stored);
      setLoaded(true);
    });
  }, []);

  



  const importVideos = useCallback(
    async (assets: ImagePickerAsset[]) => {
    const clips = clipsFromAssets(assets);
    clips.forEach((clip, i) => {
      assetMap.current[clip.id] = assets[i];
    });
    update((s) => ({
      ...s,
      clips: [...clips, ...s.clips],
      lastImportCount: clips.length,
    }));
    clips.forEach((clip) => {
      runAnalysis(clip);
    });
  },
  [update, runAnalysis]
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

  /** Removes a clip and its analysis. Briefs written from it are kept. */
  const removeClip = useCallback(
    (clipId: string) =>
      update((s) => ({
        ...s,
        clips: s.clips.filter((c) => c.id !== clipId),
        analyses: s.analyses.filter((a) => a.clip_id !== clipId),
      })),
    [update]
  );

  return { ...state, loaded, now, importVideos, loadSamples, retryAnalysis, removeClip };
}

export type Library = ReturnType<typeof useLibrary>;


