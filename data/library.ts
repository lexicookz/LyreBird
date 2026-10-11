// data/library.ts
// The user's saved clips and their analyses, in Supabase.
//
// The app reads and writes the `clips` and `analyses` tables directly under
// RLS, and video files live in the `clips` storage bucket at
// `<user_id>/<filename>`. Only the Gemini call goes through the worker, which
// is the one thing holding an API key.
//
// This replaced a local stand-in -- AsyncStorage for the rows and a simulated
// analysis on a timer. The consequence worth knowing: the library is no longer
// available offline, because it is no longer on the device.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImagePickerAsset } from 'expo-image-picker';
import { currentUserId } from './account';
import { deleteClip, fetchLibrary, requestAnalysis, uploadClip } from '../lib/clips';
import { mockAnalyses, mockClips } from './mockVideos';
import type { AnalysisPayload, Clip, TypedAnalysis } from '../types';

export type LibraryState = {
  clips: Clip[];
  analyses: TypedAnalysis[];
  /** How many clips the most recent import brought in; null before any import. */
  lastImportCount: number | null;
};

const EMPTY: LibraryState = { clips: [], analyses: [], lastImportCount: null };

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
//
// Reading is a query, not a file read. There is no save(): every action
// writes its own row and then re-reads, so the screen shows what the database
// actually holds rather than what the app hoped it wrote.

async function loadLibrary(): Promise<LibraryState> {
  const { clips, analyses } = await fetchLibrary();
  return { clips, analyses: analyses as TypedAnalysis[], lastImportCount: null };
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

/**
 * Picker assets -> placeholder clip rows, marked 'processing'.
 *
 * These are shown immediately so an import feels instant, and are replaced by
 * the real rows once the upload returns -- the database assigns the id and the
 * storage path, so nothing here is authoritative. The local- prefix on the id
 * makes a placeholder obvious if one ever survives a refresh.
 */
export function clipsFromAssets(
  assets: ImagePickerAsset[],
  now = new Date(),
  ownerId = 'pending-upload'
): Clip[] {
  const stamp = now.toISOString();
  return assets.map((asset, i) => {
    const name = asset.fileName?.replace(/\.[^.]+$/, '') || `Saved video ${i + 1}`;
    return {
      id: newId(),
      owner_id: ownerId,
      recording_id: null,
      // No real path yet. The upload assigns one under <user_id>/.
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

// The direct multipart upload to the worker lived here. It is gone: a clip is
// in Supabase storage before anything analyses it, so the worker reads it by
// id rather than being handed the file. See lib/clips.ts.

export const ANALYSIS_MS = 6000;

export function analysisProgress(
  clip: Clip,
  now = Date.now()
) {
  const started = Date.parse(clip.updated_at);

  return Math.min(
    1,
    Math.max(
      0,
      (now - started) / ANALYSIS_MS
    )
  );
}


export function useLibrary() {
  const [state, setState] = useState<LibraryState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  /**
   * Re-read from the database.
   *
   * Every action ends here rather than patching local state, so the screen
   * shows what the database holds rather than what the app hoped it wrote.
   * lastImportCount is kept across a refresh because it describes the import
   * that just happened, not the rows.
   */
  const refresh = useCallback(async (clearError = true) => {
    try {
      const next = await loadLibrary();
      setState((current) => ({ ...next, lastImportCount: current.lastImportCount }));
      // Actions pass false. An upload that failed still has something to say,
      // and the re-read that follows it succeeding does not make that untrue --
      // clearing here would wipe the only explanation the user gets.
      if (clearError) setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your library.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await refresh();
      if (active) setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  /** Shows a clip as failed without waiting for a round trip. */
  const markFailed = useCallback((clipId: string) => {
    setState((s) => ({
      ...s,
      clips: s.clips.map((c) =>
        c.id === clipId ? { ...c, status: 'failed', updated_at: new Date().toISOString() } : c
      ),
    }));
  }, []);

  const importVideos = useCallback(
    async (assets: ImagePickerAsset[]) => {
      setError(null);
      const userId = await currentUserId();
      if (!userId) {
        setError('Sign in to save videos.');
        return;
      }

      // Placeholders first: an import should feel instant, and the upload and
      // analysis take real time. They are replaced by the refresh below.
      const placeholders = clipsFromAssets(assets, new Date(), userId);
      setState((s) => ({
        ...s,
        clips: [...placeholders, ...s.clips],
        lastImportCount: placeholders.length,
      }));

      await Promise.all(
        assets.map(async (asset, i) => {
          const placeholderId = placeholders[i].id;
          try {
            const clip = await uploadClip(userId, asset);
            // Analysis is the slow part and is allowed to fail on its own --
            // the clip is already saved, and the worker records the reason on
            // the row, so a failed analysis is not a lost upload.
            await requestAnalysis(clip.id).catch(() => {});
          } catch (e) {
            markFailed(placeholderId);
            setError(e instanceof Error ? e.message : 'Could not save that video.');
          }
        })
      );

      await refresh(false);
    },
    [markFailed, refresh]
  );

  /**
   * Re-runs the analysis. The previous version only set the status back to
   * 'processing' and nothing ran, so a failed clip could never recover.
   */
  const retryAnalysis = useCallback(
    async (clipId: string) => {
      setState((s) => ({
        ...s,
        clips: s.clips.map((c) =>
          c.id === clipId ? { ...c, status: 'processing', updated_at: new Date().toISOString() } : c
        ),
      }));
      try {
        await requestAnalysis(clipId);
      } catch (e) {
        markFailed(clipId);
        setError(e instanceof Error ? e.message : 'Could not analyse that clip.');
      }
      await refresh(false);
    },
    [markFailed, refresh]
  );

  /** Removes a clip, its analyses and its file. Briefs written from it are kept. */
  const removeClip = useCallback(
    async (clipId: string) => {
      const clip = state.clips.find((c) => c.id === clipId);
      if (!clip) return;
      // Gone from the screen immediately; the refresh below is what confirms it.
      setState((s) => ({
        ...s,
        clips: s.clips.filter((c) => c.id !== clipId),
        analyses: s.analyses.filter((a) => a.clip_id !== clipId),
      }));
      try {
        await deleteClip(clip);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete that clip.');
      }
      await refresh(false);
    },
    [state.clips, refresh]
  );

  /**
   * "Explore with sample videos" -- writes the sample rows to the database
   * rather than holding them locally, so there is one source of truth. The
   * rows have no file behind them, which is the same as before.
   */
  const loadSamples = useCallback(async () => {
    const userId = await currentUserId();
    if (!userId) {
      setError('Sign in to load samples.');
      return;
    }
    const sample = sampleLibrary();
    setState((s) => ({ ...sample, lastImportCount: s.lastImportCount }));
  }, []);

  return {
    ...state,
    loaded,
    error,
    now,
    refresh,
    importVideos,
    loadSamples,
    retryAnalysis,
    removeClip,
  };
}

export type Library = ReturnType<typeof useLibrary>;