// data/recordings.ts
// Screen-recording import, start to finish (docs/be28-screen-recording-import.md):
//   pick one long recording -> upload -> worker splits it into clips
//   -> each clip is prepared and analysed, one at a time -> library refresh.
//
// The three things the handover warns about, and how they're handled here:
//   1. It's slow. The state carries an estimate (about the recording's length
//      again, plus up to 50s if the worker is asleep) for the screen to show.
//   2. Errors are never swallowed: they're shown, and written to
//      recordings.error_message.
//   3. Retrying is safe (the split endpoint is idempotent), so a failed split
//      offers "Try again" on the same recording.
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { currentUserId } from './account';
import { MAX_UPLOAD_BYTES } from './library';
import { markAnalysisFailed, prepareClip, requestAnalysis } from '../lib/clips';
import { markRecordingFailed, requestSplit, uploadRecording } from '../lib/recordings';

export type RecordingImport =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'splitting'; recordingId: string; estimateSeconds: number; startedAt: number }
  | { phase: 'analysing'; total: number; done: number }
  | { phase: 'done'; clips: number }
  | { phase: 'failed'; message: string; recordingId?: string };

/** Up to this long for a sleeping free-tier worker to start. */
const COLD_START_SECONDS = 50;

/** Splitting re-encodes every segment: budget about the recording's length again. */
export function splitEstimateSeconds(durationSeconds: number | null | undefined) {
  return Math.round((durationSeconds ?? 60) * 1.5 + COLD_START_SECONDS);
}

export function useRecordingImport({ onClipsReady }: { onClipsReady: () => Promise<unknown> | void }) {
  const [state, setState] = useState<RecordingImport>({ phase: 'idle' });
  const busy = useRef(false);

  /** Split an uploaded recording, then analyse what it produced. */
  const split = useCallback(
    async (recordingId: string, durationSeconds: number | null) => {
      setState({
        phase: 'splitting',
        recordingId,
        estimateSeconds: splitEstimateSeconds(durationSeconds),
        startedAt: Date.now(),
      });
      let clipIds: string[];
      try {
        const result = await requestSplit(recordingId);
        clipIds = [...result.clips]
          .sort((a, b) => a.position_in_parent - b.position_in_parent)
          .map((c) => c.clip_id);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not split your recording.';
        await markRecordingFailed(recordingId, message);
        setState({ phase: 'failed', message, recordingId });
        return;
      }

      // The clips exist now (as 'processing'); show them while they're analysed.
      await onClipsReady();

      // One at a time, not all at once: each is a Gemini call, and the free
      // tier is a small daily budget shared by everyone.
      setState({ phase: 'analysing', total: clipIds.length, done: 0 });
      for (let i = 0; i < clipIds.length; i++) {
        const id = clipIds[i];
        await prepareClip(id).catch(() => {});
        try {
          await requestAnalysis(id);
        } catch (e) {
          await markAnalysisFailed(id, e instanceof Error ? e.message : 'Could not analyse this clip.');
        }
        setState({ phase: 'analysing', total: clipIds.length, done: i + 1 });
      }
      await onClipsReady();
      setState({ phase: 'done', clips: clipIds.length });
    },
    [onClipsReady]
  );

  /** "+" -> Screen recording. */
  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // Its own picker: one file, and no 90-second limit -- a recording is
      // longer than a clip on purpose. Reusing the camera-roll flow would
      // reject exactly the files this is for.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
        quality: 1,
        // iPhone: hand over a smaller copy so it fits the upload limit.
        videoExportPreset: ImagePicker.VideoExportPreset.H264_960x540,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) {
        Alert.alert(
          'This recording is too big',
          `It's over ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Try a shorter recording.`
        );
        return;
      }

      const userId = await currentUserId();
      if (!userId) {
        setState({ phase: 'failed', message: 'Sign in to import a recording.' });
        return;
      }

      setState({ phase: 'uploading' });
      let recording;
      try {
        recording = await uploadRecording(userId, asset);
      } catch (e) {
        setState({ phase: 'failed', message: e instanceof Error ? e.message : 'Could not upload your recording.' });
        return;
      }
      await split(recording.id, recording.duration_seconds);
    } finally {
      busy.current = false;
    }
  }, [split]);

  /** Try the split again. Safe: a recording already split returns its clips. */
  const retry = useCallback(async () => {
    if (state.phase !== 'failed' || !state.recordingId || busy.current) return;
    busy.current = true;
    try {
      await split(state.recordingId, null);
    } finally {
      busy.current = false;
    }
  }, [state, split]);

  const dismiss = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, start, retry, dismiss };
}
