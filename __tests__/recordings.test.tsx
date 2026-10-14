import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { splitEstimateSeconds, useRecordingImport } from '../data/recordings';
import RecordingProgress from '../components/RecordingProgress';

const mockPick = jest.fn();
const mockUpload = jest.fn();
const mockSplit = jest.fn();
const mockMarkFailed = jest.fn(async (..._args: unknown[]) => {});
const mockPrepare = jest.fn(async (..._args: unknown[]) => {});
const mockAnalyse = jest.fn(async (..._args: unknown[]) => {});
const mockMarkAnalysisFailed = jest.fn(async (..._args: unknown[]) => {});

jest.mock('expo-image-picker', () => ({
  VideoExportPreset: { H264_960x540: 5 },
  launchImageLibraryAsync: (...a: unknown[]) => mockPick(...a),
}));
jest.mock('../lib/recordings', () => ({
  uploadRecording: (...a: unknown[]) => mockUpload(...a),
  requestSplit: (...a: unknown[]) => mockSplit(...a),
  markRecordingFailed: (...a: unknown[]) => mockMarkFailed(...a),
}));
jest.mock('../lib/clips', () => ({
  prepareClip: (...a: unknown[]) => mockPrepare(...a),
  requestAnalysis: (...a: unknown[]) => mockAnalyse(...a),
  markAnalysisFailed: (...a: unknown[]) => mockMarkAnalysisFailed(...a),
}));
jest.mock('../data/account', () => ({ currentUserId: async () => 'user-1' }));
jest.mock('../data/library', () => ({ MAX_UPLOAD_BYTES: 50 * 1024 * 1024 }));

const recordingAsset = { uri: 'file:///rec.mov', fileName: 'rec.mov', duration: 120_000, fileSize: 20 * 1024 * 1024, width: 1, height: 1 };

describe('useRecordingImport', () => {
  beforeEach(() => {
    [mockPick, mockUpload, mockSplit, mockMarkFailed, mockPrepare, mockAnalyse, mockMarkAnalysisFailed].forEach((m) => m.mockClear());
    mockPick.mockResolvedValue({ canceled: false, assets: [recordingAsset] });
    mockUpload.mockResolvedValue({ id: 'rec-1', duration_seconds: 120 });
  });

  test('uploads, splits, then analyses each clip in order, one at a time', async () => {
    mockSplit.mockResolvedValue({
      recording_id: 'rec-1',
      clips: [
        { clip_id: 'c2', position_in_parent: 2, start_seconds: 40, end_seconds: 80 },
        { clip_id: 'c1', position_in_parent: 1, start_seconds: 0, end_seconds: 40 },
      ],
      boundaries: [40],
      duration_seconds: 120,
      already_split: false,
    });
    let inFlight = 0;
    let most = 0;
    mockAnalyse.mockImplementation(async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
    });
    const onClipsReady = jest.fn(async (..._args: unknown[]) => {});
    const { result } = await renderHook(() => useRecordingImport({ onClipsReady }));

    await act(async () => {
      await result.current.start();
    });

    // Its own picker: one file, shrunk on iPhone, and no 90-second filter.
    expect(mockPick).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: false, videoExportPreset: 5 }));
    expect(mockUpload).toHaveBeenCalledWith('user-1', recordingAsset);
    expect(mockSplit).toHaveBeenCalledWith('rec-1');
    expect(mockAnalyse.mock.calls.map((c) => c[0])).toEqual(['c1', 'c2']);
    expect(most).toBe(1);
    expect(onClipsReady).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({ phase: 'done', clips: 2 });
  });

  test('a failed split is shown, written to the recording, and can be retried', async () => {
    mockSplit.mockRejectedValueOnce(new Error("Couldn't split your recording (500). ffmpeg failed"));
    const { result } = await renderHook(() => useRecordingImport({ onClipsReady: jest.fn() }));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toEqual({
      phase: 'failed',
      message: "Couldn't split your recording (500). ffmpeg failed",
      recordingId: 'rec-1',
    });
    expect(mockMarkFailed).toHaveBeenCalledWith('rec-1', "Couldn't split your recording (500). ffmpeg failed");

    mockSplit.mockResolvedValueOnce({ recording_id: 'rec-1', clips: [], boundaries: [], duration_seconds: null, already_split: true });
    await act(async () => {
      await result.current.retry();
    });
    expect(mockSplit).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ phase: 'done', clips: 0 });
  });

  test('a recording over the upload limit is turned away before uploading', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPick.mockResolvedValue({ canceled: false, assets: [{ ...recordingAsset, fileSize: 80 * 1024 * 1024 }] });
    const { result } = await renderHook(() => useRecordingImport({ onClipsReady: jest.fn() }));

    await act(async () => {
      await result.current.start();
    });

    expect(alert).toHaveBeenCalledWith('This recording is too big', "It's over 50 MB. Try a shorter recording.");
    expect(mockUpload).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ phase: 'idle' });
    alert.mockRestore();
  });
});

describe('RecordingProgress', () => {
  test('while splitting, it shows an estimate rather than just a spinner', async () => {
    const { getByText } = await render(
      <RecordingProgress
        state={{ phase: 'splitting', recordingId: 'rec-1', estimateSeconds: 240, startedAt: Date.now() }}
        bottom={100}
        onRetry={jest.fn()}
        onDismiss={jest.fn()}
      />
    );
    expect(getByText('Splitting your recording into videos…')).toBeTruthy();
    expect(getByText('about 4 min left')).toBeTruthy();
  });

  test('a failure offers Try again', async () => {
    const onRetry = jest.fn();
    const { getByText } = await render(
      <RecordingProgress
        state={{ phase: 'failed', message: 'Split failed', recordingId: 'rec-1' }}
        bottom={100}
        onRetry={onRetry}
        onDismiss={jest.fn()}
      />
    );
    expect(getByText('Split failed')).toBeTruthy();
    await fireEvent.press(getByText('Try again'));
    expect(onRetry).toHaveBeenCalled();
  });

  test('the estimate allows for the recording length and a sleeping worker', () => {
    expect(splitEstimateSeconds(120)).toBe(230);
  });
});
