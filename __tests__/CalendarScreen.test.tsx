import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CalendarScreen from '../screens/CalendarScreen';
import { mockBriefs, mockClips } from '../data/mockVideos';
import { MONTHS, sampleCalendar, startOfWeek, suggestDate, toISODate, addDays, type CalendarItem, } from '../data/calendar';

async function renderCalendar(items = sampleCalendar()) {
  const onEditEntry = jest.fn();
  const screen = await render(
    <CalendarScreen
      items={items}
      briefs={mockBriefs}
      clipFor={(id) => mockClips.find((c) => c.id === id)}
      brandName="Nima Studio"
      onOpenBrandProfile={jest.fn()}
      onEditEntry={onEditEntry}
    />
  );
  return { onEditEntry, ...screen };
}

describe('CalendarScreen', () => {
  it('starts on this week with what is left to film', async () => {
    const { getByText } = await renderCalendar();

    // The seed puts three unposted briefs in the current week.
    expect(getByText('Three to film\nthis week')).toBeTruthy();
    expect(getByText("“I used to hit snooze 5 times. Here's what fixed it.”")).toBeTruthy();
    expect(getByText('Planned')).toBeTruthy();
    expect(getByText('Filmed')).toBeTruthy();
    expect(getByText('Draft')).toBeTruthy();
    expect(getByText('Shot list not written')).toBeTruthy();
  });

  it('tapping an entry opens it for editing', async () => {
    const { getByText, onEditEntry } = await renderCalendar();

    await fireEvent.press(getByText("“I used to hit snooze 5 times. Here's what fixed it.”"));

    expect(onEditEntry).toHaveBeenCalledWith('bbbbbbbb-0000-4000-8000-000000000001');
  });

  it('moves between weeks', async () => {
    const { getByLabelText, getByText } = await renderCalendar();

    await fireEvent.press(getByLabelText('Next week'));
    expect(getByText('Nothing to film\nnext week')).toBeTruthy();

    await fireEvent.press(getByLabelText('Previous week'));
    await fireEvent.press(getByLabelText('Previous week'));
    // The seed's posted brief is last Wednesday.
    expect(getByText('Nothing to film\nlast week')).toBeTruthy();
    expect(getByText('Posted')).toBeTruthy();
  });

  it('month view shows the selected day', async () => {
    const { getByText, getByRole, getAllByText } = await renderCalendar();

    await fireEvent.press(getByRole('button', { name: 'Month' }));

    const month = MONTHS[new Date().getMonth()];
    expect(getByText(month)).toBeTruthy();
    expect(getAllByText(/planned$/).length).toBeGreaterThan(0);
  });

  it('year view shows every month and opens one when tapped', async () => {
    const { getByText, getByRole, getByLabelText } = await renderCalendar();

    await fireEvent.press(getByRole('button', { name: 'Year' }));

    const year = String(new Date().getFullYear());
    expect(getByText(year)).toBeTruthy();
    expect(getByText('Jan')).toBeTruthy();
    expect(getByText('Dec')).toBeTruthy();

    await fireEvent.press(getByLabelText(/^Jan,/));
    expect(getByText('January')).toBeTruthy();
  });

  it('shows an empty state when nothing is scheduled', async () => {
  const { getByText, queryByText } = await renderCalendar([]);

    expect(
      getByText(
        /Nothing planned .*Open a brief and tap Schedule to plan it here\./
      )
    ).toBeTruthy();

    expect(
      queryByText(/I used to hit snooze 5 times/)
    ).toBeNull();
  });

  it('shows multiple briefs scheduled on the same day', async () => {
    const sameDay = toISODate(addDays(startOfWeek(new Date()), 1));

    const items: CalendarItem[] = [
      {
        briefId: mockBriefs[0].id,
        date: sameDay,
        stage: 'TOFU',
        status: 'planned',
      },
      {
        briefId: mockBriefs[1].id,
        date: sameDay,
        stage: 'MOFU',
        status: 'filmed',
      },
    ];

    const { getByText, onEditEntry } = await renderCalendar(items);

    expect(getByText('Two to film\nthis week')).toBeTruthy();
    expect(getByText('Planned')).toBeTruthy();
    expect(getByText('Filmed')).toBeTruthy();

    fireEvent.press(getByText('Planned'));
    fireEvent.press(getByText('Filmed'));

    expect(onEditEntry).toHaveBeenNthCalledWith(1, mockBriefs[0].id);
    expect(onEditEntry).toHaveBeenNthCalledWith(2, mockBriefs[1].id);
  });
});

describe('calendar data', () => {
  it('weeks start on Monday', () => {
    // 1 October 2026 is a Thursday.
    expect(toISODate(startOfWeek(new Date(2026, 9, 1)))).toBe('2026-09-28');
  });

  it('suggests the first day from tomorrow with nothing planned', () => {
    const today = new Date(2026, 9, 1);
    const items = [
      { briefId: 'a', date: toISODate(addDays(today, 1)), stage: 'TOFU' as const, status: 'planned' as const },
      { briefId: 'b', date: toISODate(addDays(today, 2)), stage: 'TOFU' as const, status: 'planned' as const },
    ];
    expect(suggestDate(items, today)).toBe('2026-10-04');
  });

  it('handles navigation across December and January', () => {
    const december31 = new Date(2026, 11, 31);
    const january1 = new Date(2027, 0, 1);

    expect(toISODate(addDays(december31, 1))).toBe('2027-01-01');
    expect(toISODate(addDays(january1, -1))).toBe('2026-12-31');
  });
});
