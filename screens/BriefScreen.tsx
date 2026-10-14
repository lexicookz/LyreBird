// screens/BriefScreen.tsx
// Figma: "Script" ("Your version", 18:947). The brief for the user's brand,
// edited in place and saved as they type.
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BackButton, Eyebrow } from '../components/ui';
import { BriefEdit, briefAsText, shotsOf } from '../data/briefs';
import { CALENDAR_STATUSES, CalendarItem } from '../data/calendar';
import { fonts, pagePadding, radius, Colors, useStyles, useTheme } from '../theme';
import type { Brief, Clip } from '../types';

function comingSoon() {
  Alert.alert('Coming soon', 'Alternate hooks aren’t available yet. Try Regenerate for a whole new version.');
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function BriefScreen({
  brief,
  clip,
  brandName,
  entry,
  onEdit,
  onBack,
  onSchedule,
  onRegenerate,
  regenerating = false,
}: {
  brief: Brief;
  clip?: Clip;
  brandName?: string;
  /** The brief's calendar entry, if it's scheduled. */
  entry?: CalendarItem;
  onEdit: (patch: BriefEdit) => void;
  onBack: () => void;
  onSchedule: () => void;
  /** Ask the AI for a fresh version. The current one is kept. */
  onRegenerate: () => void;
  /** The AI is rewriting this brief right now. */
  regenerating?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  // Shots are kept locally so an empty row (just added) survives until typed in.
  const [shots, setShots] = useState<string[]>(() => shotsOf(brief));

  function updateShots(next: string[]) {
    setShots(next);
    onEdit({ shot_list: next.filter((s) => s.trim()) });
  }

  const filledShots = shots.filter((s) => s.trim());
  const status = entry
    ? (CALENDAR_STATUSES.find((s) => s.key === entry.status)?.label ?? 'Planned')
    : 'Draft';
  const duration = formatDuration(clip?.duration_seconds);
  const source = [clip?.title ? `From “${clip.title}”` : null, brandName ? `brand profile: ${brandName}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.topRow}>
            <BackButton onPress={onBack} />
            <Text style={styles.saved}>
              {status.toUpperCase()} · SAVED {formatTime(brief.updated_at)}
            </Text>
          </View>

          <View style={{ gap: 4 }}>
            <Text style={styles.title}>Your version</Text>
            {!!source && <Text style={styles.source}>{source}</Text>}
          </View>

          <View style={[styles.card, { backgroundColor: colors.green, gap: 10 }]}>
            <Eyebrow color={colors.onPastelBody}>Hook line</Eyebrow>
            <TextInput
              defaultValue={brief.hook ?? ''}
              onChangeText={(hook) => onEdit({ hook })}
              multiline
              placeholder="Write the first line people hear"
              placeholderTextColor={colors.onPastelBody}
              accessibilityLabel="Hook line"
              style={styles.hookInput}
            />
            <View style={styles.pillRow}>
              <Pressable
                onPress={onRegenerate}
                disabled={regenerating}
                style={[styles.framePill, regenerating && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityState={{ busy: regenerating, disabled: regenerating }}
              >
                <Text style={styles.framePillText}>{regenerating ? 'Rewriting…' : 'Regenerate'}</Text>
              </Pressable>
              <Pressable onPress={comingSoon} style={styles.framePill} accessibilityRole="button">
                <Text style={styles.framePillText}>3 alternates</Text>
              </Pressable>
            </View>
          </View>

          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>SHOT LIST</Text>
              <Text style={styles.sectionMeta}>
                {[`${filledShots.length} shot${filledShots.length === 1 ? '' : 's'}`, duration]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {shots.map((shot, i) => (
              <View key={i} style={[styles.shot, i > 0 && styles.divider]}>
                <Text style={styles.shotIndex}>{String(i + 1).padStart(2, '0')}</Text>
                <TextInput
                  value={shot}
                  onChangeText={(text) => updateShots(shots.map((s, j) => (j === i ? text : s)))}
                  onBlur={() => {
                    if (!shot.trim()) updateShots(shots.filter((_, j) => j !== i));
                  }}
                  multiline
                  placeholder="Describe the shot"
                  placeholderTextColor={colors.textPlaceholder}
                  accessibilityLabel={`Shot ${i + 1}`}
                  style={styles.shotInput}
                />
              </View>
            ))}
            <Pressable
              onPress={() => setShots([...shots, ''])}
              style={[styles.shot, shots.length > 0 && styles.divider]}
              accessibilityRole="button"
            >
              <Text style={styles.addShot}>+ Add shot</Text>
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: colors.field, gap: 8 }]}>
            <Eyebrow>Script</Eyebrow>
            <TextInput
              defaultValue={brief.script ?? ''}
              onChangeText={(script) => onEdit({ script })}
              multiline
              placeholder="What you'll say, beat by beat"
              placeholderTextColor={colors.textPlaceholder}
              accessibilityLabel="Script"
              style={styles.bodyInput}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.pink, gap: 10 }]}>
            <Eyebrow color={colors.onPastelBody}>{'Caption & CTA'}</Eyebrow>
            <TextInput
              defaultValue={brief.caption ?? ''}
              onChangeText={(caption) => onEdit({ caption })}
              multiline
              placeholder="Write the caption"
              placeholderTextColor={colors.onPastelBody}
              accessibilityLabel="Caption"
              style={styles.pastelInput}
            />
            <View style={styles.ctaRow}>
              <Text style={styles.ctaLabel}>CTA</Text>
              <TextInput
                defaultValue={brief.cta ?? ''}
                onChangeText={(cta) => onEdit({ cta })}
                placeholder="What should viewers do?"
                placeholderTextColor={colors.onPastelBody}
                accessibilityLabel="Call to action"
                style={styles.ctaInput}
              />
            </View>
            {brief.hashtags.length > 0 && (
              <View style={styles.pillRow}>
                {brief.hashtags.map((tag) => (
                  <View key={tag} style={styles.framePill}>
                    <Text style={styles.framePillText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={onSchedule}
            accessibilityRole="button"
            style={({ pressed }) => [styles.schedule, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.scheduleText}>{entry ? 'Reschedule' : 'Schedule'}</Text>
          </Pressable>
          <Pressable
            onPress={() => Share.share({ message: briefAsText({ ...brief, shot_list: filledShots }) })}
            accessibilityRole="button"
            accessibilityLabel="Share brief"
            style={styles.share}
          >
            <Ionicons name="share-outline" size={21} color={colors.ink} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  saved: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    letterSpacing: 1,
    color: colors.textEyebrow,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 31,
    letterSpacing: -1.2,
    color: colors.ink,
  },
  source: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  card: {
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  hookInput: {
    fontFamily: fonts.heading,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: colors.onPastel,
    padding: 0,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  framePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.frost,
  },
  framePillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    color: colors.onPastel,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  sectionLabel: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    letterSpacing: 1,
    color: colors.textFaint,
  },
  sectionMeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
  },
  shot: {
    flexDirection: 'row',
    gap: 18,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: colors.divider,
  },
  shotIndex: {
    width: 22,
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textFaint,
    paddingTop: 2,
  },
  shotInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textStrong,
    padding: 0,
  },
  addShot: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.textLabel,
    marginLeft: 40,
  },
  bodyInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    padding: 0,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  pastelInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onPastel,
    padding: 0,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.frost,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ctaLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    color: colors.onPastel,
  },
  ctaInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.onPastel,
    padding: 0,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: pagePadding,
    paddingTop: 8,
    paddingBottom: 12,
  },
  schedule: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleText: {
    fontFamily: fonts.heading,
    fontSize: 15.5,
    color: colors.cream,
  },
  share: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
});
