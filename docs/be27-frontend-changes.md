# BE-27 handover — screen changes needed

The mock data and shared types now match the database exactly. That means the
screens need updating, because six of them read fields that have moved or been
renamed.

Nothing in `screens/` or `App.tsx` has been touched — that's this list.

Line numbers are from commit `7ffc9a8`.

---

## What changed underneath you

**Three columns were added to the schema** rather than changing your mocks,
because your shape was the right one:

| Column | Why |
| --- | --- |
| `clips.status` | The library screen needs per-clip state. `processing \| ready \| failed`, exactly your `VideoStatus`. |
| `clips.thumbnail_url` | A directly renderable URL, so screens don't have to mint signed URLs to show a thumbnail. |
| `briefs.cta` | A brief's CTA is authored content and belongs on the brief. |

**Two things moved, and here the database shape won:**

1. **Analysis fields are no longer on the clip.** `hook`, `transcript`,
   `onScreenText`, `shotBeats`, `pacing`, `cta`, `format` and `funnelStage`
   now live on a separate `analyses` row, looked up by `clip_id`. The schema
   keeps them separate on purpose: prompts change weekly and we want to compare
   runs rather than overwrite them.

2. **`scheduledDate` is no longer on the brief.** Scheduling lives in
   `calendar_entries`, so one brief can be posted to several platforms on
   different dates.

**Everything is snake_case now**, because it comes straight from Postgres.

`mockVideos`, `mockBrandProfile`, `Video` and `BrandProfile` still export as
deprecated aliases, so imports won't break — only field names will.

---

## LibraryScreen.tsx — 1 change

```diff
- <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} />
+ <Image source={{ uri: video.thumbnail_url ?? undefined }} style={styles.thumbnail} />
```

`video.status` on line 13 works unchanged.

The `?? undefined` matters: `thumbnail_url` is `string | null`, and `Image`'s
`uri` won't accept `null` under `strict`.

Optionally swap `mockVideos`/`Video` for `mockClips`/`Clip` (lines 4–5).

---

## BrandProfileScreen.tsx — 3 changes

Lines 47–49:

```diff
- const [product, setProduct]   = useState(existingProfile?.product ?? '');
- const [audience, setAudience] = useState(existingProfile?.audience ?? '');
- const [tone, setTone]         = useState(existingProfile?.tone ?? '');
+ const [product, setProduct]   = useState(existingProfile?.product_summary ?? '');
+ const [audience, setAudience] = useState(existingProfile?.target_audience ?? '');
+ const [tone, setTone]         = useState(existingProfile?.tone_of_voice ?? '');
```

The `BrandProfile` type on line 44 still resolves (it aliases `Brand`).

Note `brands.name` is NOT NULL and this screen has no field for it — worth
adding one, or the save path will need a default.

---

## App.tsx — 1 change

Line 56:

```diff
- const existingBrief = mockBriefs.find((b) => b.videoId === selectedVideo.id);
+ const existingBrief = mockBriefs.find((b) => b.clip_id === selectedVideo.id);
```

---

## BriefScreen.tsx — 3 changes

`existingBrief?.hook` and `existingBrief?.cta` still work — `cta` is a real
column now. What breaks is reading them off `video`, and `shotList`.

```diff
- const [hook, setHook] = useState(existingBrief?.hook ?? video.hook ?? '');
+ const analysis = mockAnalyses.find((a) => a.clip_id === video.id);
+ const [hook, setHook] = useState(existingBrief?.hook ?? analysis?.payload.hook ?? '');

- const [shotListText, setShotListText] = useState(
-   existingBrief?.shotList?.join('\n') ?? ''
- );
+ const [shotListText, setShotListText] = useState(
+   ((existingBrief?.shot_list as string[] | null) ?? []).join('\n')
+ );

- const [cta, setCta] = useState(existingBrief?.cta ?? video.cta ?? '');
+ const [cta, setCta] = useState(existingBrief?.cta ?? analysis?.payload.cta ?? '');
```

The cast on `shot_list` is needed because the column is `jsonb`, so the
generated type is `Json` and `.join` isn't callable on it. If you'd rather not
cast, say so and we can give `shot_list` a stricter shape.

