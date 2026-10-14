import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import VideoPlayerModal from '../components/VideoPlayerModal';

const mockSignedVideoUrl = jest.fn();
jest.mock('../lib/clips', () => ({
  signedVideoUrl: (...args: unknown[]) => mockSignedVideoUrl(...args),
}));

describe('VideoPlayerModal', () => {
  beforeEach(() => mockSignedVideoUrl.mockReset());

  test('plays the clip from a signed link, straight away', async () => {
    mockSignedVideoUrl.mockResolvedValue('https://signed/video.mp4');
    const { findByTestId } = await render(
      <VideoPlayerModal visible storagePath="u1/a-480p.mp4" title="Morning routine" onClose={jest.fn()} />
    );

    const view = await findByTestId('video-player');
    expect(mockSignedVideoUrl).toHaveBeenCalledWith('u1/a-480p.mp4');
    expect(view.props.player.source).toBe('https://signed/video.mp4');
    expect(view.props.player.play).toHaveBeenCalled();
    expect(view.props.nativeControls).toBe(true);
  });

  test('says so when the video cannot be played', async () => {
    mockSignedVideoUrl.mockResolvedValue(null);
    const { findByText, queryByTestId } = await render(
      <VideoPlayerModal visible storagePath="u1/gone.mp4" onClose={jest.fn()} />
    );

    expect(await findByText("This video can't be played. It may still be uploading, or it was deleted.")).toBeTruthy();
    expect(queryByTestId('video-player')).toBeNull();
  });

  test('the close button closes it', async () => {
    mockSignedVideoUrl.mockResolvedValue('https://signed/video.mp4');
    const onClose = jest.fn();
    const { getByLabelText } = await render(
      <VideoPlayerModal visible storagePath="u1/a.mp4" onClose={onClose} />
    );

    await fireEvent.press(getByLabelText('Close video'));
    expect(onClose).toHaveBeenCalled();
  });
});
