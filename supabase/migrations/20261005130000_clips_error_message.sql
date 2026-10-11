-- ============================================================
-- clips.error_message (BE-14)
--
-- A clip can fail in the worker — ffmpeg rejects the file, Gemini times out,
-- the model returns something that is not a valid analysis. Today the only
-- trace of that is status = 'failed', which tells the app something went
-- wrong but never what, so the only honest thing it can show is a generic
-- error and the only remedy is to try again blind.
--
-- recordings already carries error_message for exactly this reason. This
-- mirrors it on clips, which is where the work actually happens now that
-- camera-roll imports skip the recordings table entirely.
--
-- Nullable, and cleared on a successful run: a message left over from an
-- earlier failure sitting next to status = 'ready' would be worse than none.
-- ============================================================

alter table public.clips
  add column error_message text;
