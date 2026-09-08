// screens/CalendarScreen.tsx
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { mockBriefs, mockCalendarEntries, mockClips } from '../data/mockVideos';
import { Brief } from '../types';

function formatDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function BriefRow({ brief }: { brief: Brief }) {
  const clip = mockClips.find((c) => c.id === brief.clip_id);
  return (
    <View style={styles.row}>
      <Text style={styles.rowHook} numberOfLines={1}>{brief.hook}</Text>
      {clip && (
        <Text style={styles.rowSource} numberOfLines={1}>
          From: {clip.title}
        </Text>
      )}
    </View>
  );
}

export default function CalendarScreen({ onBack }: { onBack: () => void }) {
  const scheduledIds = new Set(mockCalendarEntries.map((e) => e.brief_id));
  const unscheduled = mockBriefs.filter((b) => !scheduledIds.has(b.id));

  const grouped: Record<string, Brief[]> = {};
  mockCalendarEntries.forEach((entry) => {
    const brief = mockBriefs.find((b) => b.id === entry.brief_id);
    if (!brief) return;
    const key = formatDate(entry.scheduled_for);
    (grouped[key] ??= []).push(brief);
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Calendar</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {Object.keys(grouped).length === 0 && (
          <Text style={styles.emptyText}>No briefs scheduled yet.</Text>
        )}

        {Object.entries(grouped).map(([date, briefs]) => (
          <View key={date} style={styles.dateGroup}>
            <Text style={styles.dateLabel}>{date}</Text>
            {briefs.map((brief) => (
              <BriefRow key={brief.id} brief={brief} />
            ))}
          </View>
        ))}

        {unscheduled.length > 0 && (
          <View style={styles.dateGroup}>
            <Text style={styles.dateLabel}>Not yet scheduled</Text>
            {unscheduled.map((brief) => (
              <BriefRow key={brief.id} brief={brief} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    marginTop: 20,
  },
  dateGroup: {
    marginBottom: 24,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  rowHook: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    marginBottom: 2,
  },
  rowSource: {
    fontSize: 12,
    color: '#888',
  },
});