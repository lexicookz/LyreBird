// components/BottomTabBar.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export type TabKey = 'library' | 'search' | 'briefs' | 'calendar';

const TABS: { key: TabKey; label: string }[] = [
    { key: 'library', label: 'Library' },
    { key: 'search', label: 'Search' },
    { key: 'briefs', label: 'Briefs' },
    { key: 'calendar', label: 'Calendar' },
];

export default function BottomTabBar({
    activeTab,
    onChangeTab,
}: {
    activeTab: TabKey;
    onChangeTab: (tab: TabKey) => void;
}) {
    return (
        <View style={styles.container}>
            {TABS.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                    <Pressable
                        key={tab.key}
                        style={styles.tabButton}
                        onPress={() => onChangeTab(tab.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                    >
                        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                            {tab.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#eee',
        backgroundColor: '#fff',
        paddingTop: 8,
        paddingBottom: 24,
    },
    tabButton: {
        flex: 1,
        alignItems: 'center',
    },
    tabLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#999',
    },
    tabLabelActive: {
        color: '#111',
    },
});