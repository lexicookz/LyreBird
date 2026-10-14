// components/ScheduleSheet.tsx
// "Schedule brief" (Figma: Script-1 / "Content calendar - Schedule Modal").
// Times were dropped by the team, so it's date, stage and status only.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BottomSheet from './BottomSheet';
import MonthGrid from './MonthGrid';
import { Chip, Eyebrow, PrimaryButton } from './ui';
import {
  CALENDAR_STATUSES,
  CalendarItem,
  CalendarStatus,
  MONTHS,
  formatLongDate,
  formatShortDate,
  parseISODate,
  toISODate,
} from '../data/calendar';
import { fonts, radius, Colors, useStyles, useTheme } from '../theme';
import type { FunnelStage } from '../types';

function longDate(iso: string) {
  return formatLongDate(parseISODate(iso));
}

function shortDate(iso: string) {
  return formatShortDate(parseISODate(iso));
}

export default function ScheduleSheet({
  visible,
  hook,
  existing,
  defaultStage,
  suggestedDate,
  onSave,
  onRemove,
  onClose,
  onSeeBrief,
}: {
  visible: boolean;
  hook: string;
  /** The brief's current entry, when it's already on the calendar. */
  existing?: CalendarItem;
  defaultStage: FunnelStage;
  suggestedDate: string;
  /**
   * The sheet chooses a date, a stage and a status -- not which brief, and
   * not the row id, both of which the caller already knows.
   */
  onSave: (values: Omit<CalendarItem, 'briefId' | 'id'>) => void;
  onRemove: () => void;
  onClose: () => void;
  /** Opens the brief itself. Left out when the sheet was opened from the brief. */
  onSeeBrief?: () => void;
}) {
  const { stages } = useTheme();
  const styles = useStyles(makeStyles);
  const [date, setDate] = useState(suggestedDate);
  const [stage, setStage] = useState<FunnelStage>(defaultStage);
  const [status, setStatus] = useState<CalendarStatus>('planned');
  const [pickingDate, setPickingDate] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => parseISODate(suggestedDate));

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    const startDate = existing?.date ?? suggestedDate;
    setDate(startDate);
    setStage(existing?.stage ?? defaultStage);
    setStatus(existing?.status ?? 'planned');
    setPickingDate(false);
    setPickerMonth(parseISODate(startDate));
  }, [visible]);

  function shiftPickerMonth(delta: number) {
    setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + delta, 1));
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.title}>Schedule brief</Text>
            <Text style={styles.hook} numberOfLines={2}>
              “{hook}”
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <View style={[styles.closeBar, { transform: [{ rotate: '45deg' }] }]} />
            <View style={[styles.closeBar, { transform: [{ rotate: '-45deg' }] }]} />
          </Pressable>
        </View>

        {!existing && (
          <Pressable
            onPress={() => setDate(suggestedDate)}
            disabled={date === suggestedDate}
            style={styles.suggestion}
            accessibilityRole="button"
          >
            <View style={styles.suggestionIcon}>
              <Text style={styles.suggestionIconText}>!</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.suggestionTitle}>We suggest {shortDate(suggestedDate)}</Text>
              <Text style={styles.suggestionBody}>
                {date === suggestedDate
                  ? 'The next day with nothing planned. Change anything below.'
                  : 'The next day with nothing planned. Tap to use it.'}
              </Text>
            </View>
          </Pressable>
        )}

        <View style={styles.field}>
          <Eyebrow>Date</Eyebrow>
          <Pressable
            onPress={() => setPickingDate(!pickingDate)}
            style={styles.select}
            accessibilityRole="button"
            accessibilityLabel={`Date, ${longDate(date)}`}
            accessibilityState={{ expanded: pickingDate }}
          >
            <Text style={styles.selectText}>{longDate(date)}</Text>
            <View style={[styles.chevron, pickingDate && { transform: [{ rotate: '-135deg' }], marginTop: 4 }]} />
          </Pressable>
          {pickingDate && (
            <View style={styles.picker}>
              <View style={styles.pickerNav}>
                <Pressable onPress={() => shiftPickerMonth(-1)} hitSlop={10} accessibilityLabel="Previous month" accessibilityRole="button">
                  <Text style={styles.pickerArrow}>‹</Text>
                </Pressable>
                <Text style={styles.pickerMonth}>
                  {MONTHS[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
                </Text>
                <Pressable onPress={() => shiftPickerMonth(1)} hitSlop={10} accessibilityLabel="Next month" accessibilityRole="button">
                  <Text style={styles.pickerArrow}>›</Text>
                </Pressable>
              </View>
              <MonthGrid
                year={pickerMonth.getFullYear()}
                month={pickerMonth.getMonth()}
                todayISO={toISODate(new Date())}
                selectedISO={date}
                onSelect={(iso) => {
                  setDate(iso);
                  setPickingDate(false);
                }}
              />
            </View>
          )}
        </View>

        <View style={styles.field}>
          <Eyebrow>Stage</Eyebrow>
          {/* Read-only: the stage comes from the video's analysis, not the calendar. */}
          <View
            style={[styles.stage, { backgroundColor: stages[stage].color }]}
            accessible
            accessibilityLabel={`Stage, ${stages[stage].label}, set by the video's analysis`}
          >
            <View style={styles.stageDot} />
            <Text style={styles.stageText}>{stages[stage].label}</Text>
            <Text style={styles.stageHint}>From the analysis</Text>
          </View>
        </View>

        <View style={styles.field}>
          <Eyebrow>Status</Eyebrow>
          <View style={styles.statusRow}>
            {CALENDAR_STATUSES.map((s) => (
              <StatusChip
                key={s.key}
                label={s.label}
                selected={status === s.key}
                onPress={() => setStatus(s.key)}
              />
            ))}
          </View>
        </View>

        <PrimaryButton label="Save schedule" onPress={() => onSave({ date, stage, status })} />
        {onSeeBrief && (
          <Pressable
            onPress={onSeeBrief}
            accessibilityRole="button"
            style={({ pressed }) => [styles.seeBrief, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.seeBriefText}>See brief</Text>
          </Pressable>
        )}
        <Pressable onPress={existing ? onRemove : onClose} hitSlop={8} accessibilityRole="button" style={styles.secondary}>
          <Text style={styles.secondaryText}>
            {existing ? 'Remove from calendar' : 'Keep unscheduled instead'}
          </Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

/** Status pill: ink when selected, grey otherwise (the design's status row). */
function StatusChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  if (!selected) return <Chip label={label} onPress={onPress} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: true }}
      style={styles.statusActive}
    >
      <Text style={styles.statusActiveText}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  scroll: {
    maxHeight: 640,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: -1,
    color: colors.ink,
  },
  hook: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBar: {
    position: 'absolute',
    width: 12,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.textStrong,
  },
  suggestion: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'flex-start',
    backgroundColor: colors.green,
    borderRadius: radius.card,
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginBottom: 18,
  },
  suggestionIcon: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.frost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionIconText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    color: colors.onPastel,
  },
  suggestionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.onPastel,
  },
  suggestionBody: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15.5,
    color: colors.onPastelBody,
  },
  field: {
    gap: 7,
    marginBottom: 16,
  },
  select: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: radius.field,
    borderWidth: 0.8,
    borderColor: colors.hairline,
  },
  selectText: {
    fontFamily: fonts.body,
    fontSize: 14.5,
    color: colors.ink,
  },
  chevron: {
    width: 9,
    height: 9,
    marginTop: -4,
    borderRightWidth: 1.6,
    borderBottomWidth: 1.6,
    borderColor: colors.textStrong,
    transform: [{ rotate: '45deg' }],
  },
  picker: {
    gap: 10,
    paddingTop: 6,
  },
  pickerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  pickerArrow: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.ink,
    paddingHorizontal: 8,
  },
  pickerMonth: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.ink,
  },
  stage: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: radius.field,
  },
  stageDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(51,36,28,0.45)',
  },
  stageText: {
    fontFamily: fonts.body,
    fontSize: 14.5,
    color: colors.onPastel,
  },
  stageHint: {
    marginLeft: 'auto',
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.onPastelBody,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  statusActive: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  statusActiveText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.cream,
  },
  seeBrief: {
    height: 50,
    marginTop: 10,
    borderRadius: radius.field,
    borderWidth: 1.2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeBriefText: {
    fontFamily: fonts.heading,
    fontSize: 14.5,
    color: colors.ink,
  },
  secondary: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  secondaryText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.textLabel,
  },
});
