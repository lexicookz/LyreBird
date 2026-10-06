// screens/BriefsScreen.tsx
// Figma: "Brief" (121:745). Briefs grouped by where they are on the calendar:
// Unscheduled (no entry), Planned (entry not yet posted), Posted.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarItem, formatShortDate, parseISODate } from '../data/calendar';
import { shotsOf } from '../data/briefs';
import { colors, fonts, funnelStages, pagePadding, radius } from '../theme';
import type { Brief, FunnelStage } from '../types';

type Tab = 'unscheduled' | 'planned' | 'posted';

const TABS: { key: Tab; label: string }[] = [
  { key: 'unscheduled', label: 'Unscheduled' },
  { key: 'planned', label: 'Planned' },
  { key: 'posted', label: 'Posted' },
];

const EMPTY_TAB: Record<Tab, string> = {
  unscheduled: 'Every brief has a date. Nice.',
  planned: 'Nothing planned yet. Schedule a brief to see it here.',
  posted: 'Nothing posted yet.',
};

function tabOf(item: CalendarItem | undefined): Tab {
  if (!item) return 'unscheduled';
  return item.status === 'posted' ? 'posted' : 'planned';
}

export default function BriefsScreen({
  briefs,
  calendarItems,
  stageOf,
  brandName,
  onSelectBrief,
  onSchedule,
  onOpenBrandProfile,
}: {
  briefs: Brief[];
  calendarItems: CalendarItem[];
  stageOf: (brief: Brief) => FunnelStage;
  brandName?: string;
  onSelectBrief: (brief: Brief) => void;
  onSchedule: (briefId: string) => void;
  onOpenBrandProfile: () => void;
}) {
  const [tab, setTab] = useState<Tab>('unscheduled');
  const entryFor = (brief: Brief) => calendarItems.find((i) => i.briefId === brief.id);
  const visible = briefs.filter((b) => tabOf(entryFor(b)) === tab);
  const undated = briefs.filter((b) => !entryFor(b)).length;
  const brandInitial = (brandName?.trim()[0] ?? '').toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>BRIEFS</Text>
          <Pressable
            onPress={onOpenBrandProfile}
            style={styles.avatar}
            accessibilityRole="button"
            accessibilityLabel="Brand profile"
          >
            {!!brandInitial && <Text style={styles.avatarText}>{brandInitial}</Text>}
          </Pressable>
        </View>

        {briefs.length === 0 ? (
          <>
            <Text style={styles.title}>No briefs yet</Text>
            <Text style={styles.body}>
              Open an analysed video in your library and tap Adapt for my brand. Your first brief
              lands here.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>
              {`${briefs.length} brief${briefs.length === 1 ? '' : 's'},\n${undated} not dated`}
            </Text>

            <View style={styles.tabs}>
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.tab, active && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {visible.length === 0 ? (
              <Text style={styles.body}>{EMPTY_TAB[tab]}</Text>
            ) : (
              <View style={styles.list}>
                {visible.map((brief) => {
                  const stage = stageOf(brief);
                  const entry = entryFor(brief);
                  const shots = shotsOf(brief).length;
                  const meta = [
                    funnelStages[stage].label,
                    shots ? `${shots} shot${shots === 1 ? '' : 's'}` : 'shot list not written',
                    entry ? formatShortDate(parseISODate(entry.date)) : shots ? 'no date' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <Pressable
                      key={brief.id}
                      onPress={() => onSelectBrief(brief)}
                      accessibilityRole="button"
                      style={[styles.card, { backgroundColor: funnelStages[stage].color }]}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={styles.hook}>“{brief.hook ?? 'Untitled brief'}”</Text>
                        <Text style={styles.meta}>{meta}</Text>
                      </View>
                      {tab !== 'posted' && (
                        <Pressable
                          onPress={() => onSchedule(brief.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`${entry ? 'Reschedule' : 'Schedule'} ${brief.hook ?? 'brief'}`}
                          style={styles.pill}
                          hitSlop={6}
                        >
                          <Text style={styles.pillText}>{entry ? 'Reschedule' : 'Schedule'}</Text>
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {tab === 'unscheduled' && (
              <View style={styles.note}>
                <Text style={styles.noteText}>
                  A brief never disappears because you skipped the date. It waits here until you
                  want it.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scroll: {
    paddingHorizontal: pagePadding,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 1.54,
    color: colors.textLabel,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    color: colors.ink,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 31,
    letterSpacing: -1.2,
    color: colors.ink,
    paddingTop: 2,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textMuted,
  },
  tabs: {
    flexDirection: 'row',
    gap: 7,
  },
  tab: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
  },
  tabActive: {
    backgroundColor: colors.ink,
  },
  tabText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textStrong,
  },
  tabTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.white,
  },
  list: {
    gap: 9,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: radius.card,
  },
  hook: {
    fontFamily: fonts.heading,
    fontSize: 14.5,
    lineHeight: 18.5,
    letterSpacing: -0.2,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textBody,
  },
  pill: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.frost,
  },
  pillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    color: colors.ink,
  },
  note: {
    backgroundColor: colors.field,
    borderRadius: radius.card,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  noteText: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    lineHeight: 16.7,
    color: colors.textBody,
  },
});
