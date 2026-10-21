// data/briefs.ts
// The user's briefs, in Supabase (lib/briefs.ts).
//
// "Adapt for my brand" asks the worker's AI to write a brief from the clip's
// analysis and the user's brand (POST /briefs). Regenerate asks for a fresh
// one; the worker keeps the old brief, so a clip can have several and the
// newest is the one shown (`latest`).
//
// Edits are applied on screen straight away and written to the database a
// moment after the user stops typing, so a keystroke isn't a request.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BriefPatch,
  fetchBriefs,
  requestBrief,
  requestRegenerate,
  updateBrief,
} from '../lib/briefs';
import type { Brief } from '../types';

/** Brief fields the "Your version" screen edits. */
export type BriefEdit = BriefPatch;

/** How long after the last keystroke an edit is saved. */
const SAVE_AFTER_MS = 700;

/** shot_list is jsonb; treat anything that isn't a string array as empty. */
export function shotsOf(brief: Brief): string[] {
  return Array.isArray(brief.shot_list)
    ? brief.shot_list.filter((s): s is string => typeof s === 'string')
    : [];
}

/** A brief as plain text, for sharing to notes, email or a teammate. */
export function briefAsText(brief: Brief) {
  const shots = shotsOf(brief).filter((s) => s.trim());
  return [
    `HOOK\n${brief.hook ?? ''}`,
    shots.length ? `SHOT LIST\n${shots.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : null,
    brief.script ? `SCRIPT\n${brief.script}` : null,
    brief.caption ? `CAPTION\n${brief.caption}` : null,
    brief.cta ? `CTA\n${brief.cta}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The newest brief for each clip -- the current version after any regenerates. */
/** The newest brief for each clip -- the current version after any regenerates.
 * Briefs whose source clip was deleted are retained as independent records.
 */
export function latestPerClip(briefs: Brief[]): Brief[] {
  const newest = new Map<string, Brief>();
  const withoutClip: Brief[] = [];

  for (const brief of briefs) {
    if (!brief.clip_id) {
      withoutClip.push(brief);
      continue;
    }

    const seen = newest.get(brief.clip_id);
    if (!seen || Date.parse(brief.created_at) > Date.parse(seen.created_at)) {
      newest.set(brief.clip_id, brief);
    }
  }

  return [...newest.values(), ...withoutClip].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );
}

export function useBriefs() {
  const [all, setAll] = useState<Brief[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Clip ids being adapted, and brief ids being regenerated, right now. */
  const [working, setWorking] = useState<Set<string>>(new Set());
  const pending = useRef(new Map<string, { patch: BriefPatch; timer: ReturnType<typeof setTimeout> }>());

  const refresh = useCallback(async () => {
    try {
      setAll(await fetchBriefs());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your briefs.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    refresh().finally(() => {
      if (active) setLoaded(true);
    });
    return () => {
      active = false;
      // Write anything still waiting rather than drop it.
      for (const [id, { patch, timer }] of pending.current) {
        clearTimeout(timer);
        updateBrief(id, patch).catch(() => {});
      }
      pending.current.clear();
    };
  }, [refresh]);

  const mark = (key: string, on: boolean) =>
    setWorking((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /** Change a brief on screen now; save it to the database shortly after. */
  const edit = useCallback((id: string, patch: BriefPatch) => {
    setAll((current) =>
      current.map((b) => (b.id === id ? { ...b, ...patch, updated_at: new Date().toISOString() } : b))
    );
    const waiting = pending.current.get(id);
    if (waiting) clearTimeout(waiting.timer);
    const merged = { ...waiting?.patch, ...patch };
    const timer = setTimeout(async () => {
      pending.current.delete(id);
      try {
        const saved = await updateBrief(id, merged);
        // Pick up what the database decided (status draft -> edited, updated_at).
        setAll((current) =>
          current.map((b) => (b.id === id ? { ...b, status: saved.status, updated_at: saved.updated_at } : b))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your brief.');
      }
    }, SAVE_AFTER_MS);
    pending.current.set(id, { patch: merged, timer });
  }, []);

  /** Write a brief for a clip with the AI. Resolves to the new brief's id, or null if it failed. */
  const generate = useCallback(
    async (clipId: string, brandId: string): Promise<string | null> => {
      mark(clipId, true);
      try {
        const id = await requestBrief(clipId, brandId);
        await refresh();
        return id;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not write your brief.');
        return null;
      } finally {
        mark(clipId, false);
      }
    },
    [refresh]
  );

  /** Ask the AI for a new version. Resolves to the new brief's id, or null if it failed. */
  const regenerate = useCallback(
    async (briefId: string): Promise<string | null> => {
      mark(briefId, true);
      try {
        const id = await requestRegenerate(briefId);
        await refresh();
        return id;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not rewrite your brief.');
        return null;
      } finally {
        mark(briefId, false);
      }
    },
    [refresh]
  );

  const latest = useMemo(() => latestPerClip(all), [all]);

  return {
    /** One brief per clip: the newest. This is what the screens list. */
    briefs: latest,
    /** Every version, including ones replaced by Regenerate. */
    all,
    loaded,
    error,
    clearError: () => setError(null),
    /** Is this clip being adapted, or this brief being regenerated? */
    isWorking: (key: string) => working.has(key),
    refresh,
    edit,
    generate,
    regenerate,
  };
}

export type Briefs = ReturnType<typeof useBriefs>;
