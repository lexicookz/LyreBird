// screens/VideoDetailScreen.tsx
// Figma: "Content analysis" ("Why this one works", 18:1102). Shows a clip's
// analysis and leads to "Adapt for my brand".
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton, Eyebrow } from '../components/ui';
import { colors, fonts, funnelStages, pagePadding, radius } from '../theme';
import type { Clip, FormatTag, TypedAnalysis, VideoFormat } from '../types';

const FORMAT_LABELS: Record<VideoFormat, string> = {
  talking_head: 'Talking head',
  voiceover: 'Voiceover',
  text_overlay: 'Text on screen',
  skit: 'Skit',
  other: 'Other format',
};

const FORMAT_TAG_LABELS: Record<FormatTag, string> = {
  ugc_testimonial: 'UGC testimonial',
  founder_pov: 'Founder POV',
  problem_agitate_solve: 'Problem, agitate, solve',
};

const BEATS_PREVIEW = 4;

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function VideoDetailScreen({
  video,
  analysis,
  hasBrief,
  onBack,
  onAdapt,
  onDelete,
}: {
  video: Clip;
  analysis?: TypedAnalysis;
  /** Whether a brief already exists for this clip; the button then opens it. */
  hasBrief: boolean;
  onBack: () => void;
  onAdapt: () => void;
  /** Asks for confirmation itself, then deletes. */
  onDelete: () => void;
}) {
  const [showAllBeats, setShowAllBeats] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const payload = video.status === 'ready' ? analysis?.payload : undefined;
  const stage = payload ? funnelStages[payload.funnelStage] : undefined;
  const beats = payload?.shotBeats ?? [];
  const shownBeats = showAllBeats ? beats : beats.slice(0, BEATS_PREVIEW);
  const words = payload?.transcript?.trim().split(/\s+/).filter(Boolean).length ?? 0;
  const meta = [formatDuration(video.duration_seconds), video.title].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <BackButton onPress={onBack} />
          {stage && (
            <View style={[styles.stagePill, { backgroundColor: stage.color }]}>
              <View style={styles.stageDot} />
              <Text style={styles.stageText}>{stage.label}</Text>
            </View>
          )}
        </View>

        <View style={styles.heading}>
          {video.thumbnail_url ? (
            <Image source={{ uri: video.thumbnail_url }} style={styles.thumb} />
          ) : (
            <View style={styles.thumb} />
          )}
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.title}>Why this one works</Text>
            <Text style={styles.meta} numberOfLines={2}>{meta}</Text>
            {payload && (
              <View style={styles.tags}>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{FORMAT_LABELS[payload.format] ?? payload.format}</Text>
                </View>
                {payload.formatTag && (
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{FORMAT_TAG_LABELS[payload.formatTag]}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {!payload ? (
          <View style={styles.pending}>
            <Text style={styles.pendingText}>
              {video.status === 'processing'
                ? 'Still analysing. This usually takes under a minute.'
                : "We couldn't analyse this one. Try again from your library."}
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.green, gap: 8 }]}>
              <Eyebrow color={colors.textBody}>Hook · 0:00–0:03 verbatim</Eyebrow>
              <Text style={styles.hook}>“{payload.hook}”</Text>
              {!!payload.pacing && <Text style={styles.hookNote}>{payload.pacing}</Text>}
            </View>

            {beats.length > 0 && (
              <View style={{ gap: 4 }}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>
                    SHOT BEATS · {shownBeats.length} OF {beats.length}
                  </Text>
                  {beats.length > BEATS_PREVIEW && (
                    <Pressable onPress={() => setShowAllBeats(!showAllBeats)} hitSlop={8} accessibilityRole="button">
                      <Text style={styles.sectionLink}>{showAllBeats ? 'Show less' : 'Show all'}</Text>
                    </Pressable>
                  )}
                </View>
                {shownBeats.map((beat, i) => (
                  <View key={i} style={[styles.beat, i > 0 && styles.beatDivider]}>
                    <Text style={styles.beatIndex}>{String(i + 1).padStart(2, '0')}</Text>
                    <Text style={styles.beatText}>{beat}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!payload.cta && (
              <View style={[styles.card, { backgroundColor: colors.pink, gap: 6 }]}>
                <Eyebrow color={colors.textBody}>Call to action</Eyebrow>
                <Text style={styles.cardBody}>{payload.cta}</Text>
              </View>
            )}

            {!!payload.transcript && (
              <Pressable
                onPress={() => setTranscriptOpen(!transcriptOpen)}
                style={styles.transcript}
                accessibilityRole="button"
                accessibilityState={{ expanded: transcriptOpen }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.sectionLabel}>TRANSCRIPT · {words} WORDS</Text>
                  <Text style={styles.cardBody} numberOfLines={transcriptOpen ? undefined : 1}>
                    {payload.transcript}
                  </Text>
                </View>
                <Text style={styles.open}>{transcriptOpen ? 'Close' : 'Open'}</Text>
              </Pressable>
            )}
          </>
        )}

        <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" style={styles.delete}>
          <Text style={styles.deleteText}>Delete video</Text>
        </Pressable>
      </ScrollView>

      {payload && (
        <View style={styles.footer}>
          <Pressable
            onPress={onAdapt}
            accessibilityRole="button"
            style={({ pressed }) => [styles.adapt, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.adaptText}>{hasBrief ? 'Open my brief' : 'Adapt for my brand'}</Text>
            <View style={styles.adaptChevron} />
          </Pressable>
        </View>
      )}
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.textStrong,
  },
  stageText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.ink,
  },
  heading: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  thumb: {
    width: 68,
    height: 90,
    borderRadius: radius.card,
    backgroundColor: '#e9e9e8',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 27,
    letterSpacing: -1,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
  },
  tagText: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textStrong,
  },
  card: {
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  hook: {
    fontFamily: fonts.heading,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  hookNote: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textBody,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionLabel: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    letterSpacing: 1,
    color: colors.textPlaceholder,
  },
  sectionLink: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  beat: {
    flexDirection: 'row',
    gap: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  beatDivider: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: 'rgba(51,36,28,0.07)',
  },
  beatIndex: {
    width: 22,
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textFaint,
    paddingTop: 1,
  },
  beatText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textStrong,
  },
  cardBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textStrong,
  },
  transcript: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: '#f4f3f1',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  open: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.ink,
  },
  pending: {
    borderRadius: radius.card,
    backgroundColor: colors.field,
    padding: 16,
  },
  pendingText: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textMuted,
  },
  delete: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  deleteText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: '#8a4b3c',
  },
  footer: {
    paddingHorizontal: pagePadding,
    paddingTop: 8,
    paddingBottom: 12,
  },
  adapt: {
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  adaptText: {
    fontFamily: fonts.heading,
    fontSize: 15.5,
    color: colors.cream,
  },
  adaptChevron: {
    width: 8,
    height: 8,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.cream,
    transform: [{ rotate: '45deg' }],
  },
});
