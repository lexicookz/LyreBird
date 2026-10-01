// screens/CalendarScreen.tsx
// npx.cmd expo start --tunnel
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mockBriefs, mockCalendarEntries, mockClips } from '../data/mockVideos';
import { Brief, CalendarEntry } from '../types';


function formatDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


const CALENDAR_YEAR = 2026;

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar',
  'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep',
  'Oct', 'Nov', 'Dec',
];

const STATUS_LEGEND: Array<{
  label: string;
  status: Brief['status'];
}> = [
  { label: 'Draft', status: 'draft' },
  { label: 'Edited', status: 'edited' },
  { label: 'Scheduled', status: 'scheduled' },
  { label: 'Published', status: 'published' },
  { label: 'Archived', status: 'archived' },
];

function getStatusColor(status?: Brief['status']) {
  switch (status) {
    case 'scheduled':
      return '#dcefc5';
    case 'published':
      return '#dcd4f3';
    case 'edited':
      return '#f5d5df';
    case 'archived':
      return '#cccccc';
    case 'draft':
      return '#d8e8f2';
    default:
      return '#eeeeec';
  }
}


function BriefRow({ brief }: { brief: Brief }) {
  const clip = mockClips.find((c) => c.id === brief.clip_id);

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowHook} numberOfLines={1}>
          {brief.hook}
        </Text>

        <Text style={styles.statusBadge}>
          {brief.status.charAt(0).toUpperCase() + brief.status.slice(1)}
        </Text>
      </View>

      {clip && (
        <Text style={styles.rowSource} numberOfLines={1}>
          From: {clip.title}
        </Text>
      )}
    </View>
  );
}

