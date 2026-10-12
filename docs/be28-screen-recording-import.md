# BE-28 handover — screen recording import

The worker can split a screen recording into one clip per video in the feed.
The app has no way to give it one, so the feature is unreachable. This is the
missing half, and all of it is app-side.

Nothing in `screens/`, `components/` or `App.tsx` has been touched — that's
this list.

Line numbers are from commit `885e88b`.

---

## What is already built

You are not waiting on backend for any of this:

| Piece | Where | State |
| --- | --- | --- |
| `recordings` table, with `owner_id` and its RLS policy | `supabase/migrations/20260901000000_init.sql:78` | done |
| `recordings` storage bucket, private, with the `<user_id>/` path policies | same file, `:250` | done |
| `POST /recordings/{id}/split` | `worker/app/routers/recordings.py` | done, verified 51/51 against the real database |
| `clips.recording_id` and `clips.position_in_parent` | schema | done, and the split endpoint fills both |

Every step below is the app talking to Supabase directly under RLS, plus one
call to the worker. That is the architecture working as intended — the only
thing the worker is needed for is ffmpeg.

---

## The flow

```
"+"  ->  Screen recording  ->  picker  ->  upload to `recordings`
     ->  insert a recordings row  ->  POST /recordings/{id}/split
     ->  wait  ->  refresh the library
```

### 1. A second row in the menu

`components/AddVideoMenu.tsx` already says in its header comment that screen
recordings go here. It takes `onCameraRoll`; add `onScreenRecording` beside it
and a second `<Pressable>` using the same `styles.option` block (`:35`).

`App.tsx:383` renders the menu and passes `onCameraRoll`. The new prop wires
up the same way.

### 2. Pick it — but not through `useVideoImport`

**This is the one that will bite you.** `components/ImportFlow.tsx:31` filters
the picker's result:

```ts
const fits = result.assets.filter(
  (a) => !a.duration || a.duration / 1000 <= MAX_CLIP_SECONDS
);
```

`MAX_CLIP_SECONDS` is 90 (`data/library.ts:41`). A screen recording is
deliberately longer than one clip — that is the entire point of splitting it —
so the existing flow would reject exactly the files this feature is for, and
tell the user they were "too long".

Use a separate picker call with `allowsMultipleSelection: false` and no
duration filter. Reusing `useVideoImport` and loosening the limit would break
the camera-roll path, where 90 seconds is a real constraint.

### 3. Upload and insert

`lib/clips.ts:153` (`uploadClip`) is the model. The same shape, against the
other bucket and table — new file, say `lib/recordings.ts`:

```ts
export const RECORDINGS_BUCKET = 'recordings';

export async function uploadRecording(
  userId: string,
  asset: ImagePickerAsset
): Promise<Recording> {
  const body = await fetch(asset.uri).then((r) => r.arrayBuffer());

  // `<user_id>/<filename>`, not a convention you can vary: the storage
  // policies compare (storage.foldername(name))[1] to auth.uid(), so a file
  // written anywhere else is unreadable by the person who owns it.
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
```

`source` must be one of `screen_recording | camera_roll | link` — the column
has a check constraint and a typo is a 400.

### 4. Ask the worker to split it

```ts
export async function requestSplit(recordingId: string): Promise<SplitResult> {
  const response = await fetch(`${WORKER_URL}/recordings/${recordingId}/split`, {
    method: 'POST',
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Split failed (${response.status}). ${detail.slice(0, 200)}`);
  }
  return response.json();
}
```

`WORKER_URL` is already derived in `lib/clips.ts:21` — lift it somewhere
shared rather than copying the fallback.

The response carries `clips` (each with `clip_id`, `position_in_parent`,
`start_seconds`, `end_seconds`), `boundaries`, and `already_split`. You do not
have to read any of it — the rows are in the database by the time it returns,
so `refresh()` is enough — but `clips.length` is a good thing to say in the
success message.

### 5. Show the library

`useLibrary()` in `data/library.ts` already reads clips with their
`position_in_parent`. Call `refresh(false)` after the split returns, as
`importVideos` does at `:334`.

---

## Three things that will catch you out

**1. It is slow, and genuinely so.** Every segment is re-encoded — a
stream copy would cut on the nearest keyframe and start each clip with the
tail of the previous video. Budget roughly the recording's own length again,
more on Render's shared CPU, plus up to 50 seconds if the free instance is
asleep. A two-minute recording can be a four-minute wait.

That needs a real progress state, not a spinner: tell the user what is
happening and roughly how long. An indeterminate spinner for four minutes
reads as a hang.

**2. Do not swallow the error.** This is the bug we just fixed on the
camera-roll path (PR #39): `requestAnalysis(...).catch(() => {})` left clips
on `processing` forever with nothing on screen, and a stale worker URL was
indistinguishable from a slow analysis. Cost an afternoon. The split path has
the same shape and the same trap — if it fails, say so, and write the reason
to `recordings.error_message` the way `markAnalysisFailed` does for clips
(`lib/clips.ts`).

**3. Retrying is safe, so let the user.** The endpoint is idempotent: a
recording already marked `split` returns its existing clips with
`already_split: true` rather than cutting a second set. A timeout and retry
cannot duplicate anything.

---

## Files

| File | Change |
| --- | --- |
| `components/AddVideoMenu.tsx` | second row, `onScreenRecording` prop |
| `App.tsx:383` | pass it; hold the in-progress state |
| `lib/recordings.ts` | new — `uploadRecording`, `requestSplit` |
| `data/library.ts` or a new `data/recordings.ts` | the hook: pick, upload, split, refresh, surface errors |
| `types/index.ts:25` | `Recording` is already exported |

---

## Done when

Picking a screen recording in the app produces several clips in the library,
in the order they appeared in the recording.

---

## One caveat worth knowing before you demo it

**The clip boundaries have never been checked against real footage.** The
detector was measured on a corpus built with ffmpeg, not a phone — see
`docs/be23-detection-decision.md`. Five real recordings are with the testing
analyst, and until they come back the cut points are good enough to show
someone and not known to be right.

Build the import regardless: every option in BE-23 needs it, and it is the
larger piece of work in all of them. Just do not make it the headline of the
demo until BE-21 closes.
