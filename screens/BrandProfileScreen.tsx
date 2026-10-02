// screens/BrandProfileScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandProfile } from '../types';

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

export default function BrandProfileScreen({
  existingProfile,
  onBack,
  onSignOut,
}: {
  existingProfile?: BrandProfile;
  onBack: () => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState(existingProfile?.name ?? '');
  const [product, setProduct] = useState(existingProfile?.product_summary ?? '');
  const [audience, setAudience] = useState(existingProfile?.target_audience ?? '');
  const [tone, setTone] = useState(existingProfile?.tone_of_voice ?? '');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    // 'name' is required by the database (brands.name is NOT NULL),
    // so we validate it's non-empty before "saving".
    if (!name.trim()) {
      console.log('Cannot save: brand name is required');
      return;
    }
    console.log('Saving brand profile (mock):', { name, product, audience, tone });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function handleSignOutPress() {
    Alert.alert(
      'Sign out?',
      'This clears your brand setup and takes you back to the start.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: onSignOut },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>

        <Text style={styles.headerTitle}>Brand Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.helperText}>
          This shapes how AI-generated briefs sound and what they focus on for your brand.
        </Text>

        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Product" value={product} onChangeText={setProduct} multiline />
        <Field label="Audience" value={audience} onChangeText={setAudience} multiline />
        <Field label="Tone" value={tone} onChangeText={setTone} multiline />

        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{saved ? 'Saved ✓' : 'Save Profile'}</Text>
        </Pressable>
        <Pressable style={styles.signOutButton} onPress={handleSignOutPress}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </Pressable>
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
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  helperText: {
    fontSize: 13,
    color: '#888',
    marginBottom: 20,
    lineHeight: 18,
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
    minHeight: 70,
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
  signOutButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  signOutButtonText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '600',
  },
});