// data/briefs.ts
// The user's briefs, kept on the device for now (stand-in for the `briefs` table).
// A new install has none; they come from "Adapt for my brand" on an analysed
// clip, or from the sample library.
//
// "Adapt" is NOT AI yet: it copies the analysis into a draft (hook, shot beats
// as the shot list, CTA) for the user to rewrite. When the worker can generate
// briefs, replace `briefFromAnalysis` with a call to it.
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockBriefs } from './mockVideos';
import type { Brief, Clip, TypedAnalysis } from '../types';

const STORAGE_KEY = 'lyrebird.briefs';

/** Brief fields the "Your version" screen edits. */
export type BriefEdit = Partial<Pick<Brief, 'hook' | 'script' | 'shot_list' | 'caption' | 'cta' | 'hashtags'>>;

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

export function briefFromAnalysis(clip: Clip, analysis: TypedAnalysis, brandId: string): Brief {
  const now = new Date().toISOString();
  return {
    id: `local-brief-${Date.now().toString(36)}`,
    owner_id: clip.owner_id,
    clip_id: clip.id,
    brand_id: brandId,
    analysis_id: analysis.id,
    hook: analysis.payload.hook,
    script: null,
    shot_list: analysis.payload.shotBeats,
    caption: null,
    cta: analysis.payload.cta || null,
    hashtags: [],
    status: 'draft',
    created_at: now,
    updated_at: now,
  };
}

export function useBriefs() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => (raw ? (JSON.parse(raw) as Brief[]) : []))
      .catch(() => [] as Brief[])
      .then((stored) => {
        setBriefs(stored);
        setLoaded(true);
      });
  }, []);

  const update = useCallback((fn: (current: Brief[]) => Brief[]) => {
    setBriefs((current) => {
      const next = fn(current);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const add = useCallback((brief: Brief) => update((current) => [brief, ...current]), [update]);

  const edit = useCallback(
    (id: string, patch: BriefEdit) =>
      update((current) =>
        current.map((b) =>
          b.id === id
            ? {
                ...b,
                ...patch,
                status: b.status === 'draft' ? 'edited' : b.status,
                updated_at: new Date().toISOString(),
              }
            : b
        )
      ),
    [update]
  );

  /** Adds the mock briefs that belong to the sample clips. */
  const loadSamples = useCallback(
    () =>
      update((current) => [
        ...current.filter((b) => !mockBriefs.some((m) => m.id === b.id)),
        ...mockBriefs,
      ]),
    [update]
  );

  return { briefs, loaded, add, edit, loadSamples };
}

export type Briefs = ReturnType<typeof useBriefs>;