export default function CalendarScreen({ onBack }: { onBack: () => void }) {
  const [activeView, setActiveView] =
    useState<'calendar' | 'list'>('list');

  const [calendarRange, setCalendarRange] =
    useState<'week' | 'month' | 'year'>('year');

  const [selectedMonth, setSelectedMonth] = useState(8);


  // const scheduledIds = new Set(calendarEntries.map((e) => e.brief_id));
  // const unscheduled = mockBriefs.filter((b) => !scheduledIds.has(b.id));

  const grouped: Record<string, Brief[]> = {};
  const [weekOffset, setWeekOffset] = useState(0);

  const initialWeekStart = new Date(CALENDAR_YEAR, 7, 30);
  const weekStart = new Date(initialWeekStart);

  weekStart.setDate(initialWeekStart.getDate() + weekOffset * 7);

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });

  const weekEnd = weekDays[6];

  const [calendarEntries, setCalendarEntries] =
  useState<CalendarEntry[]>(mockCalendarEntries);

  calendarEntries.forEach((entry) => {
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

      <View style={styles.viewToggle}>
        <Pressable
          style={[
            styles.toggleButton,
            activeView === 'calendar' && styles.toggleButtonActive,
          ]}
          onPress={() => setActiveView('calendar')}
          accessibilityRole="button"
          accessibilityState={{ selected: activeView === 'calendar' }}
        >
          <Text
            style={[
              styles.toggleText,
              activeView === 'calendar' && styles.toggleTextActive,
            ]}
          >
            Calendar
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.toggleButton,
            activeView === 'list' && styles.toggleButtonActive,
          ]}
          onPress={() => setActiveView('list')}
          accessibilityRole="button"
          accessibilityState={{ selected: activeView === 'list' }}
        >
          <Text
            style={[
              styles.toggleText,
              activeView === 'list' && styles.toggleTextActive,
            ]}
          >
            List
          </Text>
        </Pressable>
      </View>

      {activeView === 'calendar' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>

          <View style={styles.rangeToggle}>
            {(['week', 'month', 'year'] as const).map((range) => (
              <Pressable
                key={range}
                style={[
                  styles.rangeButton,
                  calendarRange === range && styles.rangeButtonActive,
                ]}
                onPress={() => setCalendarRange(range)}
                accessibilityRole="button"
                accessibilityState={{ selected: calendarRange === range }}
              >
                <Text
                  style={[
                    styles.rangeText,
                    calendarRange === range && styles.rangeTextActive,
                  ]}
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.statusLegend}>
            {STATUS_LEGEND.map((item) => (
              <View key={item.status} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendColour,
                    { backgroundColor: getStatusColor(item.status) },
                  ]}
                />

                <Text style={styles.legendText}>{item.label}</Text>
              </View>
            ))}
          </View>

          {calendarRange === 'week' && (
            <View>
              <View style={styles.weekHeader}>
                <Pressable
                  onPress={() => setWeekOffset((current) => current - 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Previous week"
                >
                  <Text style={styles.monthArrow}>‹</Text>
                </Pressable>

                <Text style={styles.weekTitle}>
                  {weekStart.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                  {' – '}
                  {weekEnd.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>

                <Pressable
                  onPress={() => setWeekOffset((current) => current + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Next week"
                >
                  <Text style={styles.monthArrow}>›</Text>
                </Pressable>
              </View>

              <View style={styles.weekGrid}>
                {weekDays.map((date) => {
                  const isoDate = toIsoDate(date);

                  const entry = calendarEntries.find(
                    (item) => item.scheduled_for === isoDate
                  );

                  const brief = entry
                    ? mockBriefs.find((item) => item.id === entry.brief_id)
                    : undefined;

                  return (
                    <View
                      key={isoDate}
                      style={[
                        styles.weekDay,
                        brief && {
                          backgroundColor: getStatusColor(brief.status),
                        },
                      ]}
                    >
                      <Text style={styles.weekdayText}>
                        {date.toLocaleDateString(undefined, { weekday: 'short' })}
                      </Text>

                      <Text style={styles.weekDateText}>{date.getDate()}</Text>
                    </View>
                  );
                })}
              </View>

              {weekDays.flatMap((date) => {
                const isoDate = toIsoDate(date);

                return calendarEntries
                  .filter((entry) => entry.scheduled_for === isoDate)
                  .map((entry) => {
                    const brief = mockBriefs.find(
                      (item) => item.id === entry.brief_id
                    );

                    return brief ? (
                      <View key={entry.id} style={styles.weekBrief}>
                        <Text style={styles.dateLabel}>{formatDate(isoDate)}</Text>
                        <BriefRow brief={brief} />
                      </View>
                    ) : null;
                  });
              })}
            </View>
          )}

          {calendarRange === 'month' && (
            <View>
              <View style={styles.monthHeader}>
                <Pressable
                  onPress={() =>
                    setSelectedMonth((current) => (current === 0 ? 11 : current - 1))
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                >
                  <Text style={styles.monthArrow}>‹</Text>
                </Pressable>

                <Text style={styles.monthTitle}>
                  {MONTH_NAMES[selectedMonth]} {CALENDAR_YEAR}
                </Text>

                <Pressable
                  onPress={() =>
                    setSelectedMonth((current) => (current === 11 ? 0 : current + 1))
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                >
                  <Text style={styles.monthArrow}>›</Text>
                </Pressable>
              </View>

              <View style={styles.weekdayRow}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                  <Text key={`${day}-${index}`} style={styles.weekdayLabel}>
                    {day}
                  </Text>
                ))}
              </View>

              <View style={styles.monthDaysGrid}>
                {[
                  ...Array(
                    new Date(CALENDAR_YEAR, selectedMonth, 1).getDay()
                  ).fill(null),

                  ...Array.from(
                    {
                      length: new Date(
                        CALENDAR_YEAR,
                        selectedMonth + 1,
                        0
                      ).getDate(),
                    },
                    (_, index) => index + 1
                  ),
                ].map((day, index) => {
                  if (day === null) {
                    return <View key={`blank-${index}`} style={styles.monthDayCell} />;
                  }

                  const date = `${CALENDAR_YEAR}-${String(selectedMonth + 1).padStart(
                    2,
                    '0'
                  )}-${String(day).padStart(2, '0')}`;

                  const entry = calendarEntries.find(
                    (item) => item.scheduled_for === date
                  );

                  const brief = entry
                    ? mockBriefs.find((item) => item.id === entry.brief_id)
                    : undefined;

                  return (
                    <View
                      key={date}
                      style={[
                        styles.monthDayCell,
                        brief && {
                          backgroundColor: getStatusColor(brief.status),
                        },
                      ]}
                      accessibilityLabel={`${date}${brief ? `, ${brief.status}` : ''}`}
                    >
                      <Text style={styles.monthDayText}>{day}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {calendarRange === 'year' && (
            <>
              <Text style={styles.yearTitle}>{CALENDAR_YEAR}</Text>

              <View style={styles.yearGrid}>
                {MONTH_NAMES.map((monthName, monthIndex) => {
              const numberOfDays = new Date(
                CALENDAR_YEAR,
                monthIndex + 1,
                0
              ).getDate();

              const firstWeekday = new Date(
                CALENDAR_YEAR,
                monthIndex,
                1
              ).getDay();

              const cells: Array<number | null> = [
                ...Array(firstWeekday).fill(null),
                ...Array.from({ length: numberOfDays }, (_, index) => index + 1),
              ];

              return (
                <View key={monthName} style={styles.monthCard}>
                  <Text style={styles.monthName}>{monthName}</Text>

                  <View style={styles.daysGrid}>
                    {cells.map((day, cellIndex) => {
                      if (day === null) {
                        return <View key={`empty-${cellIndex}`} style={styles.emptyDay} />;
                      }

                      const date = `${CALENDAR_YEAR}-${String(monthIndex + 1).padStart(
                        2,
                        '0'
                      )}-${String(day).padStart(2, '0')}`;

                      const entry = calendarEntries.find(
                        (calendarEntry) => calendarEntry.scheduled_for === date
                      );

                      const brief = entry
                        ? mockBriefs.find((item) => item.id === entry.brief_id)
                        : undefined;

                      return (
                        <View
                          key={date}
                          style={[
                            styles.calendarDay,
                            { backgroundColor: getStatusColor(brief?.status) },
                          ]}
                          accessibilityLabel={`${date}${brief ? `, ${brief.status}` : ''}`}
                        />
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
  </>
)}


        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.viewHeading}>Your Content Schedule</Text>

          {Object.entries(grouped).map(([date, briefs]) => (
            <View key={date} style={styles.dateGroup}>
              <Text style={styles.dateLabel}>{date}</Text>

              {briefs.map((brief) => (
                <BriefRow key={brief.id} brief={brief} />
              ))}
            </View>
          ))}

          {/* {unscheduled.length > 0 && (
            <View style={styles.dateGroup}>
              <Text style={styles.dateLabel}>Not yet scheduled</Text>

              {unscheduled.map((brief) => (
                <BriefRow key={brief.id} brief={brief} />
              ))}
            </View>
          )} */}
        </ScrollView>
      )}
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
  flex: 1,
  minWidth: 0,
  fontSize: 15,
  fontWeight: '600',
  color: '#222',
  marginBottom: 2,
},
  rowSource: {
    fontSize: 12,
    color: '#888',
  },
  rowHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},
statusBadge: {
  flexShrink: 0,
  fontSize: 11,
  fontWeight: '600',
  color: '#555',
  backgroundColor: '#e5e5e5',
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 12,
  overflow: 'hidden',
},
viewToggle: {
  flexDirection: 'row',
  backgroundColor: '#e5e5e5',
  borderRadius: 10,
  marginHorizontal: 16,
  marginBottom: 20,
  padding: 3,
},
toggleButton: {
  flex: 1,
  alignItems: 'center',
  paddingVertical: 8,
  borderRadius: 8,
},
toggleButtonActive: {
  backgroundColor: '#3b1f12',
},
toggleText: {
  fontSize: 13,
  fontWeight: '600',
  color: '#555',
},
toggleTextActive: {
  color: '#fff',
},
viewHeading: {
  fontSize: 22,
  fontWeight: '700',
  color: '#222',
  marginBottom: 20,
},
rangeToggle: {
  alignSelf: 'flex-start',
  flexDirection: 'row',
  backgroundColor: '#f2f0ef',
  borderRadius: 18,
  padding: 3,
  marginBottom: 12,
},
rangeButton: {
  paddingHorizontal: 14,
  paddingVertical: 7,
  borderRadius: 15,
},
rangeButtonActive: {
  backgroundColor: '#3b2419',
},
rangeText: {
  fontSize: 12,
  fontWeight: '600',
  color: '#675f5b',
},
rangeTextActive: {
  color: '#fff',
},
yearTitle: {
  fontSize: 32,
  fontWeight: '800',
  color: '#30241f',
  marginBottom: 16,
},
yearGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
},
monthCard: {
  width: '31%',
  backgroundColor: '#fff',
  borderRadius: 10,
  padding: 8,
  marginBottom: 12,
},
monthName: {
  fontSize: 14,
  fontWeight: '700',
  color: '#392b25',
  marginBottom: 8,
},
daysGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 3,
},
calendarDay: {
  width: 9,
  height: 9,
  borderRadius: 2,
},
emptyDay: {
  width: 9,
  height: 9,
},
monthHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 20,
},
monthTitle: {
  fontSize: 24,
  fontWeight: '800',
  color: '#30241f',
},
monthArrow: {
  fontSize: 36,
  color: '#3b2419',
  paddingHorizontal: 12,
},
weekdayRow: {
  flexDirection: 'row',
  marginBottom: 8,
},
weekdayLabel: {
  width: '14.285%',
  textAlign: 'center',
  fontSize: 12,
  fontWeight: '700',
  color: '#888',
},
monthDaysGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
},
monthDayCell: {
  width: '14.285%',
  aspectRatio: 1,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
},
monthDayText: {
  fontSize: 14,
  fontWeight: '600',
  color: '#30241f',
},
weekHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 18,
},
weekTitle: {
  fontSize: 18,
  fontWeight: '800',
  color: '#30241f',
},
weekGrid: {
  flexDirection: 'row',
  gap: 5,
  marginBottom: 24,
},
weekDay: {
  flex: 1,
  alignItems: 'center',
  paddingVertical: 10,
  borderRadius: 10,
  backgroundColor: '#f2f2f0',
},
weekdayText: {
  fontSize: 10,
  fontWeight: '600',
  color: '#888',
  marginBottom: 5,
},
weekDateText: {
  fontSize: 15,
  fontWeight: '700',
  color: '#30241f',
},
weekBrief: {
  marginBottom: 16,
},
statusLegend: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 10,
  marginBottom: 20,
},
legendItem: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
},
legendColour: {
  width: 10,
  height: 10,
  borderRadius: 3,
},
legendText: {
  fontSize: 11,
  color: '#666',
},
});