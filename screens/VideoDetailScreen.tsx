// screens/VideoDetailScreen.tsx
import React from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clip, TypedAnalysis } from '../types';
import { mockAnalyses } from '../data/mockVideos';
import { funnelStages } from '../theme';

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function VideoDetailScreen({
  video,
  analysis: analysisProp,
  onBack,
  onViewBrief,
}: {
  video: Clip;
  /** The clip's analysis, if the caller has it; otherwise looked up in the mocks. */
  analysis?: TypedAnalysis;
  onBack: () => void;
  onViewBrief: () => void;
}) {
  const isReady = video.status === 'ready';
  const analysis = analysisProp ?? mockAnalyses.find((a) => a.clip_id === video.id);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Pressable onPress={onViewBrief} style={styles.backButton}>
        <Text style={styles.briefButtonText}>View / Edit Brief</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Image source={{ uri: video.thumbnail_url ?? undefined }} style={styles.hero} />

        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.status}>{video.status}</Text>

        <View style={styles.tagRow}>
          {video.tags.map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {!(isReady && analysis) && (
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>
              {video.status === 'processing'
                ? 'Analysis is still processing…'
                : video.status === 'failed'
                  ? 'Analysis failed for this video.'
                  : 'Analysis not available yet for this video.'}
            </Text>
          </View>
        )}

        {isReady && analysis && (
          <>
            <Section label="Hook">
              <Text style={styles.bodyText}>{analysis.payload.hook}</Text>
            </Section>

            <Section label="Transcript">
              <Text style={styles.bodyText}>{analysis.payload.transcript}</Text>
            </Section>

            <Section label="On-screen text">
              <Text style={styles.bodyText}>{analysis.payload.onScreenText}</Text>
            </Section>

            <Section label="Shot beats">
              {analysis.payload.shotBeats?.map((beat, i) => (
                <Text key={i} style={styles.listItem}>{`${i + 1}. ${beat}`}</Text>
              ))}
            </Section>

            <Section label="Pacing">
              <Text style={styles.bodyText}>{analysis.payload.pacing}</Text>
            </Section>

            <Section label="CTA">
              <Text style={styles.bodyText}>{analysis.payload.cta}</Text>
            </Section>

            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaLabel}>Format</Text>
                <Text style={styles.metaValue}>{analysis.payload.format}</Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaLabel}>Funnel stage</Text>
                <Text style={styles.metaValue}>
                  {funnelStages[analysis.payload.funnelStage]?.label ?? analysis.payload.funnelStage}
                </Text>
              </View>
            </View>
          </>
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
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backText: {
    fontSize: 16,
    color: '#222',
  },
  briefButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  hero: {
    width: '100%',
    height: 260,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  status: {
    fontSize: 13,
    color: '#888',
    paddingHorizontal: 16,
    paddingTop: 4,
    textTransform: 'capitalize',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  tagChip: {
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    color: '#333',
  },
  placeholderBox: {
    margin: 16,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  placeholderText: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#222',
  },
  listItem: {
    fontSize: 15,
    lineHeight: 22,
    color: '#222',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  metaChip: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
  },
  metaLabel: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
    textTransform: 'capitalize',
  },
});