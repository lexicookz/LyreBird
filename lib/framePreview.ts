// lib/framePreview.ts
//
// A still from the video itself, for clips that have no thumbnail yet
// (/prepare hasn't run, or the clip predates it). The thumbnail from /prepare
// is always preferred; this is only the fallback.
//
// Grabbing a frame means reading part of the video over the network, so:
//   - results are cached for the session, keyed by clip id;
//   - at most MAX_PARALLEL grabs run at once, so opening a library of
//     twenty-four un-thumbnailed clips doesn't start twenty-four downloads;
//   - a failure is cached too (as null), so a broken file isn't retried on
//     every render. It just keeps its colour block.
import { useEffect, useState } from 'react';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { signedVideoUrl } from './clips';

/**
 * Half a second in rather than frame zero: TikToks and Reels often open on a
 * black frame or a fade-in, which makes an empty-looking preview.
 */
const FRAME_AT_MS = 500;
const MAX_PARALLEL = 2;

const cache = new Map<string, Promise<string | null>>();
const waiting: (() => void)[] = [];
let running = 0;

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/** A local image URI for a frame of the clip's video, or null if it can't be made. */
export function framePreview(clipId: string, storagePath: string): Promise<string | null> {
  const cached = cache.get(clipId);
  if (cached) return cached;
  const job = withSlot(async () => {
    try {
      const url = await signedVideoUrl(storagePath);
      if (!url) return null;
      const { uri } = await VideoThumbnails.getThumbnailAsync(url, { time: FRAME_AT_MS });
      return uri;
    } catch {
      return null;
    }
  });
  cache.set(clipId, job);
  return job;
}

/**
 * The frame preview for a clip, or null while it's loading or if there isn't
 * one. Pass `enabled: false` when the clip already has a real thumbnail.
 */
export function useFramePreview(
  clip: { id: string; storage_path: string },
  enabled: boolean
): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    framePreview(clip.id, clip.storage_path).then((u) => {
      if (active) setUri(u);
    });
    return () => {
      active = false;
    };
  }, [clip.id, clip.storage_path, enabled]);
  return enabled ? uri : null;
}

/** For tests. */
export function __resetFramePreviewCache() {
  cache.clear();
}
