import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import BriefsScreen from '../screens/BriefsScreen';
import BriefScreen from '../screens/BriefScreen';
import { mockBriefs } from '../data/mockVideos';
import type { CalendarItem } from '../data/calendar';

// Brief 1 planned, brief 2 posted, the other three unscheduled.
const items: CalendarItem[] = [
  { id: 'e1', briefId: 'bbbbbbbb-0000-4000-8000-000000000001', date: '2026-10-06', stage: 'TOFU', status: 'planned' },
  { id: 'e2', briefId: 'bbbbbbbb-0000-4000-8000-000000000002', date: '2026-09-20', stage: 'MOFU', status: 'posted' },
];

async function renderBriefs() {
  const onSchedule = jest.fn();
  const screen = await render(
    <BriefsScreen
      briefs={mockBriefs}
      calendarItems={items}
      stageOf={() => 'TOFU'}
      onSelectBrief={jest.fn()}
      onSchedule={onSchedule}
      onOpenBrandProfile={jest.fn()}
    />
  );
  return { onSchedule, ...screen };
}

describe('BriefsScreen', () => {
  test('counts briefs and lists the unscheduled ones first', async () => {
    const { getByText, queryByText } = await renderBriefs();

    expect(getByText('5 briefs,\n3 not dated')).toBeTruthy();
    expect(getByText('“Last chance before the price goes up”')).toBeTruthy();
    expect(queryByText("“I used to hit snooze 5 times. Here's what fixed it.”")).toBeNull();
  });

  test('tabs show planned and posted briefs', async () => {
    const { getByText, queryByText } = await renderBriefs();

    await fireEvent.press(getByText('Planned'));
    expect(getByText("“I used to hit snooze 5 times. Here's what fixed it.”")).toBeTruthy();
    expect(getByText('Reschedule')).toBeTruthy();

    await fireEvent.press(getByText('Posted'));
    expect(getByText('“Your welcome email has a 3-second window. Most brands waste it.”')).toBeTruthy();
    expect(queryByText('Reschedule')).toBeNull();
  });

  test('Schedule opens the sheet for that brief', async () => {
    const { getByLabelText, onSchedule } = await renderBriefs();

    await fireEvent.press(getByLabelText('Schedule Last chance before the price goes up'));

    expect(onSchedule).toHaveBeenCalledWith('bbbbbbbb-0000-4000-8000-000000000003');
  });

  test('shows a starting point when there are no briefs', async () => {
    const { getByText } = await render(
      <BriefsScreen
        briefs={[]}
        calendarItems={[]}
        stageOf={() => 'TOFU'}
        onSelectBrief={jest.fn()}
        onSchedule={jest.fn()}
        onOpenBrandProfile={jest.fn()}
      />
    );

    expect(getByText('No briefs yet')).toBeTruthy();
  });
});

describe('BriefScreen', () => {
  test('shots can be added and are saved without empty rows', async () => {
    const onEdit = jest.fn();
    const { getByText, getByLabelText } = await render(
      <BriefScreen
        brief={mockBriefs[2]}
        onEdit={onEdit}
        onBack={jest.fn()}
        onSchedule={jest.fn()}
        onRegenerate={jest.fn()}
      />
    );

    expect(getByText('3 shots')).toBeTruthy();
    await fireEvent.press(getByText('+ Add shot'));
    await fireEvent.changeText(getByLabelText('Shot 4'), 'Close on the checkout button');

    expect(onEdit).toHaveBeenLastCalledWith({
      shot_list: [
        'Pricing page close-up',
        'Circle the old price',
        'Talking head with deadline',
        'Close on the checkout button',
      ],
    });
    expect(getByText('4 shots')).toBeTruthy();
  });
});