Also update the keys in the `handleSave` console.log (lines 60–63) to
`clip_id` / `shot_list` so it matches what an insert will actually take.

---

## CalendarScreen.tsx — rework

Grouping now comes from `calendar_entries` rather than a field on the brief.

```diff
- import { mockBriefs, mockVideos } from '../data/mockVideos';
- import { Brief } from '../types';
+ import { mockBriefs, mockCalendarEntries, mockClips } from '../data/mockVideos';
+ import { Brief, CalendarEntry } from '../types';
```

```diff
  function BriefRow({ brief }: { brief: Brief }) {
-   const video = mockVideos.find((v) => v.id === brief.videoId);
+   const clip = mockClips.find((c) => c.id === brief.clip_id);
```
(and `video.title` → `clip.title` on line 23)

Then the grouping block, lines 31–39:

```ts
const scheduledIds = new Set(mockCalendarEntries.map((e) => e.brief_id));
const unscheduled = mockBriefs.filter((b) => !scheduledIds.has(b.id));

const grouped: Record<string, Brief[]> = {};
mockCalendarEntries.forEach((entry) => {
  const brief = mockBriefs.find((b) => b.id === entry.brief_id);
  if (!brief) return;
  const key = formatDate(entry.scheduled_for);
  (grouped[key] ??= []).push(brief);
});
```

`scheduled_for` is a date (`2026-09-02`), not a timestamp, so `formatDate` still
works but there's no time component to show. If you want the time back it would
have to become a new column — tell us and we'll add it.

One brief can now appear under two dates. That's intentional: cross-posting the
same brief to TikTok and Instagram is a real case, and `entry.platform` is
there if you want to show which is which.

---

## VideoDetailScreen.tsx — rework

The biggest one: eight fields move behind an analysis lookup.

```diff
- import { Video } from '../types';
+ import { Clip } from '../types';
+ import { mockAnalyses } from '../data/mockVideos';
```

```diff
- video: Video;
+ video: Clip;
```

Add the lookup near line 24, next to `isReady`:

```ts
const analysis = mockAnalyses.find((a) => a.clip_id === video.id);
```

Line 35:

```diff
- <Image source={{ uri: video.thumbnailUrl }} style={styles.hero} />
+ <Image source={{ uri: video.thumbnail_url ?? undefined }} style={styles.hero} />
```

`video.status` on lines 24, 38 and 51 works unchanged.

Then lines 58–95, everything inside `{isReady && (...)}`:

| Was | Now |
| --- | --- |
| `video.hook` | `analysis?.payload.hook` |
| `video.transcript` | `analysis?.payload.transcript` |
| `video.onScreenText` | `analysis?.payload.onScreenText` |
| `video.shotBeats?.map` | `analysis?.payload.shotBeats.map` |
| `video.pacing` | `analysis?.payload.pacing` |
| `video.cta` | `analysis?.payload.cta` |
| `video.format` | `analysis?.payload.format` |
| `video.funnelStage` | `analysis?.payload.funnelStage` |

Worth changing the guard from `isReady` to `isReady && analysis`, because
status and analysis are now independent: a clip can be `ready` with its analysis
row not yet written. The mocks deliberately include clips with no analysis at
all so this path is testable.

---

## One open question for the team

`funnelStage` values disagree between two files that both claim to be right:

- your original mocks used `top` / `middle` / `bottom`
- `pipeline/schema.py`, which is what actually calls Gemini, returns
  `TOFU` / `MOFU` / `BOFU`

The reconciled mocks use the pipeline's values, because that's what will really
be in the column. If you'd rather the UI vocabulary won, the pipeline schema has
to change instead — but it should be decided before either side ships, not after.

Same question applies to `format`: your `talking_head | voiceover | text_overlay
| skit | other` is currently kept, but the pipeline also emits a separate
`formatTag` (`ugc_testimonial | founder_pov | problem_agitate_solve`) which
nothing in the UI shows yet.

---

## After you're done

`npx tsc --noEmit` should pass. The mock data and types already do — they were
checked against the generated types under `strict`.

When real queries replace the mocks, each screen becomes a one-line import
swap, because the mock objects are the same type the Supabase client returns.
