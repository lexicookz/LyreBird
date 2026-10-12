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
import {
  deleteClip,
  fetchLibrary,
  fetchTags,
  markAnalysisFailed,
  prepareClip,
  requestAnalysis,
  uploadClip,
  type LibraryQuery,
  type LibrarySort,
} from '../lib/clips';
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

async function loadLibrary(query: LibraryQuery = {}): Promise<LibraryState & { hasMore: boolean }> {
  const page = await fetchLibrary(query);
  return {
    clips: page.clips,
    analyses: page.analyses as TypedAnalysis[],
    lastImportCount: null,
    hasMore: page.hasMore,
  };
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
      error_message: null,
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

  // What the database is being asked for. Changing this reloads from page 0,
  // because a filter that kept the old page's rows would be showing results
  // from a question nobody asked.
  const [sort, setSortState] = useState<LibrarySort>('newest');
  const [tags, setTagsState] = useState<string[]>([]);
  const [search, setSearchState] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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
      // Back to the first page: after an import or a delete, which page the
      // user was on no longer describes anything.
      const next = await loadLibrary({ sort, tags, search });
      setPage(0);
      setHasMore(next.hasMore);
      setState((current) => ({
        clips: next.clips,
        analyses: next.analyses,
        lastImportCount: current.lastImportCount,
      }));
      // Actions pass false. An upload that failed still has something to say,
      // and the re-read that follows it succeeding does not make that untrue --
      // clearing here would wipe the only explanation the user gets.
      if (clearError) setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your library.');
    }
  }, [sort, tags, search]);

  /** The next page, appended. */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await loadLibrary({ sort, tags, search, page: page + 1 });
      setPage((p) => p + 1);
      setHasMore(next.hasMore);
      setState((current) => {
        // Guard against a double-fire appending the same rows twice.
        const known = new Set(current.clips.map((c) => c.id));
        const fresh = next.clips.filter((c) => !known.has(c.id));
        return {
          ...current,
          clips: [...current.clips, ...fresh],
          analyses: [...current.analyses, ...next.analyses],
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load more clips.');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, page, sort, tags, search]);

  const setSort = useCallback((next: LibrarySort) => setSortState(next), []);
  const setTags = useCallback((next: string[]) => setTagsState(next), []);
  const setSearch = useCallback((next: string) => setSearchState(next), []);

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

  // The tags that exist, for the filter row. Read once rather than on every
  // query: the set changes when clips are added, not when one is filtered.
  useEffect(() => {
    let active = true;
    fetchTags()
      .then((t) => {
        if (active) setAllTags(t);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [state.clips.length]);

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

            // Downscale first, so the analysis fetches the 480p version and
            // the full-size original stops occupying the 1GB free tier.
            //
            // Not the same swallow that was removed above, though it looks
            // like one. That case left the clip on 'processing' forever with
            // nothing written anywhere, so a broken worker URL was invisible.
            // Here the worker records its own failure on the row, the clip
            // is still analysable at full size, and the analysis a line
            // later surfaces anything that would also have broken this.
            // Reporting a transcode failure on an import that otherwise
            // worked would be noise.
            await prepareClip(clip.id).catch(() => {});

            // Analysis is allowed to fail on its own -- the clip is saved
            // either way, so a failed analysis is not a lost upload. What it
            // is not allowed to do is fail silently: this used to be
            // .catch(() => {}), which left the row on 'processing' with
            // nothing written to it, so a worker that was never reached was
            // indistinguishable from one still working and the screen waited
            // forever. The worker records its own failures; this covers the
            // ones where it never heard the request.
            try {
              await requestAnalysis(clip.id);
            } catch (e) {
              const message =
                e instanceof Error ? e.message : 'Could not start the analysis.';
              await markAnalysisFailed(clip.id, message);
              setError(message);
            }
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
        const message = e instanceof Error ? e.message : 'Could not analyse that clip.';
        // Both: markFailed is what the screen shows now, markAnalysisFailed
        // is what survives the refresh on the next line. Without the second
        // one the re-read puts the clip straight back on 'processing'.
        markFailed(clipId);
        await markAnalysisFailed(clipId, message);
        setError(message);
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
    // query state, all answered by Postgres rather than in the app
    sort,
    setSort,
    tags,
    setTags,
    search,
    setSearch,
    allTags,
    hasMore,
    loadingMore,
    loadMore,
    refresh,
    importVideos,
    loadSamples,
    retryAnalysis,
    removeClip,
  };
}

export type Library = ReturnType<typeof useLibrary>;