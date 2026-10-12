// data/calendar.ts
// The content calendar: which brief is planned to be posted on which day, and
// how far along it is. Kept on the device for now.
//
// Differences from the `calendar_entries` table worth knowing before this moves
// to Supabase:
//   - `status` and `stage` live on the entry here. The table has neither; the
//     closest thing is briefs.status, whose values don't include "filmed".
//     Mapping, if it's kept on the brief: draft/edited -> draft,
//     scheduled -> planned, published -> posted, and "filmed" needs adding.
//   - One entry per brief. The table allows several (one per platform).
//   - Dates only, no times: the team decided against posting times.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { currentUserId } from './account';
import {
  fetchCalendar,
  moveEntry,
  scheduleBrief,
  setEntryStatus,
  unscheduleBrief,
} from '../lib/calendar';
import { mockAnalyses, mockBriefs } from './mockVideos';
import type { FunnelStage } from '../types';

export type CalendarStatus = 'draft' | 'planned' | 'filmed' | 'posted';

export const CALENDAR_STATUSES: { key: CalendarStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'planned', label: 'Planned' },
  { key: 'filmed', label: 'Filmed' },
  { key: 'posted', label: 'Posted' },
];

export type CalendarItem = {
  /** The calendar_entries row. Needed to move or restatus one directly. */
  id: string;
  briefId: string;
  /** Local date the content should be posted, YYYY-MM-DD. */
  date: string;
  stage: FunnelStage;
  status: CalendarStatus;
};


// ---------- dates (local time, Monday-first weeks) ----------

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseISODate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date) {
  return addDays(d, -((d.getDay() + 6) % 7));
}

// Fixed names rather than toLocaleDateString, whose output differs between
// phones and locales ("Sep" vs "Sept", comma placement).
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "TUE 29" */
export function formatDayLabel(d: Date) {
  return `${WEEKDAYS[d.getDay()].slice(0, 3).toUpperCase()} ${d.getDate()}`;
}

/** "Tue 29 Sep" */
export function formatShortDate(d: Date) {
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** "Tuesday 29 September 2026" */
export function formatLongDate(d: Date) {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------- briefs ----------

/** The funnel stage a brief came from, via its analysis. */
export function stageForBrief(briefId: string): FunnelStage {
  const brief = mockBriefs.find((b) => b.id === briefId);
  const analysis = mockAnalyses.find((a) => a.id === brief?.analysis_id);
  return analysis?.payload.funnelStage ?? 'TOFU';
}

// ---------- sample data ----------

/**
 * Sample entries laid out around the current week, for tests and demos. The app
 * itself starts with an empty calendar. Offsets are days from Monday.
 */
export function sampleCalendar(today = new Date()): CalendarItem[] {
  const monday = startOfWeek(today);
  const seed: [briefId: string, offset: number, status: CalendarStatus][] = [
    ['bbbbbbbb-0000-4000-8000-000000000001', 1, 'planned'],
    ['bbbbbbbb-0000-4000-8000-000000000003', 3, 'filmed'],
    ['bbbbbbbb-0000-4000-8000-000000000004', 6, 'draft'],
    ['bbbbbbbb-0000-4000-8000-000000000002', -5, 'posted'],
    ['bbbbbbbb-0000-4000-8000-000000000005', -30, 'posted'],
  ];
  return seed.map(([briefId, offset, status], i) => ({
    // Sample rows never reach the database, so a readable local id is
    // clearer here than a uuid that implies one.
    id: `sample-${i + 1}`,
    briefId,
    date: toISODate(addDays(monday, offset)),
    stage: stageForBrief(briefId),
    status,
  }));
}

/** First day from tomorrow with nothing planned. */
export function suggestDate(items: CalendarItem[], today = new Date()) {
  const taken = new Set(items.map((i) => i.date));
  let d = addDays(today, 1);
  while (taken.has(toISODate(d))) d = addDays(d, 1);
  return toISODate(d);
}

// ---------- hook ----------

/**
 * The calendar, in Supabase.
 *
 * `stage` is not stored. It belongs to the brief's analysis, so keeping a
 * copy on the entry would let the two disagree the moment a clip was
 * re-analysed. The caller passes a resolver instead, since it is the thing
 * that already holds the briefs and analyses.
 */
export function useCalendar(stageFor: (briefId: string) => FunnelStage = stageForBrief) {
  const [rows, setRows] = useState<
    { id: string; briefId: string; date: string; status: CalendarStatus }[]
  >([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const entries = await fetchCalendar();
      setRows(
        entries.map((e) => ({
          id: e.id,
          briefId: e.brief_id,
          date: e.scheduled_for,
          status: (e.status ?? 'draft') as CalendarStatus,
        }))
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your calendar.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await refresh();
      if (active) setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const items: CalendarItem[] = useMemo(
    () => rows.map((r) => ({ ...r, stage: stageFor(r.briefId) })),
    [rows, stageFor]
  );

  /** Adds or replaces the brief's entry. */
  const schedule = useCallback(
    async (item: { briefId: string; date: string; status: CalendarStatus }) => {
      const userId = await currentUserId();
      if (!userId) {
        setError('Sign in to schedule a brief.');
        return;
      }
      try {
        await scheduleBrief(userId, item.briefId, item.date, item.status);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not schedule that brief.');
      }
      await refresh();
    },
    [refresh]
  );

  /**
   * Drag-and-drop. Moves the card on screen first so the gesture feels
   * immediate, then writes; the refresh is what confirms it stuck.
   */
  const move = useCallback(
    async (entryId: string, date: string) => {
      setRows((current) => current.map((r) => (r.id === entryId ? { ...r, date } : r)));
      try {
        await moveEntry(entryId, date);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not move that entry.');
      }
      await refresh();
    },
    [refresh]
  );

  const setStatus = useCallback(
    async (entryId: string, status: CalendarStatus) => {
      setRows((current) => current.map((r) => (r.id === entryId ? { ...r, status } : r)));
      try {
        await setEntryStatus(entryId, status);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update that entry.');
      }
      await refresh();
    },
    [refresh]
  );

  const unschedule = useCallback(
    async (briefId: string) => {
      setRows((current) => current.filter((r) => r.briefId !== briefId));
      try {
        await unscheduleBrief(briefId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not unschedule that brief.');
      }
      await refresh();
    },
    [refresh]
  );

  return { items, loaded, error, refresh, schedule, move, setStatus, unschedule };
}

export type Calendar = ReturnType<typeof useCalendar>;
