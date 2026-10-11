// lib/clips.ts
//
// Clips and their analyses, in Supabase. The app talks to the database
// directly under RLS; only the Gemini call goes through the worker.
//
// Adapted from the original BE-09 branch, with one difference: the picker
// stays in the app. The redesigned screens already pick assets and hand them
// over, so these functions take an ImagePickerAsset rather than opening the
// library themselves.

import type { ImagePickerAsset } from 'expo-image-picker';

import { supabase } from './supabase';
import type { Analysis, Clip } from '../types';

export const CLIPS_BUCKET = 'clips';

/** Where the worker lives. Same variable the analysis call already uses. */
const WORKER_URL = (
  process.env.EXPO_PUBLIC_WORKER_URL ?? 'http://localhost:8000'
).replace(/\/+$/, '');

/** How many clips a page of the library holds. */
export const LIBRARY_PAGE_SIZE = 24;

export type LibrarySort = 'newest' | 'oldest';

export type LibraryQuery = {
  /** Clips carrying every one of these tags. Empty or absent means no filter. */
  tags?: string[];
  sort?: LibrarySort;
  /** Which page, zero-based. */
  page?: number;
  pageSize?: number;
};

export type LibraryPage = {
  clips: Clip[];
  analyses: Analysis[];
  /** Whether another page exists, so the screen knows to keep offering more. */
  hasMore: boolean;
  /** Total matching the filter, which is not the number returned. */
  total: number;
};

/**
 * One page of the signed-in user's library.
 *
 * Filtering, sorting and paging all happen in Postgres rather than in the
 * app: `tags` uses the gin index the schema already carries
 * (clips_tags_idx), so it stays fast as the library grows, and the app never
 * downloads rows it is not going to show.
 *
 * Deliberately no `owner_id` filter. RLS already returns only this user's
 * rows, and adding one here would suggest the database might hand back
 * someone else's -- which is the thing the policies exist to make impossible.
 *
 * Analyses are fetched for the clips on this page only. Loading all of them
 * to display twenty-four would undo the point of paging.
 */
export async function fetchLibrary(query: LibraryQuery = {}): Promise<LibraryPage> {
  const pageSize = query.pageSize ?? LIBRARY_PAGE_SIZE;
  const page = query.page ?? 0;
  const from = page * pageSize;

  let clipsQuery = supabase
    .from('clips')
    // count: 'exact' is what makes hasMore answerable without a second query.
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: query.sort === 'oldest' })
    .range(from, from + pageSize - 1);

  if (query.tags?.length) {
    // contains, not overlaps: picking two tags should narrow the list rather
    // than widen it, which is what a reader expects of stacked filters.
    clipsQuery = clipsQuery.contains('tags', query.tags);
  }

  const { data, error, count } = await clipsQuery;
  if (error) throw new Error(`Could not load your clips: ${error.message}`);

  const clips = data ?? [];
  const total = count ?? clips.length;

  if (clips.length === 0) {
    return { clips: [], analyses: [], hasMore: false, total };
  }

  const analyses = await supabase
    .from('analyses')
    .select('*')
    .in('clip_id', clips.map((c) => c.id))
    .order('created_at', { ascending: false });

  if (analyses.error) throw new Error(`Could not load analyses: ${analyses.error.message}`);

  return {
    clips,
    analyses: analyses.data ?? [],
    hasMore: from + clips.length < total,
    total,
  };
}

/** Every tag in use, for the filter row. */
export async function fetchTags(): Promise<string[]> {
  const { data, error } = await supabase.from('clips').select('tags');
  if (error) throw new Error(`Could not load tags: ${error.message}`);
  const seen = new Set<string>();
  for (const row of data ?? []) for (const tag of row.tags ?? []) seen.add(tag);
  return [...seen].sort();
}

function extensionFor(uri: string, mimeType?: string | null): string {
  const fromMime = mimeType?.split('/')[1];
  if (fromMime && /^[a-z0-9]+$/i.test(fromMime)) return fromMime === 'quicktime' ? 'mov' : fromMime;
  const fromUri = uri.split('?')[0].split('.').pop();
  return fromUri && /^[a-z0-9]+$/i.test(fromUri) ? fromUri.toLowerCase() : 'mp4';
}

