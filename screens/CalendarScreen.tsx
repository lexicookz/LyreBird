// screens/CalendarScreen.tsx
// Figma: "Content calendar (weekly / monthly / yearly)". The date on an entry is
// the day the content should be posted. Data comes from data/calendar.ts.
import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MonthGrid, { DayMark } from '../components/MonthGrid';
import { BrandMark, Eyebrow } from '../components/ui';
import {
  CALENDAR_STATUSES,
  CalendarItem,
  MONTHS,
  addDays,
  formatDayLabel,
  parseISODate,
  startOfWeek,
  toISODate,
} from '../data/calendar';
import { shotsOf } from '../data/briefs';
import { fonts, FUNNEL_ORDER, pagePadding, radius, Colors, useStyles, useTheme } from '../theme';
import type { Brief, Clip, FunnelStage } from '../types';

type Range = 'week' | 'month' | 'year';

const STAGE_MASCOTS: Record<FunnelStage, ImageSourcePropType> = {
  TOFU: require('../assets/mascots/aware.png'),
  MOFU: require('../assets/mascots/consider.png'),
  BOFU: require('../assets/mascots/convert.png'),
};

const NUMBER_WORDS = ['Nothing', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function numberWord(n: number) {
  return NUMBER_WORDS[n] ?? String(n);
}

function statusLabel(item: CalendarItem) {
  return CALENDAR_STATUSES.find((s) => s.key === item.status)?.label ?? item.status;
}

function dayLabel(iso: string) {
  return formatDayLabel(parseISODate(iso));
}

/** "4 shots · 0:28 · caption ready", or "Shot list not written". */
function briefMeta(brief: Brief, clip: Clip | undefined) {
  const shots = shotsOf(brief).length;
  if (shots === 0) return 'Shot list not written';
  const seconds = clip?.duration_seconds;
  return [
    `${shots} shot${shots === 1 ? '' : 's'}`,
    seconds ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}` : null,
    brief.caption ? 'caption ready' : 'needs caption',
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---------- pieces ----------

function EntryCard({
  item,
  brief,
  clip,
  onPress,
}: {
  item: CalendarItem;
  brief: Brief;
  clip: Clip | undefined;
  onPress: () => void;
}) {
  const { stages } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.entry, { backgroundColor: stages[item.stage].color }]}
    >
      <Image
        source={STAGE_MASCOTS[item.stage]}
        style={[styles.entryMascot, item.stage === 'MOFU' && { transform: [{ scaleX: -1 }] }]}
        accessibilityIgnoresInvertColors
        resizeMode="contain"
      />
      <View style={styles.entryTop}>
        <Text style={styles.entryDate}>{dayLabel(item.date)}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{statusLabel(item)}</Text>
        </View>
      </View>
      <Text style={styles.entryHook}>“{brief.hook}”</Text>
      <Text style={styles.entryMeta}>{briefMeta(brief, clip)}</Text>
    </Pressable>
  );
}

function MiniMonth({
  year,
  month,
  marks,
  count,
  onPress,
}: {
  year: number;
  month: number;
  marks: Map<string, DayMark>;
  count: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: days }, (_, i) => toISODate(new Date(year, month, i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const name = MONTHS[month].slice(0, 3);

  return (
    <Pressable
      onPress={onPress}
      style={styles.mini}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${count} planned`}
    >
      <View style={styles.miniHeader}>
        <Text style={styles.miniName}>{name}</Text>
        <Text style={styles.miniCount}>{count}</Text>
      </View>
      <View style={styles.miniGrid}>
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <View key={w} style={styles.miniRow}>
            {cells.slice(w * 7, w * 7 + 7).map((iso, i) => (
              <View
                key={i}
                style={[
                  styles.miniCell,
                  iso ? { backgroundColor: marks.get(iso)?.color ?? colors.track } : null,
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </Pressable>
  );
}

// ---------- screen ----------

export default function CalendarScreen({
  items,
  briefs,
  clipFor,
  brandName,
  brandColor,
  onOpenBrandProfile,
  onEditEntry,
}: {
  items: CalendarItem[];
  briefs: Brief[];
  /** For each entry's video length. */
  clipFor: (clipId: string) => Clip | undefined;
  brandName?: string;
  brandColor?: string;
  onOpenBrandProfile: () => void;
  /** Opens the schedule sheet for an entry's brief. */
  onEditEntry: (briefId: string) => void;
}) {
  const { colors, stages } = useTheme();
  const styles = useStyles(makeStyles);
  const today = new Date();
  const todayISO = toISODate(today);
  const [range, setRange] = useState<Range>('week');
  /** The day the visible week / month / year is built around. */
  const [anchor, setAnchor] = useState(today);
  const [selectedISO, setSelectedISO] = useState(todayISO);

  const briefsById = useMemo(() => new Map(briefs.map((b) => [b.id, b])), [briefs]);
  const entries = useMemo(
    () =>
      items
        .filter((i) => briefsById.has(i.briefId))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [items, briefsById]
  );
  const marks = useMemo(
    () => new Map(entries.map((e) => [e.date, { color: stages[e.stage].color }])),
    [entries]
  );

  function shift(delta: number) {
    if (range === 'week') setAnchor(addDays(anchor, delta * 7));
    if (range === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
    if (range === 'year') setAnchor(new Date(anchor.getFullYear() + delta, anchor.getMonth(), 1));
  }

  function card(item: CalendarItem) {
    return (
      <EntryCard
        key={item.briefId}
        item={item}
        brief={briefsById.get(item.briefId)!}
        clip={clipFor(briefsById.get(item.briefId)!.clip_id)}
        onPress={() => onEditEntry(item.briefId)}
      />
    );
  }

  // ----- week -----
  function renderWeek() {
    const monday = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const isoDays = days.map(toISODate);
    const weekEntries = entries.filter((e) => isoDays.includes(e.date));
    const toFilm = weekEntries.filter((e) => e.status !== 'posted').length;
    const weeksAway = Math.round((monday.getTime() - startOfWeek(today).getTime()) / (7 * 86_400_000));
    const when =
      weeksAway === 0
        ? 'this week'
        : weeksAway === 1
          ? 'next week'
          : weeksAway === -1
            ? 'last week'
            : `w/c ${monday.getDate()} ${MONTHS[monday.getMonth()].slice(0, 3)}`;

    return (
      <>
        <Text style={styles.title}>
          {numberWord(toFilm)} to film{'\n'}
          {when}
        </Text>
        <View style={styles.strip}>
          {days.map((d, i) => {
            const iso = isoDays[i];
            const mark = marks.get(iso);
            const isToday = iso === todayISO;
            return (
              <View key={iso} style={styles.stripDay}>
                <Text style={styles.stripWeekday}>{'MTWTFSS'[i]}</Text>
                <View
                  style={[
                    styles.stripTile,
                    mark && { backgroundColor: mark.color },
                    isToday && { backgroundColor: colors.ink },
                  ]}
                >
                  <Text
                    style={[
                      styles.stripNumber,
                      mark && styles.stripNumberMarked,
                      isToday && { color: colors.cream, fontFamily: fonts.heading },
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        {weekEntries.length === 0 ? (
          <Text style={styles.empty}>
            Nothing planned {when}. Open a brief and tap Schedule to plan it here.
          </Text>
        ) : (
          <View style={styles.list}>{weekEntries.map(card)}</View>
        )}
      </>
    );
  }

  // ----- month -----
  function renderMonth() {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthCount = entries.filter((e) => e.date.startsWith(prefix)).length;
    const dayEntries = entries.filter((e) => e.date === selectedISO);

    return (
      <>
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {MONTHS[anchor.getMonth()]}
          </Text>
          <Text style={styles.titleMeta}>{monthCount} planned</Text>
        </View>
        <MonthGrid
          year={year}
          month={month}
          todayISO={todayISO}
          selectedISO={selectedISO}
          marks={marks}
          onSelect={setSelectedISO}
        />
        <View style={styles.list}>
          <Eyebrow>{dayLabel(selectedISO)}</Eyebrow>
          {dayEntries.length === 0 ? (
            <Text style={styles.emptyLeft}>Nothing planned for this day.</Text>
          ) : (
            dayEntries.map(card)
          )}
        </View>
      </>
    );
  }

  // ----- year -----
  function renderYear() {
    const year = anchor.getFullYear();
    const yearEntries = entries.filter((e) => e.date.startsWith(`${year}-`));
    const filmed = yearEntries.filter((e) => e.status === 'filmed' || e.status === 'posted');
    const planned = yearEntries.length - filmed.length;

    const perMonth = Array.from({ length: 12 }, (_, m) =>
      yearEntries.filter((e) => parseISODate(e.date).getMonth() === m)
    );
    const filmedPerMonth = perMonth.map((list) =>
      list.filter((e) => e.status === 'filmed' || e.status === 'posted')
    );
    const best = filmedPerMonth.reduce(
      (bestIdx, list, i) => (list.length > filmedPerMonth[bestIdx].length ? i : bestIdx),
      0
    );
    const bestList = filmedPerMonth[best];
    const bestStage = FUNNEL_ORDER.map((s) => ({
      stage: s,
      n: bestList.filter((e) => e.stage === s).length,
    })).sort((a, b) => b.n - a.n)[0];

    return (
      <>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{year}</Text>
          <Text style={styles.titleMeta}>
            {filmed.length} filmed · {planned} planned
          </Text>
        </View>
        <View style={styles.legend}>
          {FUNNEL_ORDER.map((s) => (
            <View key={s} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: stages[s].color }]} />
              <Text style={styles.legendText}>{stages[s].label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.yearGrid}>
          {perMonth.map((list, m) => (
            <MiniMonth
              key={m}
              year={year}
              month={m}
              marks={marks}
              count={list.length}
              onPress={() => {
                setAnchor(new Date(year, m, 1));
                setRange('month');
              }}
            />
          ))}
        </View>
        {bestList.length > 0 && (
          <View style={styles.best}>
            <Text style={styles.bestTitle}>
              {MONTHS[best]} was your best month
            </Text>
            <Text style={styles.bestBody}>
              {numberWord(bestList.length)} filmed
              {bestStage.n > 0
                ? `, ${bestStage.n === bestList.length ? 'all' : numberWord(bestStage.n).toLowerCase()} of them ${stages[bestStage.stage].label.toLowerCase()}`
                : ''}
              .
            </Text>
          </View>
        )}
      </>
    );
  }


  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <View style={styles.segment}>
            {(['week', 'month', 'year'] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                accessibilityRole="button"
                accessibilityState={{ selected: range === r }}
                style={[styles.segmentItem, range === r && styles.segmentItemActive]}
              >
                <Text style={[styles.segmentText, range === r && styles.segmentTextActive]}>
                  {r[0].toUpperCase() + r.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.navRow}>
            <Pressable onPress={() => shift(-1)} style={styles.navButton} accessibilityRole="button" accessibilityLabel={`Previous ${range}`} hitSlop={4}>
              <View style={[styles.navChevron, { transform: [{ rotate: '-135deg' }], marginLeft: 3 }]} />
            </Pressable>
            <Pressable onPress={() => shift(1)} style={styles.navButton} accessibilityRole="button" accessibilityLabel={`Next ${range}`} hitSlop={4}>
              <View style={[styles.navChevron, { transform: [{ rotate: '45deg' }], marginRight: 3 }]} />
            </Pressable>
            <View style={{ marginLeft: 4 }}>
              <BrandMark
                name={brandName}
                color={brandColor}
                onPress={onOpenBrandProfile}
                accessibilityLabel="Settings"
              />
            </View>
          </View>
        </View>

        {range === 'week' && renderWeek()}
        {range === 'month' && renderMonth()}
        {range === 'year' && renderYear()}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingHorizontal: pagePadding,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
  },
  segmentItem: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  segmentItemActive: {
    backgroundColor: colors.ink,
  },
  segmentText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.textLabel,
  },
  segmentTextActive: {
    color: colors.cream,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navButton: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navChevron: {
    width: 8,
    height: 8,
    borderTopWidth: 1.6,
    borderRightWidth: 1.6,
    borderColor: colors.textStrong,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 33,
    letterSpacing: -1.3,
    color: colors.ink,
    paddingTop: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textLabel,
  },

  // week strip
  strip: {
    flexDirection: 'row',
    gap: 5,
  },
  stripDay: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  stripWeekday: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: colors.textFaint,
  },
  stripTile: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripNumber: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textStrong,
  },
  stripNumberMarked: {
    fontFamily: fonts.heading,
    color: colors.onPastel,
  },

  // entries
  list: {
    gap: 11,
  },
  entry: {
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 8,
    overflow: 'hidden',
    minHeight: 108,
  },
  entryMascot: {
    position: 'absolute',
    right: -26,
    bottom: -34,
    width: 120,
    height: 116,
  },
  entryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryDate: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    letterSpacing: 1.3,
    color: colors.onPastelBody,
  },
  statusPill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.frost,
  },
  statusPillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.onPastel,
  },
  entryHook: {
    fontFamily: fonts.heading,
    fontSize: 16,
    lineHeight: 20.5,
    letterSpacing: -0.3,
    color: colors.onPastel,
    marginRight: 64,
  },
  entryMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onPastelBody,
    marginRight: 64,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.textMuted,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
  },
  emptyLeft: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },

  // year
  legend: {
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textStrong,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mini: {
    width: '31.6%',
    padding: 10,
    gap: 8,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 2,
  },
  miniHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  miniName: {
    fontFamily: fonts.heading,
    fontSize: 13,
    color: colors.ink,
  },
  miniCount: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: colors.textFaint,
  },
  miniGrid: {
    gap: 2.5,
  },
  miniRow: {
    flexDirection: 'row',
    gap: 2.5,
  },
  miniCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 1.5,
  },
  best: {
    backgroundColor: colors.green,
    borderRadius: radius.card,
    paddingHorizontal: 15,
    paddingVertical: 14,
    gap: 3,
  },
  bestTitle: {
    fontFamily: fonts.heading,
    fontSize: 14.5,
    color: colors.onPastel,
  },
  bestBody: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onPastelBody,
  },
});
