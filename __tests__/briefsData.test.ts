import { latestPerClip } from '../data/briefs';
import { mockBriefs } from '../data/mockVideos';

describe('brief data', () => {
  it('retains briefs whose source clips were deleted', () => {
    const older = {
      ...mockBriefs[0],
      id: 'orphan-older',
      clip_id: null,
      created_at: '2026-10-20T10:00:00.000Z',
    };

    const newer = {
      ...mockBriefs[1],
      id: 'orphan-newer',
      clip_id: null,
      created_at: '2026-10-21T10:00:00.000Z',
    };

    const result = latestPerClip([older, newer]);

    expect(result.map((brief) => brief.id)).toEqual([
      'orphan-newer',
      'orphan-older',
    ]);
  });

  it('still returns only the newest brief for an existing clip', () => {
    const older = {
      ...mockBriefs[0],
      id: 'older-version',
      created_at: '2026-10-20T10:00:00.000Z',
    };

    const newer = {
      ...older,
      id: 'newer-version',
      created_at: '2026-10-21T10:00:00.000Z',
    };

    const result = latestPerClip([older, newer]);

    expect(result.map((brief) => brief.id)).toEqual(['newer-version']);
  });
});