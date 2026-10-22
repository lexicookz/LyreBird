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
import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { WORKER_URL } from './worker';
import type { Analysis, Clip } from '../types';
import { Tag } from '../types/tag';

export const CLIPS_BUCKET = 'clips';
/** Where /prepare puts each clip's thumbnail. Private, like the clips. */
export const THUMBNAILS_BUCKET = 'thumbnails';




/** How many clips a page of the library holds. */
export const LIBRARY_PAGE_SIZE = 24;

export type LibrarySort = 'newest' | 'oldest';

export type LibraryQuery = {
  /**
   * Full-text search over the clip's title, tags, hook, on-screen text and
   * transcript. Matched by Postgres against a tsvector, so it finds a word
   * inside a transcript the app has never downloaded.
   */
  search?: string;
  /** Clips carrying every one of these tags. Empty or absent means no filter. */
  tags?: Tag[];
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
 * Analyses are fetched for the clips on this page, plus preserved analyses
 * whose source clips were deleted. Loading every analysis would undo paging.
 */
export async function fetchLibrary(query: LibraryQuery = {}): Promise<LibraryPage> {
  const pageSize = query.pageSize ?? LIBRARY_PAGE_SIZE;
  const page = query.page ?? 0;
  const from = page * pageSize;

  let clipsQuery = supabase
    .from('clips')
    // count: 'exact' is what makes hasMore answerable without a second query.
    // Columns listed rather than '*' so search_tsv stays on the server: it
    // is the full-text index, it can run to kilobytes a row, and nothing on
    // the phone reads it. Written as one literal because that is what the
    // client infers the row type from. A new column has to be added here.
    .select(
      'id,owner_id,recording_id,storage_path,thumbnail_path,thumbnail_url,title,tags,duration_seconds,position_in_parent,status,error_message,created_at,updated_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: query.sort === 'oldest' })
    .range(from, from + pageSize - 1);

  const search = query.search?.trim();
  if (search) {
    // websearch accepts what people actually type -- quoted phrases, OR,
    // a leading minus -- and does not throw on syntax a user got wrong,
    // which plainto_ and to_tsquery both do.
    clipsQuery = clipsQuery.textSearch('search_tsv', search, { type: 'websearch' });
  }

  if (query.tags?.length) {
    // contains, not overlaps: picking two tags should narrow the list rather
    // than widen it, which is what a reader expects of stacked filters.
    clipsQuery = clipsQuery.contains('tags', query.tags);
  }

  const { data, error, count } = await clipsQuery;
  if (error) throw new Error(`Could not load your clips: ${error.message}`);

  const clips = data ?? [];
  const total = count ?? clips.length;

  let analysesQuery = supabase
    .from('analyses')
    .select('*')
    .order('created_at', { ascending: false });

  if (clips.length === 0) {
    analysesQuery = analysesQuery.is('clip_id', null);
  } else {
    analysesQuery = analysesQuery.or(
      `clip_id.in.(${clips.map((clip) => clip.id).join(',')}),clip_id.is.null`
    );
  }

  const analyses = await analysesQuery;

  if (analyses.error) throw new Error(`Could not load analyses: ${analyses.error.message}`);

  return {
    clips: await withThumbnailUrls(clips),
    analyses: analyses.data ?? [],
    hasMore: from + clips.length < total,
    total,
  };
}

/** How long a thumbnail link works. The library refreshes well within this. */
const THUMBNAIL_URL_SECONDS = 60 * 60;

/**
 * Fill each clip's `thumbnail_url` with a signed link to its `thumbnail_path`.
 *
 * /prepare writes thumbnails to the private `thumbnails` bucket, so they can't
 * be shown by path; each needs a short-lived signed URL. One request signs the
 * whole page. The URL is only set on the copy in memory, never written back:
 * it expires, and the path is the durable thing.
 *
 * A thumbnail is decoration, so if signing fails the clips come back without
 * one and the card shows its plain colour block -- the library still loads.
 */
async function withThumbnailUrls<T extends { thumbnail_path: string | null; thumbnail_url: string | null }>(
  clips: T[]
): Promise<T[]> {
  const paths = clips.map((c) => c.thumbnail_path).filter((p): p is string => !!p);
  if (paths.length === 0) return clips;

  const { data, error } = await supabase.storage
    .from(THUMBNAILS_BUCKET)
    .createSignedUrls(paths, THUMBNAIL_URL_SECONDS);
  if (error || !data) return clips;

  const urlByPath = new Map(
    data.filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl])
  );
  return clips.map((c) =>
    c.thumbnail_path && urlByPath.has(c.thumbnail_path)
      ? { ...c, thumbnail_url: urlByPath.get(c.thumbnail_path)! }
      : c
  );
}

