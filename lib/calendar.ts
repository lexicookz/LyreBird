// lib/calendar.ts
//
// Scheduling, in Supabase. The app writes calendar_entries directly under
// RLS -- there is no endpoint, because none is needed: this is a date and a
// status against a brief the user already owns.

import { supabase } from './supabase';
import type { CalendarEntry } from '../types';

export type CalendarStatus = 'draft' | 'planned' | 'filmed' | 'posted';

/** Every entry the signed-in user can see, soonest first. */
export async function fetchCalendar(): Promise<CalendarEntry[]> {
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('*')
    .order('scheduled_for', { ascending: true });

  if (error) throw new Error(`Could not load your calendar: ${error.message}`);
  return data ?? [];
}

/**
 * Put a brief on a date, replacing whatever was there for it.
 *
 * Delete-then-insert rather than an upsert, because there is no unique index
 * to upsert against: the schema lets a brief be scheduled more than once, on
 * purpose, so a brief can go to two platforms. The app does not expose that
 * yet and shows one entry per brief, so "replace" is the honest
 * implementation of what the UI promises.
 */
export async function scheduleBrief(
  userId: string,
  briefId: string,
  date: string,
  status: CalendarStatus
): Promise<CalendarEntry> {
  await supabase.from('calendar_entries').delete().eq('brief_id', briefId);

  const { data, error } = await supabase
    .from('calendar_entries')
    .insert({
      owner_id: userId,
      brief_id: briefId,
      scheduled_for: date,
      status,
    })
    .select()
    .single();

  if (error) throw new Error(`Could not schedule that brief: ${error.message}`);
  return data;
}

/**
 * Move an entry to another date.
 *
 * Separate from scheduleBrief because dragging a card is not the same action
 * as filling in the sheet: it changes the date and must leave the status
 * alone. Going through schedule() would quietly reset a 'filmed' card to
 * whatever the caller happened to pass.
 */
export async function moveEntry(entryId: string, date: string): Promise<CalendarEntry> {
  const { data, error } = await supabase
    .from('calendar_entries')
    .update({ scheduled_for: date })
    .eq('id', entryId)
    .select()
    .single();

  if (error) throw new Error(`Could not move that entry: ${error.message}`);
  return data;
}

/** Change how far along a brief is, without touching its date. */
export async function setEntryStatus(
  entryId: string,
  status: CalendarStatus
): Promise<CalendarEntry> {
  const { data, error } = await supabase
    .from('calendar_entries')
    .update({ status })
    .eq('id', entryId)
    .select()
    .single();

  if (error) throw new Error(`Could not update that entry: ${error.message}`);
  return data;
}

/** Take a brief off the calendar. The brief itself is untouched. */
export async function unscheduleBrief(briefId: string): Promise<void> {
  const { error } = await supabase.from('calendar_entries').delete().eq('brief_id', briefId);
  if (error) throw new Error(`Could not unschedule that brief: ${error.message}`);
}