/**
 * Upload one picked video and create its clip row.
 *
 * The storage path is `<user_id>/<filename>`, which is not a convention this
 * function is free to vary: the storage policies compare
 * `(storage.foldername(name))[1]` to `auth.uid()`, so a file written anywhere
 * else is rejected on write and would be unreadable by its own owner even if
 * it landed.
 */
export async function uploadClip(userId: string, asset: ImagePickerAsset): Promise<Clip> {
  const extension = extensionFor(asset.uri, asset.mimeType);
  const contentType = asset.mimeType ?? `video/${extension === 'mov' ? 'quicktime' : 'mp4'}`;

  // fetch() handles the file:// and ph:// URIs the picker returns, which is
  // why this does not go through expo-file-system -- its API moved in SDK 54
  // and this sidesteps the split.
  const body = await fetch(asset.uri).then((response) => response.arrayBuffer());

  // Timestamp-prefixed so two uploads of "IMG_0042.mov" do not collide. Still
  // inside the user's own folder, which is what the policy checks.
  const safeName = (asset.fileName ?? `clip.${extension}`).replace(/[^\w.-]/g, '_');
  const storagePath = `${userId}/${Date.now()}-${safeName}`;

  const upload = await supabase.storage
    .from(CLIPS_BUCKET)
    .upload(storagePath, body, { contentType, upsert: false });

  if (upload.error) throw new Error(`Upload failed: ${upload.error.message}`);

  const { data, error } = await supabase
    .from('clips')
    .insert({
      owner_id: userId,
      storage_path: storagePath,
      title: asset.fileName ?? 'Untitled clip',
      duration_seconds: asset.duration != null ? asset.duration / 1000 : null,
      // recording_id stays null: the schema reserves it for clips split out of
      // a recording, and a camera-roll import was never split. status defaults
      // to 'processing' -- the clip exists before its analysis does.
    })
    .select()
    .single();

  if (error) {
    // The row is what makes the file findable. Without one the upload is an
    // orphan nothing references, so clean up rather than leave it behind.
    await supabase.storage.from(CLIPS_BUCKET).remove([storagePath]);
    throw new Error(`Saved the file but could not create the clip: ${error.message}`);
  }

  return data;
}

/**
 * Ask the worker to analyse a clip that is already in storage.
 *
 * This is the real endpoint -- it reads the video from storage, writes the
 * analyses row against the clip's owner, and records which model and prompt
 * produced it. The app never sees the Gemini key.
 */
export async function requestAnalysis(clipId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${WORKER_URL}/clips/${clipId}/analyse`, { method: 'POST' });
  } catch {
    throw new Error(
      `Could not reach the worker at ${WORKER_URL}. Set EXPO_PUBLIC_WORKER_URL in .env ` +
        `to where it is running — on a phone that has to be a LAN address or the ` +
        `deployed URL, not localhost.`
    );
  }

  if (!response.ok) {
    // The worker already records the reason on the clip row, so the message
    // here only has to get the user to the right explanation.
    const detail = await response.text().catch(() => '');
    throw new Error(
      response.status === 504
        ? 'The analysis timed out. Try again in a moment.'
        : `Analysis failed (${response.status}). ${detail.slice(0, 200)}`
    );
  }
}

/** Removes a clip, its analyses and its file. Briefs written from it are kept. */
export async function deleteClip(clip: Clip): Promise<void> {
  // Rows first. A deleted file with a surviving row is a clip that looks
  // present and cannot play; a deleted row with a surviving file is only
  // wasted storage, which is the better of the two to be left with.
  const { error } = await supabase.from('clips').delete().eq('id', clip.id);
  if (error) throw new Error(`Could not delete the clip: ${error.message}`);

  if (clip.storage_path) {
    await supabase.storage.from(CLIPS_BUCKET).remove([clip.storage_path]);
  }
}
