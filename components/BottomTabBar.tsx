// components/BottomTabBar.tsx
// Floating dark pill with a raised "+" in the middle (Figma: "Menu nav", 35:709).
// It sits on top of the screen content, so App.tsx reserves TAB_BAR_SPACE below
// the content to keep the last row of each screen visible.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

export type TabKey = 'library' | 'search' | 'briefs' | 'calendar';

const BAR_HEIGHT = 60;
const FAB_SIZE = 60;
const FAB_RISE = 22; // how far the "+" sits above the bar's top edge

/** Bottom gap between the bar and the screen edge, given the safe-area inset. */
function barOffset(bottomInset: number) {
  return Math.max(bottomInset - 6, 12);
}

/** Space a screen needs at its bottom so nothing hides under the bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + barOffset(insets.bottom) + 12;
}

const ACTIVE = colors.cream;
const INACTIVE = 'rgba(251,247,244,0.45)';

// ---------- icons (drawn with Views, matching the Figma shapes) ----------

function LibraryIcon({ color }: { color: string }) {
  return (
    <View style={icon.box}>
      <View style={icon.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[icon.gridCell, { backgroundColor: color }]} />
        ))}
      </View>
    </View>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <View style={icon.box}>
      <View style={[icon.searchRing, { borderColor: color }]} />
      <View style={[icon.searchHandle, { backgroundColor: color }]} />
    </View>
  );
}

function BriefsIcon({ color }: { color: string }) {
  return (
    <View style={icon.box}>
      <View style={[icon.doc, { borderColor: color }]}>
        <View style={[icon.docLine, { backgroundColor: color }]} />
        <View style={[icon.docLine, { backgroundColor: color, width: 3 }]} />
      </View>
    </View>
  );
}

function CalendarIcon({ color }: { color: string }) {
  return (
    <View style={icon.box}>
      <View style={[icon.calendar, { borderColor: color }]}>
        <View style={[icon.calendarTop, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const TABS: {
  key: TabKey;
  label: string;
  Icon: React.ComponentType<{ color: string }>;
}[] = [
  { key: 'library', label: 'Library', Icon: LibraryIcon },
  { key: 'search', label: 'Search', Icon: SearchIcon },
  { key: 'briefs', label: 'Briefs', Icon: BriefsIcon },
  { key: 'calendar', label: 'Calendar', Icon: CalendarIcon },
];

export default function BottomTabBar({
  activeTab,
  onChangeTab,
  onPressAdd,
}: {
  activeTab: TabKey;
  onChangeTab: (tab: TabKey) => void;
  onPressAdd: () => void;
}) {
  const insets = useSafeAreaInsets();

  function renderTab(tab: (typeof TABS)[number]) {
    const isActive = tab.key === activeTab;
    const color = isActive ? ACTIVE : INACTIVE;
    return (
      <Pressable
        key={tab.key}
        style={styles.tab}
        onPress={() => onChangeTab(tab.key)}
        accessibilityRole="button"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: isActive }}
        hitSlop={6}
      >
        <tab.Icon color={color} />
        <Text style={[styles.label, { color }]}>{tab.label}</Text>
      </Pressable>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: barOffset(insets.bottom) }]}
    >
      <View style={styles.bar}>
        {renderTab(TABS[0])}
        {renderTab(TABS[1])}
        <View style={styles.fabSlot}>
          <Pressable
            style={styles.fab}
            onPress={onPressAdd}
            accessibilityRole="button"
            accessibilityLabel="Add videos"
          >
            <View style={styles.plusH} />
            <View style={styles.plusV} />
          </Pressable>
        </View>
        {renderTab(TABS[2])}
        {renderTab(TABS[3])}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 13,
    right: 13,
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: 999,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 9,
    elevation: 10,
  },
  tab: {
    width: 52,
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
  },
  fabSlot: {
    width: FAB_SIZE,
    height: FAB_SIZE,
  },
  fab: {
    position: 'absolute',
    top: -FAB_RISE,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 999,
    backgroundColor: colors.peach,
    borderWidth: 4,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 12,
  },
  plusH: {
    position: 'absolute',
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  plusV: {
    position: 'absolute',
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
});

const icon = StyleSheet.create({
  box: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    width: 17,
    height: 17,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  gridCell: {
    width: 7,
    height: 7,
    borderRadius: 2,
  },
  searchRing: {
    position: 'absolute',
    left: 1,
    top: 1,
    width: 15,
    height: 15,
    borderRadius: 999,
    borderWidth: 1.6,
  },
  searchHandle: {
    position: 'absolute',
    left: 11.5,
    top: 14.7,
    width: 7,
    height: 2,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  doc: {
    width: 15,
    height: 18,
    borderRadius: 3,
    borderWidth: 1.6,
    paddingHorizontal: 3,
    justifyContent: 'center',
    gap: 3,
  },
  docLine: {
    height: 2,
    width: '100%',
    borderRadius: 2,
  },
  calendar: {
    width: 18,
    height: 17,
    borderRadius: 3,
    borderWidth: 1.6,
    overflow: 'hidden',
  },
  calendarTop: {
    height: 4,
    width: '100%',
  },
});
