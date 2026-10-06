// components/MonthGrid.tsx
// Monday-first month of day tiles (Figma: "Content calendar (monthly)"). Used by
// the Month view and by the date picker inside the schedule sheet.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toISODate } from '../data/calendar';
import { colors, fonts, radius } from '../theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export type DayMark = { color: string };

export default function MonthGrid({
  year,
  month,
  todayISO,
  selectedISO,
  marks,
  onSelect,
}: {
  year: number;
  /** 0-11 */
  month: number;
  todayISO: string;
  selectedISO?: string;
  /** Days that have something planned, keyed by YYYY-MM-DD. */
  marks?: Map<string, DayMark>;
  onSelect: (iso: string) => void;
}) {
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.row}>
          {week.map((day, i) => {
            if (day === null) return <View key={i} style={styles.cellSlot} />;
            const iso = toISODate(new Date(year, month, day));
            const mark = marks?.get(iso);
            const isToday = iso === todayISO;
            const isSelected = iso === selectedISO;
            return (
              <View key={i} style={styles.cellSlot}>
                <Pressable
                  onPress={() => onSelect(iso)}
                  accessibilityRole="button"
                  accessibilityLabel={`${day}${mark ? ', planned' : ''}`}
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.cell,
                    mark && { backgroundColor: mark.color },
                    isSelected && styles.cellSelected,
                  ]}
                >
                  <View style={[styles.dayNumber, isToday && styles.today]}>
                    <Text style={[styles.dayText, isToday && styles.todayText]}>{day}</Text>
                  </View>
                  {mark && <View style={styles.marker} />}
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 5,
  },
  row: {
    flexDirection: 'row',
    gap: 5,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: colors.textFaint,
    marginBottom: 2,
  },
  cellSlot: {
    flex: 1,
    aspectRatio: 1,
  },
  cell: {
    flex: 1,
    borderRadius: radius.card,
    backgroundColor: colors.field,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  cellSelected: {
    borderWidth: 1.6,
    borderColor: colors.ink,
  },
  dayNumber: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  today: {
    backgroundColor: colors.ink,
  },
  dayText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.ink,
  },
  todayText: {
    color: colors.cream,
  },
  marker: {
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(51,36,28,0.3)',
  },
});
