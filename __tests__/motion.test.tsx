import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { Appear, ScalePressable } from '../components/motion';

describe('motion', () => {
  test('Appear shows its content and passes view props through', async () => {
    const { getByText, getByLabelText } = await render(
      <Appear from="right" accessibilityLabel="panel">
        <Text>Hello</Text>
      </Appear>
    );
    expect(getByText('Hello')).toBeTruthy();
    expect(getByLabelText('panel')).toBeTruthy();
  });

  test('ScalePressable still presses, and resolves a style that depends on pressed', async () => {
    const onPress = jest.fn();
    const { getByText, getByRole } = await render(
      <ScalePressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
      >
        <Text>Tap me</Text>
      </ScalePressable>
    );

    await fireEvent.press(getByText('Tap me'));
    expect(onPress).toHaveBeenCalled();
    expect(getByRole('button')).toBeTruthy();
  });

  test('respects Reduce Motion', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { findByText } = await render(
      <Appear from="bottom">
        <Text>Still here</Text>
      </Appear>
    );
    expect(await findByText('Still here')).toBeTruthy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
