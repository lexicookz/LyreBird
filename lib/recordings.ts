// lib/recordings.ts
//
// Screen recordings, per docs/be28-screen-recording-import.md: upload one long
// recording of a scrolling session, then ask the worker to cut it into one
// clip per video in the feed (POST /recordings/{id}/split). The cutting is
// ffmpeg + OpenCV on the worker -- no AI. Each resulting clip is analysed
// afterwards like any other.

import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from './supabase';
import { readAssetBytes } from './clips';
import { postToWorker } from './worker';
import type { Recording } from '../types';

export const RECORDINGS_BUCKET = 'recordings';

export type SplitResult = {
  recording_id: string;
  clips: { clip_id: string; position_in_parent: number; start_seconds: number; end_seconds: number }[];
  boundaries: number[];
  duration_seconds: number | null;
  already_split: boolean;
};

export async function uploadRecording(userId: string, asset: ImagePickerAsset): Promise<Recording> {
  const body = await readAssetBytes(asset);

  // `<user_id>/<filename>`: the storage policies compare the first folder to
  // auth.uid(), so a file written anywhere else is unreadable by its owner.
  const safeName = (asset.fileName ?? 'recording.mp4').replace(/[^\w.-]/g, '_');
  const storagePath = `${userId}/${Date.now()}-${safeName}`;

  const upload = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(storagePath, body, { contentType: asset.mimeType ?? 'video/mp4' });
  if (upload.error) throw new Error(`Upload failed: ${upload.error.message}`);

  const { data, error } = await supabase
    .from('recordings')
    .insert({
      owner_id: userId,
      source: 'screen_recording',
      storage_path: storagePath,
      duration_seconds: asset.duration != null ? asset.duration / 1000 : null,
      // status defaults to 'uploaded'
    })
    .select()
    .single();

  if (error) {
    await supabase.storage.from(RECORDINGS_BUCKET).remove([storagePath]);
    throw new Error(`Saved the file but could not create the recording: ${error.message}`);
  }
  return data;
}

/**
 * Cut the recording into clips. Slow (about the recording's own length, more
 * if the worker is asleep) and safe to retry: a recording already split
 * returns its existing clips with already_split: true.
 */
export function requestSplit(recordingId: string): Promise<SplitResult> {
  return postToWorker<SplitResult>(`/recordings/${recordingId}/split`, undefined, 'split your recording');
}

/**
 * Record on the row that the split never happened, so it isn't left looking
 * like one still running (the trap from PR #39). Doesn't throw: it's already
 * the error path.
 */
export async function markRecordingFailed(recordingId: string, message: string): Promise<void> {
  await supabase
    .from('recordings')
    .update({ status: 'failed', error_message: message.slice(0, 1000) })
    .eq('id', recordingId);
}
