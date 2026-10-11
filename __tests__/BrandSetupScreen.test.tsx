import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BrandSetupScreen from '../screens/BrandSetupScreen';

async function setup() {
  const onBack = jest.fn();
  const onDone = jest.fn();
  const screen = await render(<BrandSetupScreen onBack={onBack} onDone={onDone} />);
  return { onBack, onDone, ...screen };
}

describe('BrandSetupScreen', () => {
  test('Continue does nothing on step 1 without a brand name', async () => {
    const { getByText, findByText } = await setup();

    await fireEvent.press(getByText('Continue'));

    expect(await findByText('Step 1 of 4')).toBeTruthy();
  });

  test('back on step 1 returns to the opener', async () => {
    const { getByLabelText, onBack } = await setup();

    await fireEvent.press(getByLabelText('Back'));

    expect(onBack).toHaveBeenCalled();
  });

  test('skipping without a brand name saves nothing', async () => {
    const { getByText, onDone } = await setup();

    await fireEvent.press(getByText('Skip for now'));

    expect(onDone).toHaveBeenCalledWith(null);
  });

  test('skipping part-way keeps what was entered', async () => {
    const { getByText, getByLabelText, onDone } = await setup();

    await fireEvent.changeText(getByLabelText('Brand name'), '  Nima Studio ');
    await fireEvent.press(getByText('Skip for now'));

    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nima Studio' }));
  });

  test('the hook preview follows the latest tone picked', async () => {
    const { getByText, getByLabelText, findByText } = await setup();

    await fireEvent.changeText(getByLabelText('Brand name'), 'Nima Studio');
    await fireEvent.press(getByText('Continue'));

    expect(await findByText('Pick a tone to see an example.')).toBeTruthy();
    await fireEvent.press(getByText('Dry humour'));
    expect(await findByText('“I bought 11 refill brands. Nine leaked.”')).toBeTruthy();
  });

  test('words to avoid can be added by typing and removed', async () => {
    const { getByText, getByLabelText, findByText, queryByText } = await setup();

    await fireEvent.changeText(getByLabelText('Brand name'), 'Nima Studio');
    await fireEvent.press(getByText('Continue'));
    await fireEvent.press(getByText('Continue'));

    const input = getByLabelText('Add a word or claim to avoid');
    await fireEvent.changeText(input, 'Clean beauty');
    await fireEvent(input, 'submitEditing');
    expect(await findByText('Clean beauty')).toBeTruthy();

    await fireEvent.press(getByLabelText('Remove Clean beauty'));
    expect(queryByText('Clean beauty')).toBeNull();
  });
});
