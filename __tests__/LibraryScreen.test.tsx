import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import LibraryScreen from '../screens/LibraryScreen';
import { fetchLibrary, uploadClipFromCameraRoll } from '../lib/clips';
import type { Clip } from '../types';

// The screen now reads from Supabase. Mocking this module rather than the
// client keeps the tests about the screen's behaviour instead of the shape of
// a query builder chain.
jest.mock('../lib/clips', () => ({
    fetchLibrary: jest.fn(),
    uploadClipFromCameraRoll: jest.fn(),
    UploadCancelled: class UploadCancelled extends Error { },
}));

jest.mock('../lib/session', () => ({
    useUserId: () => 'test-user-id',
}));

const mockFetchLibrary = fetchLibrary as jest.MockedFunction<typeof fetchLibrary>;
const mockUpload = uploadClipFromCameraRoll as jest.MockedFunction<typeof uploadClipFromCameraRoll>;

function clip(overrides: Partial<Clip> & Pick<Clip, 'id' | 'title'>): Clip {
    return {
        created_at: '2026-09-23T00:00:00.000Z',
        updated_at: '2026-09-23T00:00:00.000Z',
        duration_seconds: 20,
        owner_id: 'test-user-id',
        position_in_parent: null,
        recording_id: null,
        status: 'ready',
        storage_path: 'test-user-id/clip.mp4',
        tags: [],
        thumbnail_path: null,
        thumbnail_url: null,
        ...overrides,
    };
}

const CLIPS: Clip[] = [
    clip({ id: 'clip-1', title: 'Morning routine that changed everything' }),
    clip({ id: 'clip-2', title: 'Why your onboarding emails are getting ignored' }),
];

async function renderScreen() {
    return await render(
        <LibraryScreen
            onSelectVideo={() => { }}
            onOpenBrandProfile={() => { }}
            onOpenCalendar={() => { }}
        />
    );
}

describe('LibraryScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetchLibrary.mockResolvedValue({ clips: CLIPS, analyses: [] });
    });

    test('shows all videos by default', async () => {
        const { findByText, getByText } = await renderScreen();

        // findByText rather than getByText: the list arrives asynchronously now.
        expect(await findByText('Morning routine that changed everything')).toBeTruthy();
        expect(getByText('Why your onboarding emails are getting ignored')).toBeTruthy();
    });

    test('filters videos by search query', async () => {
        const { findByText, getByPlaceholderText, getByText, queryByText } = await renderScreen();
        await findByText('Morning routine that changed everything');

        await fireEvent.changeText(getByPlaceholderText('Search hooks, captions, tags'), 'morning');

        expect(getByText('Morning routine that changed everything')).toBeTruthy();
        expect(queryByText('Why your onboarding emails are getting ignored')).toBeNull();
    });

    test('shows empty state when no videos match', async () => {
        const { findByText, getByPlaceholderText, getByText } = await renderScreen();
        await findByText('Morning routine that changed everything');

        await fireEvent.changeText(
            getByPlaceholderText('Search hooks, captions, tags'),
            'this query matches nothing at all'
        );

        expect(getByText('No videos match your search.')).toBeTruthy();
    });

    test('distinguishes an empty library from a search that matched nothing', async () => {
        mockFetchLibrary.mockResolvedValue({ clips: [], analyses: [] });
        const { findByText } = await renderScreen();

        expect(
            await findByText('No clips yet. Upload one from your camera roll to get started.')
        ).toBeTruthy();
    });

    test('surfaces a load failure instead of showing an empty library', async () => {
        mockFetchLibrary.mockRejectedValue(new Error('network is down'));
        const { findByText } = await renderScreen();

        expect(await findByText('network is down')).toBeTruthy();
    });

    test('uploading re-reads the library so the new clip appears', async () => {
        const { findByText, getByText } = await renderScreen();
        await findByText('Morning routine that changed everything');

        const uploaded = clip({ id: 'clip-3', title: 'Freshly uploaded clip', status: 'processing' });
        mockUpload.mockResolvedValue(uploaded);
        mockFetchLibrary.mockResolvedValue({ clips: [uploaded, ...CLIPS], analyses: [] });

        await fireEvent.press(getByText('Upload'));

        await waitFor(() => expect(mockUpload).toHaveBeenCalledWith('test-user-id'));
        expect(await findByText('Freshly uploaded clip')).toBeTruthy();
    });
});
