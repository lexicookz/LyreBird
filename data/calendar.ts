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
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  briefId: string;
  /** Local date the content should be posted, YYYY-MM-DD. */
  date: string;
  stage: FunnelStage;
  status: CalendarStatus;
};

const STORAGE_KEY = 'lyrebird.calendar';

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
  return seed.map(([briefId, offset, status]) => ({
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

export function useCalendar() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => (raw ? (JSON.parse(raw) as CalendarItem[]) : []))
      .catch(() => [] as CalendarItem[])
      .then((loadedItems) => {
        setItems(loadedItems);
        setLoaded(true);
      });
  }, []);

  const update = useCallback((fn: (current: CalendarItem[]) => CalendarItem[]) => {
    setItems((current) => {
      const next = fn(current);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  /** Adds or replaces the brief's entry. */
  const schedule = useCallback(
    (item: CalendarItem) =>
      update((current) => [...current.filter((i) => i.briefId !== item.briefId), item]),
    [update]
  );

  const unschedule = useCallback(
    (briefId: string) => update((current) => current.filter((i) => i.briefId !== briefId)),
    [update]
  );

  return { items, loaded, schedule, unschedule };
}

export type Calendar = ReturnType<typeof useCalendar>;
