// screens/LibraryScreen.tsx
// Figma: "Main screen" (18:1259), "Analysing" (123:2231), "No Video saved yet" (121:449).
// The data comes from data/library.ts via App.tsx; this screen only displays it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet from '../components/BottomSheet';
import { BrandMark, PrimaryButton } from '../components/ui';
import { useTabBarSpace } from '../components/BottomTabBar';

import { fonts, FUNNEL_ORDER, pagePadding, radius, Colors, useStyles, useTheme } from '../theme';
import type { Clip, FunnelStage, TypedAnalysis } from '../types';

type StageFilter = 'all' | FunnelStage;
type SortKey = 'focus' | 'newest' | 'oldest';

const COLUMN_GAP = 9;

// ---------- small helpers ----------

/** Asks before deleting; used by the Library cards and the analysis screen. */
export function confirmDeleteClip(clip: Clip, onConfirm: () => void) {
  Alert.alert(
    'Delete this video?',
    `"${clip.title ?? 'This video'}" and its analysis will be removed. Briefs you wrote from it are kept.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function savedAgo(iso: string, now: number) {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return 'Saved today';
  if (days === 1) return 'Saved yesterday';
  if (days < 14) return `Saved ${days} days ago`;
  return `Saved ${Math.floor(days / 7)} weeks ago`;
}

// ---------- icons ----------

function SearchIcon() {
  const icon = useStyles(makeIconStyles);
  return (
    <View style={icon.search}>
      <View style={icon.searchRing} />
      <View style={icon.searchHandle} />
    </View>
  );
}

function FilterIcon() {
  const icon = useStyles(makeIconStyles);
  return (
    <View style={icon.filter}>
      {[16, 11, 6].map((w) => (
        <View key={w} style={[icon.filterLine, { width: w }]} />
      ))}
    </View>
  );
}

function PlayButton() {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.play}>
      <View style={styles.playTriangle} />
    </View>
  );
}

function Spinner() {
  const styles = useStyles(makeStyles);
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />;
}

// ---------- cards ----------

type CardProps = {
  clip: Clip;
  analysis?: TypedAnalysis;
  hasBrief: boolean;
  now: number;
  blockHeight: number;
  onPress: () => void;
  onRetry: () => void;
  /** Long-press. */
  onDelete: () => void;
};

function ClipCard({ clip, analysis, hasBrief, now, blockHeight, onPress, onRetry, onDelete }: CardProps) {
  const { colors, stages } = useTheme();
  const styles = useStyles(makeStyles);
  const duration = formatDuration(clip.duration_seconds);

  if (clip.status === 'processing') {
    return (
      <Pressable
        style={[styles.card, styles.cardPlain]}
        onLongPress={onDelete}
        accessibilityLabel={`Analysing ${clip.title ?? 'video'}`}
      >
        <View style={{ height: blockHeight }} />
        <View style={styles.cardFooter}>
          <Text style={styles.analysingText}>Analysing…</Text>
          <View style={styles.progressTrack}>
      
          </View>
        </View>
      </Pressable>
    );
  }

  if (!analysis) {
    // Failed, or marked ready with no analysis row.
    return (
      <Pressable
        style={[styles.card, styles.cardPlain, { padding: 12, gap: 8 }]}
        onPress={onPress}
        onLongPress={onDelete}
      >
        <Text style={styles.plainEyebrow}>
          {clip.status === 'failed' ? "COULDN'T ANALYSE" : 'NOT ANALYSED'}
        </Text>
        <Text style={styles.plainTitle} numberOfLines={3}>
          {clip.title ?? 'Saved video'}
        </Text>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={`Try analysing ${clip.title ?? 'video'} again`}
          style={styles.outlinePill}
        >
          <Text style={styles.outlinePillText}>Try again</Text>
        </Pressable>
      </Pressable>
    );
  }

  const stage = stages[analysis.payload.funnelStage];
  return (
    <Pressable
      style={[styles.card, { backgroundColor: stage?.color ?? colors.sky }]}
      onPress={onPress}
      onLongPress={onDelete}
      accessibilityHint="Long-press to delete"
      accessibilityRole="button"
    >
      <View style={[styles.block, { height: blockHeight }]}>
        <PlayButton />
        {duration && (
          <View style={styles.duration}>
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.hook}>“{analysis.payload.hook}”</Text>
        <View style={styles.pillRow}>
          {stage && (
            <View style={styles.framePill}>
              <Text style={styles.framePillText}>{stage.label}</Text>
            </View>
          )}
          {hasBrief && (
            <View style={styles.inkPill}>
              <Text style={styles.inkPillText}>Brief ready</Text>
            </View>
          )}
        </View>
        <Text style={styles.saved}>{savedAgo(clip.created_at, now)}</Text>
      </View>
    </Pressable>
  );
}

// ---------- empty state ----------

function EmptyLibrary({
  brandName,
  brandColor,
  onOpenBrandProfile,
  onAddVideos,
  onLoadSamples,
}: {
  brandName?: string;
  brandColor?: string;
  onOpenBrandProfile: () => void;
  onAddVideos: () => void;
  onLoadSamples: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { width } = useWindowDimensions();
  const s = width / 402;
  return (
    <ScrollView contentContainerStyle={styles.emptyScroll} bounces={false}>
      <View style={[styles.emptyShape, { backgroundColor: colors.green, left: 322 * s, top: 70 * s, width: 124 * s, height: 116 * s }]} />
      <View style={[styles.emptyShape, { backgroundColor: colors.peach, left: -36 * s, top: 244 * s, width: 92 * s, height: 88 * s }]} />
      <Header brandName={brandName} brandColor={brandColor} onOpenBrandProfile={onOpenBrandProfile} />
      <Image
        source={require('../assets/mascots/hero.png')}
        style={{ width: 257 * s, height: 243 * s, alignSelf: 'center', marginTop: 4 }}
        resizeMode="contain"
      />
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>Nothing saved yet</Text>
        <Text style={styles.emptyBody}>
          Save a few TikToks or Reels to your camera roll, then bring them in here. We will tell
          you why each one works.
        </Text>
      </View>
      <View style={styles.steps}>
        <View style={styles.step}>
          <View style={[styles.stepNumber, { backgroundColor: colors.green }]}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <Text style={styles.stepText}>In TikTok, tap Save to device</Text>
        </View>
        <View style={styles.step}>
          <View style={[styles.stepNumber, { backgroundColor: colors.lilac }]}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <Text style={styles.stepText}>Come back here and tap the plus.</Text>
        </View>
      </View>
      <View style={styles.emptyActions}>
        <PrimaryButton label="Add your first videos" onPress={onAddVideos} style={styles.ctaShadow} />
        <Pressable onPress={onLoadSamples} hitSlop={8} accessibilityRole="button">
          <Text style={styles.sampleLink}>Just looking? Explore with sample videos</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Header({
  brandName,
  brandColor,
  onOpenBrandProfile,
}: {
  brandName?: string;
  brandColor?: string;
  onOpenBrandProfile: () => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.header}>
      <Text style={styles.wordmark}>LYREBIRD</Text>
      <BrandMark
        name={brandName}
        color={brandColor}
        onPress={onOpenBrandProfile}
        accessibilityLabel="Settings"
      />
    </View>
  );
}

// ---------- screen ----------

export default function LibraryScreen({
  clips,
  analyses,
  briefClipIds,
  lastImportCount,
  now,
  brandName,
  brandColor,
  focus,
  onSelectVideo,
  onOpenBrandProfile,
  onAddVideos,
  onLoadSamples,
  onRetry,
  onDelete,
}: {
  clips: Clip[];
  analyses: TypedAnalysis[];
  /** Clips that already have a brief ("Brief ready"). */
  briefClipIds: Set<string>;
  lastImportCount: number | null;
  /** Current time from the library hook; ticks while clips are analysing. */
  now: number;
  brandName?: string;
  /** Background of the brand's initial in the header. */
  brandColor?: string;
  /** The funnel stage the brand wants more of; sorted first by default. */
  focus?: FunnelStage;
  onSelectVideo: (clip: Clip) => void;
  onOpenBrandProfile: () => void;
  onAddVideos: () => void;
  onLoadSamples: () => void;
  onRetry: (clipId: string) => void;
  onDelete: (clipId: string) => void;
}) {
  const { colors, stages } = useTheme();
  const styles = useStyles(makeStyles);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [sort, setSort] = useState<SortKey>(focus ? 'focus' : 'newest');
  const [sortOpen, setSortOpen] = useState(false);
  const tabBarSpace = useTabBarSpace();
  const { width } = useWindowDimensions();

  const columnWidth = (width - pagePadding * 2 - COLUMN_GAP) / 2;
  const blockHeight = (columnWidth - 18) * 1.25;

  const analysisByClip = useMemo(
    () => new Map(analyses.map((a) => [a.clip_id, a])),
    [analyses]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = clips.filter((clip) => {
      const a = analysisByClip.get(clip.id);
      if (stageFilter !== 'all' && a?.payload.funnelStage !== stageFilter) return false;
      if (!q) return true;
      return [clip.title ?? '', a?.payload.hook ?? '', (a?.payload.onScreenText ?? []).join(' '), ...clip.tags]
        .some((text) => text.toLowerCase().includes(q));
    });
    const byDate = (x: Clip, y: Clip) => Date.parse(y.created_at) - Date.parse(x.created_at);
    return [...matches].sort((x, y) => {
      if (sort === 'oldest') return -byDate(x, y);
      if (sort === 'focus' && focus) {
        const xf = analysisByClip.get(x.id)?.payload.funnelStage === focus ? 0 : 1;
        const yf = analysisByClip.get(y.id)?.payload.funnelStage === focus ? 0 : 1;
        if (xf !== yf) return xf - yf;
      }
      return byDate(x, y);
    });
  }, [clips, analysisByClip, query, stageFilter, sort, focus]);

  if (clips.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <EmptyLibrary
          brandName={brandName}
          brandColor={brandColor}
          onOpenBrandProfile={onOpenBrandProfile}
          onAddVideos={onAddVideos}
          onLoadSamples={onLoadSamples}
        />
      </SafeAreaView>
    );
  }

  const untouched = clips.filter((c) => !briefClipIds.has(c.id)).length;
  const processingCount = clips.filter((c) => c.status === 'processing').length;
  const columns: [Clip[], Clip[]] = [[], []];
  visible.forEach((clip, i) => columns[i % 2].push(clip));

  const sortOptions: { key: SortKey; label: string }[] = [
    ...(focus ? [{ key: 'focus' as const, label: `${stages[focus].label} first` }] : []),
    { key: 'newest', label: 'Newest first' },
    { key: 'oldest', label: 'Oldest first' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarSpace + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Header brandName={brandName} brandColor={brandColor} onOpenBrandProfile={onOpenBrandProfile} />

        <View style={{ gap: 8 }}>
          <Text style={styles.title}>
            {`${clips.length} saved,\n${untouched} untouched`}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {lastImportCount ? `Last import: ${plural(lastImportCount, 'clip')}` : ' '}
            </Text>
            <Text style={styles.metaRight}>{plural(visible.length, 'result')}</Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <SearchIcon />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search hooks, captions, tags"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>
          <Pressable
            onPress={() => setSortOpen(true)}
            style={styles.filterButton}
            accessibilityRole="button"
            accessibilityLabel="Sort"
          >
            <FilterIcon />
          </Pressable>
        </View>

        {processingCount > 0 && (
          <View style={styles.banner}>
            <Spinner />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.bannerTitle}>
                Analysing {plural(processingCount, 'new clip')}
              </Text>
              <Text style={styles.bannerSub}>Started on its own · usually under a minute</Text>
            </View>
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsScroller}
        >
          <Pressable
            onPress={() => setStageFilter('all')}
            accessibilityRole="button"
            accessibilityState={{ selected: stageFilter === 'all' }}
            style={[styles.chip, stageFilter === 'all' && styles.chipActive]}
          >
            <Text style={[styles.chipText, stageFilter === 'all' && styles.chipTextActive]}>All</Text>
          </Pressable>
          {FUNNEL_ORDER.map((stage) => {
            const active = stageFilter === stage;
            return (
              <Pressable
                key={stage}
                onPress={() => setStageFilter(active ? 'all' : stage)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, styles.stageChip, active && styles.chipActive]}
              >
                <View style={[styles.chipDot, { backgroundColor: stages[stage].color }]} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {stages[stage].label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {visible.length === 0 ? (
          <Text style={styles.noResults}>No videos match your search.</Text>
        ) : (
          <View style={styles.columns}>
            {columns.map((column, ci) => (
              <View key={ci} style={[styles.column, ci === 1 && { paddingTop: 20 }]}>
                {column.map((clip) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    analysis={analysisByClip.get(clip.id)}
                    hasBrief={briefClipIds.has(clip.id)}
                    now={now}
                    blockHeight={blockHeight}
                    onPress={() => onSelectVideo(clip)}
                    onRetry={() => onRetry(clip.id)}
                    onDelete={() => confirmDeleteClip(clip, () => onDelete(clip.id))}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)}>
        <Text style={styles.sheetTitle}>Sort by</Text>
        <View style={{ gap: 8, marginBottom: 8 }}>
          {sortOptions.map((option) => {
            const active = sort === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  setSort(option.key);
                  setSortOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.sortOption, active && { backgroundColor: colors.green }]}
              >
                <Text style={[styles.sortText, active && { fontFamily: fonts.bodySemiBold }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
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
    gap: 18,
  },

  // header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 1.54,
    color: colors.textEyebrow,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 29,
    lineHeight: 29.9,
    letterSpacing: -1,
    color: colors.ink,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.textMuted,
  },
  metaRight: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
  },

  // search
  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchBox: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.ink,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },

  // analysing banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.sky,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  spinner: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 2.4,
    borderColor: colors.onPastel,
    borderTopColor: 'transparent',
  },
  bannerTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.onPastel,
  },
  bannerSub: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.onPastelBody,
  },

  // funnel chips
  chipsScroller: {
    marginHorizontal: -pagePadding,
    flexGrow: 0,
  },
  chips: {
    gap: 7,
    paddingHorizontal: pagePadding,
  },
  chip: {
    height: 31,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stageChip: {
    paddingLeft: 10,
    paddingRight: 14,
    gap: 7,
  },
  chipActive: {
    backgroundColor: colors.ink,
  },
  chipDot: {
    width: 11,
    height: 11,
    borderRadius: radius.pill,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textStrong,
  },
  chipTextActive: {
    fontFamily: fonts.bodySemiBold,
    color: colors.cream,
  },

  // cards
  columns: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
  },
  column: {
    flex: 1,
    gap: COLUMN_GAP,
  },
  card: {
    borderRadius: radius.card,
    padding: 9,
    gap: 9,
  },
  cardPlain: {
    backgroundColor: colors.surface,
    borderWidth: 0.8,
    borderColor: colors.hairline,
  },
  block: {
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.frost,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 6.4,
    borderBottomWidth: 6.4,
    borderLeftWidth: 10.4,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.onPastel,
  },
  duration: {
    position: 'absolute',
    left: 7,
    bottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
  },
  durationText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9.5,
    color: colors.onScrim,
  },
  cardFooter: {
    paddingHorizontal: 2,
    paddingBottom: 2,
    gap: 7,
  },
  hook: {
    fontFamily: fonts.heading,
    fontSize: 13,
    lineHeight: 16.6,
    letterSpacing: -0.2,
    color: colors.onPastel,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  framePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.frost,
  },
  framePillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: colors.onPastel,
  },
  inkPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.onPastel,
  },
  inkPillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: colors.onPastelInverse,
  },
  saved: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    color: colors.onPastelBody,
  },
  analysingText: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textBody,
  },
  progressTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  plainEyebrow: {
    fontFamily: fonts.body,
    fontSize: 9,
    letterSpacing: 0.9,
    color: colors.textFaint,
  },
  plainTitle: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    lineHeight: 15.5,
    color: colors.textStrong,
  },
  outlinePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 0.8,
    borderColor: colors.hairline,
  },
  outlinePillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: colors.ink,
  },
  noResults: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },

  // sort sheet
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: -0.9,
    color: colors.ink,
    marginBottom: 14,
  },
  sortOption: {
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: radius.field,
    backgroundColor: colors.field,
  },
  sortText: {
    fontFamily: fonts.body,
    fontSize: 14.5,
    color: colors.ink,
  },

  // empty state
  emptyScroll: {
    flexGrow: 1,
    paddingHorizontal: pagePadding,
    paddingTop: 12,
    paddingBottom: 140,
  },
  emptyShape: {
    position: 'absolute',
  },
  emptyCopy: {
    gap: 10,
    paddingHorizontal: 8,
    marginTop: 16,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 32,
    letterSpacing: -1.28,
    color: colors.ink,
    paddingTop: 4,
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  steps: {
    gap: 9,
    marginTop: 18,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: radius.card,
    backgroundColor: colors.field,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    color: colors.onPastel,
  },
  stepText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 17.5,
    color: colors.textStrong,
  },
  emptyActions: {
    marginTop: 'auto',
    paddingTop: 28,
    gap: 14,
  },
  ctaShadow: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 7,
    elevation: 6,
  },
  sampleLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.textLabel,
    textAlign: 'center',
  },
});

const makeIconStyles = (colors: Colors) => StyleSheet.create({
  search: {
    width: 17,
    height: 17,
  },
  searchRing: {
    position: 'absolute',
    left: 1,
    top: 1,
    width: 14.2,
    height: 14.2,
    borderRadius: radius.pill,
    borderWidth: 1.6,
    borderColor: colors.textFaint,
  },
  searchHandle: {
    position: 'absolute',
    left: 9.5,
    top: 13,
    width: 7,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.textFaint,
    transform: [{ rotate: '45deg' }],
  },
  filter: {
    alignItems: 'center',
    gap: 3,
  },
  filterLine: {
    height: 2.2,
    borderRadius: 2,
    backgroundColor: colors.icon,
  },
});