/** How long a link to a clip's video works -- long enough to watch and scrub it. */
const VIDEO_URL_SECONDS = 60 * 60;

/**
 * A short-lived link to a clip's video file in the private `clips` bucket,
 * for playing it or grabbing a frame. Null if the file can't be signed
 * (deleted, or the clip has no upload yet).
 */
export async function signedVideoUrl(storagePath: string): Promise<string | null> {
  if (!storagePath || storagePath.startsWith('local/')) return null;
  const { data, error } = await supabase.storage
    .from(CLIPS_BUCKET)
    .createSignedUrl(storagePath, VIDEO_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Every tag in use, for the filter row. */
export async function fetchTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from('clips').select('tags');
  if (error) throw new Error(`Could not load tags: ${error.message}`);
  const seen = new Set<Tag>();
  for (const row of data ?? []) for (const tag of row.tags ?? []) seen.add(tag as Tag);
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
/**
 * Read a picked video into memory for upload.
 *
 * Through Expo's native filesystem API rather than fetch(uri), because that
 * handles Android content:// URIs (the bug fixed in #52). Shared by clip and
 * screen-recording uploads.
 */
export async function readAssetBytes(asset: ImagePickerAsset): Promise<ArrayBuffer> {
  const sourceFile = new File(asset.uri);
  const body = await sourceFile.arrayBuffer();

  if (body.byteLength === 0) {
    throw new Error('Upload failed: the selected video could not be read.');
  }

  if (asset.fileSize != null && body.byteLength !== asset.fileSize) {
    throw new Error(
      `Upload failed: expected ${asset.fileSize} bytes but read ${body.byteLength}.`
    );
  }
  return body;
}

export async function uploadClip(userId: string, asset: ImagePickerAsset): Promise<Clip> {
  const extension = extensionFor(asset.uri, asset.mimeType);
  const contentType = asset.mimeType ?? `video/${extension === 'mov' ? 'quicktime' : 'mp4'}`;

  const body = await readAssetBytes(asset);

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
 * Ask the worker to downscale a clip and give it a thumbnail.
 *
 * Worth doing before the analysis rather than after: it replaces the file at
 * `storage_path` with a 480p version and deletes the original, so the
 * analysis downloads the smaller one. A phone capture is 1080p or 4K and
 * runs to tens of megabytes; the free Supabase tier is 1GB in total, which
 * is about a hundred untouched clips.
 *
 * Best effort by design. If this fails the clip is still there at full size
 * and still analysable — the worker records the reason on the row itself —
 * so the caller continues rather than treating it as a failed import.
 */
export async function prepareClip(clipId: string): Promise<void> {
  const response = await fetch(`${WORKER_URL}/clips/${clipId}/prepare`, { method: 'POST' });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Could not prepare the clip (${response.status}). ${detail.slice(0, 200)}`);
  }
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

/**
 * Record on the clip that its analysis never happened.
 *
 * The worker writes 'failed' and the reason itself whenever the request
 * reached it. This is for when it did not: an unreachable worker leaves
 * nothing on the row at all, so the clip sits on 'processing' forever and a
 * request that was never sent looks exactly like one still running. The app
 * owns the clip under RLS, so it can say so itself.
 *
 * Deliberately does not throw. It is already the error path, and the caller
 * has a message to show regardless of whether this write lands.
 */
export async function markAnalysisFailed(clipId: string, message: string): Promise<void> {
  await supabase
    .from('clips')
    .update({ status: 'failed', error_message: message.slice(0, 1000) })
    .eq('id', clipId);
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
