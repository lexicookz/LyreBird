// screens/SearchScreen.tsx
// The Search tab. There's no Figma frame for it, so it follows the Library and
// Briefs styles: one box that searches both videos and briefs.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { shotsOf } from '../data/briefs';
import { fonts, pagePadding, radius, Colors, useStyles, useTheme } from '../theme';
import type { Brief, Clip, FunnelStage, TypedAnalysis } from '../types';

function matches(q: string, texts: (string | null | undefined)[]) {
  return texts.some((t) => !!t && t.toLowerCase().includes(q));
}

export default function SearchScreen({
  clips,
  analyses,
  briefs,
  stageOf,
  onSelectClip,
  onSelectBrief,
}: {
  clips: Clip[];
  analyses: TypedAnalysis[];
  briefs: Brief[];
  stageOf: (brief: Brief) => FunnelStage;
  onSelectClip: (clip: Clip) => void;
  onSelectBrief: (brief: Brief) => void;
}) {
  const { colors, stages } = useTheme();
  const styles = useStyles(makeStyles);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const analysisByClip = useMemo(() => new Map(analyses.map((a) => [a.clip_id, a])), [analyses]);

  const clipResults = q
    ? clips.filter((c) => {
        const p = analysisByClip.get(c.id)?.payload;
        return matches(q, [c.title, ...c.tags, p?.hook, ...(p?.onScreenText ?? []), p?.transcript, p?.cta]);
      })
    : [];
  const briefResults = q
    ? briefs.filter((b) => matches(q, [b.hook, b.caption, b.script, b.cta, ...b.hashtags, ...shotsOf(b)]))
    : [];
  const total = clipResults.length + briefResults.length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>SEARCH</Text>
        <Text style={styles.title}>Find a hook,{'\n'}a shot, a line</Text>

        <View style={styles.searchBox}>
          <View style={styles.searchIcon}>
            <View style={styles.searchRing} />
            <View style={styles.searchHandle} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search videos and briefs"
            placeholderTextColor={colors.textPlaceholder}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search videos and briefs"
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Text style={styles.clear}>×</Text>
            </Pressable>
          )}
        </View>

        {!q ? (
          <Text style={styles.hint}>
            Searches the hooks, on-screen text and transcripts of your videos, and the hooks,
            shots, scripts and captions of your briefs.
          </Text>
        ) : total === 0 ? (
          <Text style={styles.hint}>Nothing matches “{query.trim()}”.</Text>
        ) : (
          <>
            {clipResults.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>VIDEOS · {clipResults.length}</Text>
                {clipResults.map((clip) => {
                  const p = analysisByClip.get(clip.id)?.payload;
                  const stage = p ? stages[p.funnelStage] : undefined;
                  return (
                    <Pressable
                      key={clip.id}
                      onPress={() => onSelectClip(clip)}
                      accessibilityRole="button"
                      style={styles.result}
                    >
                      <View style={[styles.swatch, { backgroundColor: stage?.color ?? colors.track }]} />
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.resultTitle} numberOfLines={2}>
                          {p ? `“${p.hook}”` : clip.title ?? 'Saved video'}
                        </Text>
                        <Text style={styles.resultMeta} numberOfLines={1}>
                          {[stage?.label ?? (clip.status === 'processing' ? 'Analysing' : 'Not analysed'), clip.title]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {briefResults.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>BRIEFS · {briefResults.length}</Text>
                {briefResults.map((brief) => {
                  const stage = stages[stageOf(brief)];
                  return (
                    <Pressable
                      key={brief.id}
                      onPress={() => onSelectBrief(brief)}
                      accessibilityRole="button"
                      style={[styles.briefCard, { backgroundColor: stage.color }]}
                    >
                      <Text style={styles.briefTitle}>“{brief.hook ?? 'Untitled brief'}”</Text>
                      <Text style={styles.briefMeta}>
                        {stage.label} · {shotsOf(brief).length} shots
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
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
  eyebrow: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 1.54,
    color: colors.textLabel,
    marginTop: 9,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 31,
    letterSpacing: -1.2,
    color: colors.ink,
  },
  searchBox: {
    height: 50,
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
  searchIcon: {
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
  searchInput: {
    flex: 1,
    height: 50,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  clear: {
    fontFamily: fonts.body,
    fontSize: 20,
    color: colors.textFaint,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textMuted,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    letterSpacing: 1,
    color: colors.textFaint,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  swatch: {
    width: 44,
    height: 56,
    borderRadius: radius.card,
  },
  resultTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink,
  },
  resultMeta: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textBody,
  },
  briefTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    lineHeight: 18,
    color: colors.onPastel,
  },
  briefMeta: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.onPastelBody,
  },
  briefCard: {
    borderRadius: radius.card,
    paddingHorizontal: 15,
    paddingVertical: 13,
    gap: 4,
  },
});
