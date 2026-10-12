import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCalendar } from '../data/calendar';

/**
 * The calendar lives in Supabase now, so "persistence" means the row, not a
 * key in AsyncStorage. The data layer is mocked with an in-memory table that
 * behaves like the real one -- including scheduleBrief replacing a brief's
 * entry, which is the app's rule rather than a database constraint.
 *
 * What this is checking is that the hook writes through rather than keeping
 * state of its own: a change that only reaches React state looks identical
 * on screen and is gone on restart, which is exactly what BE-19 is about.
 */
jest.mock('../lib/calendar', () => {
  const rows: any[] = [];
  let n = 0;
  return {
    __rows: rows,
    fetchCalendar: jest.fn(async () => [...rows]),
    scheduleBrief: jest.fn(async (ownerId: string, briefId: string, date: string, status: string) => {
      const i = rows.findIndex((r) => r.brief_id === briefId);
      if (i >= 0) rows.splice(i, 1);
      n += 1;
      const row = {
        id: `cal-${n}`, owner_id: ownerId, brief_id: briefId,
        scheduled_for: date, status, platform: null, notes: null,
        created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z',
      };
      rows.push(row);
      return row;
    }),
    moveEntry: jest.fn(async (id: string, date: string) => {
      const row = rows.find((r) => r.id === id);
      if (row) row.scheduled_for = date;
      return row;
    }),
    setEntryStatus: jest.fn(async (id: string, status: string) => {
      const row = rows.find((r) => r.id === id);
      if (row) row.status = status;
      return row;
    }),
    unscheduleBrief: jest.fn(async (briefId: string) => {
      const i = rows.findIndex((r) => r.brief_id === briefId);
      if (i >= 0) rows.splice(i, 1);
    }),
  };
});

jest.mock('../data/account', () => ({
  currentUserId: jest.fn(async () => 'user-1'),
}));

const BRIEF = 'bbbbbbbb-0000-4000-8000-000000000001';
const calendarApi = require('../lib/calendar');

function seed(rows: { id: string; brief_id: string; scheduled_for: string; status: string }[]) {
  calendarApi.__rows.length = 0;
  rows.forEach((r) =>
    calendarApi.__rows.push({
      owner_id: 'user-1', platform: null, notes: null,
      created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z',
      ...r,
    })
  );
}

describe('useCalendar persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    calendarApi.__rows.length = 0;
  });

  it('loads entries from the database', async () => {
    seed([{ id: 'e1', brief_id: BRIEF, scheduled_for: '2026-10-10', status: 'planned' }]);

    const { result } = await renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.items).toEqual([
      expect.objectContaining({ id: 'e1', briefId: BRIEF, date: '2026-10-10', status: 'planned' }),
    ]);
  });

  it('scheduling writes a row, not just state', async () => {
    const { result } = await renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.schedule({ briefId: BRIEF, date: '2026-10-10', status: 'planned' });
    });

    expect(calendarApi.scheduleBrief).toHaveBeenCalledWith('user-1', BRIEF, '2026-10-10', 'planned');
    expect(calendarApi.__rows).toHaveLength(1);
    expect(result.current.items[0]).toEqual(
      expect.objectContaining({ date: '2026-10-10', status: 'planned' })
    );
  });

  it('rescheduling the same brief replaces its entry rather than adding another', async () => {
    const { result } = await renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.schedule({ briefId: BRIEF, date: '2026-10-10', status: 'planned' });
    });
    await act(async () => {
      await result.current.schedule({ briefId: BRIEF, date: '2026-11-15', status: 'filmed' });
    });

    expect(calendarApi.__rows).toHaveLength(1);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toEqual(
      expect.objectContaining({ date: '2026-11-15', status: 'filmed' })
    );
  });

  it('moving an entry changes the date and leaves the status alone', async () => {
    seed([{ id: 'e1', brief_id: BRIEF, scheduled_for: '2026-10-10', status: 'filmed' }]);

    const { result } = await renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.move('e1', '2026-10-17');
    });

    // Dragging a card is not the same action as filling in the sheet: a
    // 'filmed' card dragged to next week is still filmed.
    expect(calendarApi.moveEntry).toHaveBeenCalledWith('e1', '2026-10-17');
    expect(calendarApi.__rows[0]).toEqual(
      expect.objectContaining({ scheduled_for: '2026-10-17', status: 'filmed' })
    );
  });

  it('a moved entry is still moved after a reload', async () => {
    seed([{ id: 'e1', brief_id: BRIEF, scheduled_for: '2026-10-10', status: 'planned' }]);

    const first = await renderHook(() => useCalendar());
    await waitFor(() => expect(first.result.current.loaded).toBe(true));
    await act(async () => {
      await first.result.current.move('e1', '2026-10-17');
    });
    // A fresh mount reads the table again, which is what an app restart
    // does. Not unmounting the first: the point is that the second hook
    // learns the new date from the row rather than from shared state.
    const second = await renderHook(() => useCalendar());
    await waitFor(() => expect(second.result.current.loaded).toBe(true));
    expect(second.result.current.items[0].date).toBe('2026-10-17');
  });

  it('changing status keeps the date', async () => {
    seed([{ id: 'e1', brief_id: BRIEF, scheduled_for: '2026-10-10', status: 'planned' }]);

    const { result } = await renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.setStatus('e1', 'posted');
    });

    expect(calendarApi.__rows[0]).toEqual(
      expect.objectContaining({ scheduled_for: '2026-10-10', status: 'posted' })
    );
  });

  it('unscheduling removes the row', async () => {
    seed([{ id: 'e1', brief_id: BRIEF, scheduled_for: '2026-10-10', status: 'planned' }]);

    const { result } = await renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.unschedule(BRIEF);
    });

    expect(calendarApi.unscheduleBrief).toHaveBeenCalledWith(BRIEF);
    expect(calendarApi.__rows).toHaveLength(0);
    expect(result.current.items).toHaveLength(0);
  });

  it('surfaces a load failure instead of showing an empty calendar', async () => {
    calendarApi.fetchCalendar.mockRejectedValueOnce(new Error('network is down'));

    const { result } = await renderHook(() => useCalendar());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    // An empty board and a board that failed to load look identical, and
    // only one of them means "schedule something".
    expect(result.current.error).toContain('network is down');
  });
});
