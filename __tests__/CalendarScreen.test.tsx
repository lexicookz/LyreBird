import React from 'react';
import {
  act,
  fireEvent,
  render,
} from '@testing-library/react-native';
import CalendarScreen from '../screens/CalendarScreen';

describe('CalendarScreen', () => {
  it('starts in List view', async () => {
    const { getByText } = await render(
      <CalendarScreen onBack={jest.fn()} />
    );

    expect(getByText('Your Content Schedule')).toBeTruthy();
    expect(
      getByText(
        "I used to hit snooze 5 times. Here's what fixed it."
      )
    ).toBeTruthy();
  });

  it('switches to the Year calendar view', async () => {
    const { getByRole, getByText } = await render(
      <CalendarScreen onBack={jest.fn()} />
    );

    await act(async () => {
      fireEvent.press(
        getByRole('button', { name: 'Calendar' })
      );
    });

    expect(getByText('2026')).toBeTruthy();
    expect(getByText('Jan')).toBeTruthy();
    expect(getByText('Dec')).toBeTruthy();
  });

  it('switches between Week, Month and Year ranges', async () => {
    const { getByRole, getByText } = await render(
      <CalendarScreen onBack={jest.fn()} />
    );

    await act(async () => {
      fireEvent.press(
        getByRole('button', { name: 'Calendar' })
      );
    });

    await act(async () => {
      fireEvent.press(
        getByRole('button', { name: 'Month' })
      );
    });

    expect(getByText('Sep 2026')).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        getByRole('button', { name: 'Week' })
      );
    });

    expect(
      getByText(
        "I used to hit snooze 5 times. Here's what fixed it."
      )
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        getByRole('button', { name: 'Year' })
      );
    });

    expect(getByText('2026')).toBeTruthy();
  });

  it('calls onBack when Back is pressed', async () => {
    const onBack = jest.fn();

    const { getByText } = await render(
      <CalendarScreen onBack={onBack} />
    );

    await act(async () => {
      fireEvent.press(getByText('← Back'));
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});