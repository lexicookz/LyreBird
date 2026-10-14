import { __resetFramePreviewCache, framePreview } from '../lib/framePreview';

const mockGetThumbnail = jest.fn();
const mockSignedVideoUrl = jest.fn();

jest.mock('expo-video-thumbnails', () => ({
  getThumbnailAsync: (...args: unknown[]) => mockGetThumbnail(...args),
}));
jest.mock('../lib/clips', () => ({
  signedVideoUrl: (...args: unknown[]) => mockSignedVideoUrl(...args),
}));

describe('framePreview', () => {
  beforeEach(() => {
    __resetFramePreviewCache();
    mockGetThumbnail.mockReset();
    mockSignedVideoUrl.mockReset();
    mockSignedVideoUrl.mockImplementation(async (path: string) => `https://signed/${path}`);
  });

  test('grabs a frame half a second in from the signed video link', async () => {
    mockGetThumbnail.mockResolvedValue({ uri: 'file:///frame.jpg', width: 1, height: 1 });

    await expect(framePreview('c1', 'u1/a.mp4')).resolves.toBe('file:///frame.jpg');
    expect(mockGetThumbnail).toHaveBeenCalledWith('https://signed/u1/a.mp4', { time: 500 });
  });

  test('grabs each clip only once', async () => {
    mockGetThumbnail.mockResolvedValue({ uri: 'file:///frame.jpg', width: 1, height: 1 });

    await framePreview('c1', 'u1/a.mp4');
    await framePreview('c1', 'u1/a.mp4');

    expect(mockGetThumbnail).toHaveBeenCalledTimes(1);
  });

  test('runs at most two grabs at a time', async () => {
    let inFlight = 0;
    let most = 0;
    mockGetThumbnail.mockImplementation(async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { uri: 'file:///f.jpg', width: 1, height: 1 };
    });

    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => framePreview(id, `u1/${id}.mp4`)));

    expect(mockGetThumbnail).toHaveBeenCalledTimes(5);
    expect(most).toBe(2);
  });

  test('a video that cannot be read gives no preview, and is not retried', async () => {
    mockGetThumbnail.mockRejectedValue(new Error('cannot decode'));

    await expect(framePreview('c1', 'u1/a.mp4')).resolves.toBeNull();
    await expect(framePreview('c1', 'u1/a.mp4')).resolves.toBeNull();
    expect(mockGetThumbnail).toHaveBeenCalledTimes(1);
  });

  test('no signed link means no preview', async () => {
    mockSignedVideoUrl.mockResolvedValue(null);

    await expect(framePreview('c1', 'u1/a.mp4')).resolves.toBeNull();
    expect(mockGetThumbnail).not.toHaveBeenCalled();
  });
});
