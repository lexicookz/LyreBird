import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LibraryScreen from '../screens/LibraryScreen';

describe('LibraryScreen', () => {
    test('shows all videos by default', async () => {
        const { getByText } = await render(
            <LibraryScreen
                onSelectVideo={() => { }}
                onOpenBrandProfile={() => { }}
                onOpenImport={() => { }}
                onOpenCalendar={() => { }}
            />
        );

        expect(getByText('Morning routine that changed everything')).toBeTruthy();
        expect(getByText('Why your onboarding emails are getting ignored')).toBeTruthy();
    });

    test('filters videos by search query', async () => {
        const { getByPlaceholderText, getByText, queryByText } = await render(
            <LibraryScreen
                onSelectVideo={() => { }}
                onOpenBrandProfile={() => { }}
                onOpenImport={() => { }}
                onOpenCalendar={() => { }}
            />
        );

        const searchInput = getByPlaceholderText('Search hooks, captions, tags');
        await fireEvent.changeText(searchInput, 'morning');

        expect(getByText('Morning routine that changed everything')).toBeTruthy();
        expect(queryByText('Why your onboarding emails are getting ignored')).toBeNull();
    });

    test('shows empty state when no videos match', async () => {
        const { getByPlaceholderText, getByText } = await render(
            <LibraryScreen
                onSelectVideo={() => { }}
                onOpenBrandProfile={() => { }}
                onOpenImport={() => { }}
                onOpenCalendar={() => { }}
            />
        );

        const searchInput = getByPlaceholderText('Search hooks, captions, tags');
        await fireEvent.changeText(searchInput, 'this query matches nothing at all');

        expect(getByText('No videos match your search.')).toBeTruthy();
    });
});