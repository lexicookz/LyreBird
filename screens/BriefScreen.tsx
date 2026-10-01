// screens/BriefScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, Brief } from '../types';
import { mockAnalyses } from '../data/mockVideos';
import { PrimaryButton } from '../components/ui';

function Field({
  label,
  value,
  onChangeText,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={`Enter ${label.toLowerCase()}...`}
        placeholderTextColor="#aaa"
      />
    </View>
  );
}

export default function BriefScreen({
  video,
  existingBrief,
  onBack,
  onSchedule,
}: {
  video: Video;
  existingBrief?: Brief;
  onBack: () => void;
  /** Opens the schedule sheet. Only offered for a brief that already exists. */
  onSchedule?: () => void;
}) {
  const analysis = mockAnalyses.find((a) => a.clip_id === video.id);

  const [hook, setHook] = useState(existingBrief?.hook ?? analysis?.payload.hook ?? '');
  const [script, setScript] = useState(existingBrief?.script ?? '');
  const [shotListText, setShotListText] = useState(
    ((existingBrief?.shot_list as string[] | null) ?? []).join('\n')
  );
  const [caption, setCaption] = useState(existingBrief?.caption ?? '');
  const [cta, setCta] = useState(existingBrief?.cta ?? analysis?.payload.cta ?? '');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    console.log('Saving brief (mock):', {
      clip_id: video.id,
      hook,
      script,
      shot_list: shotListText.split('\n').filter(Boolean),
      caption,
      cta,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Brief · {video.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Field label="Hook" value={hook} onChangeText={setHook} />
        <Field label="Script" value={script} onChangeText={setScript} multiline />
        <Field
          label="Shot list (one per line)"
          value={shotListText}
          onChangeText={setShotListText}
          multiline
        />
        <Field label="Caption" value={caption} onChangeText={setCaption} multiline />
        <Field label="CTA" value={cta} onChangeText={setCta} />

        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{saved ? 'Saved ✓' : 'Save Brief'}</Text>
        </Pressable>

        {onSchedule && <PrimaryButton label="Schedule" onPress={onSchedule} style={{ marginTop: 10 }} />}
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
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  field: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  inputMultiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});