// lib/clips.ts
//
// Everything the app does with clips, in one place: reading the library and
// uploading a video straight from the camera roll.
//
// These are plain Supabase calls under RLS — there is no worker endpoint in
// front of them, and there should not be. The worker exists for ffmpeg and
// Gemini; a table read the app can make itself belongs in the app.

import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';
import type { Analysis, Clip } from '../types';

export const CLIPS_BUCKET = 'clips';

/**
 * Clips the signed-in user owns, newest first, with the analyses that drive
 * the funnel filter.
 *
 * No owner_id filter is needed: RLS returns only rows this user owns. Adding
 * one would be harmless but misleading, implying the database would hand back
 * someone else's rows without it.
 */
export async function fetchLibrary(): Promise<{ clips: Clip[]; analyses: Analysis[] }> {
  const [clipsResult, analysesResult] = await Promise.all([
    supabase.from('clips').select('*').order('created_at', { ascending: false }),
    supabase.from('analyses').select('*'),
  ]);

  if (clipsResult.error) throw new Error(`Could not load clips: ${clipsResult.error.message}`);
  if (analysesResult.error) throw new Error(`Could not load analyses: ${analysesResult.error.message}`);

  return {
    clips: clipsResult.data ?? [],
    analyses: (analysesResult.data ?? []) as Analysis[],
  };
}

/** Distinguishes "user backed out of the picker" from a real failure. */
export class UploadCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'UploadCancelled';
  }
}

function extensionFor(uri: string, mimeType?: string | null): string {
  const fromUri = uri.split('?')[0].split('.').pop();
  if (fromUri && fromUri.length <= 5 && fromUri !== uri) return fromUri.toLowerCase();
  if (mimeType?.includes('quicktime')) return 'mov';
  return 'mp4';
}

/**
 * Opens the camera roll, uploads the chosen video to the clips bucket, and
 * inserts the matching clips row.
 *
 * The storage path is `<user_id>/<filename>`. That is not a convention this
 * function is free to vary: the storage policies compare
 * `(storage.foldername(name))[1]` to `auth.uid()`, so a file written anywhere
 * else is rejected on write, and would be unreadable by its own owner even if
 * it landed.
 */
export async function uploadClipFromCameraRoll(userId: string): Promise<Clip> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('LYREBIRD needs access to your camera roll to upload a video.');
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsMultipleSelection: false,
    quality: 1,
  });

  if (picked.canceled || picked.assets.length === 0) throw new UploadCancelled();

  const asset = picked.assets[0];
  const extension = extensionFor(asset.uri, asset.mimeType);
  const contentType = asset.mimeType ?? `video/${extension === 'mov' ? 'quicktime' : 'mp4'}`;

  // Read the local file into memory. fetch() handles the file:// and ph://
  // URIs the picker returns, which is why this does not go through
  // expo-file-system: its API moved in SDK 54 and this avoids the split.
  const body = await fetch(asset.uri).then((response) => response.arrayBuffer());

  // Date-prefixed so two uploads of "IMG_0042.mov" do not collide. Still
  // inside the user's own folder, which is what the policy checks.
  const filename = `${Date.now()}-${(asset.fileName ?? `clip.${extension}`).replace(/[^\w.-]/g, '_')}`;
  const storagePath = `${userId}/${filename}`;

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
      // recording_id stays null: the schema reserves that for clips split out
      // of a recording, and a camera-roll import was never split.
      // status defaults to 'processing' — the clip exists before its analysis.
    })
    .select()
    .single();

  if (error) {
    // The row is what makes the file visible. Without it the upload is an
    // orphan nobody can find, so clean up rather than leave one behind.
    await supabase.storage.from(CLIPS_BUCKET).remove([storagePath]);
    throw new Error(`Saved the file but could not create the clip: ${error.message}`);
  }

  return data;
}
