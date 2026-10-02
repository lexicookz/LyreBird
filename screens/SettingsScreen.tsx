// screens/SettingsScreen.tsx
// Figma: "Settings" (121:227). Rows that need something not built yet are left
// out rather than shown dead: the plan card (no plans/billing), "Analyse on
// open" (analysis always runs on import), and "Delete account" (no real accounts).
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { BackButton } from '../components/ui';
import { colors, fonts, pagePadding, radius } from '../theme';

function photoAccessLabel(p: ImagePicker.MediaLibraryPermissionResponse | null) {
  if (!p) return null;
  if (p.status === 'undetermined') return 'Not asked';
  if (!p.granted) return 'Off';
  if (p.accessPrivileges === 'limited') return 'Limited';
  return 'All photos';
}

function Chevron() {
  return <View style={styles.chevron} />;
}

function Row({
  label,
  value,
  pill,
  danger = false,
  onPress,
  last = false,
}: {
  label: string;
  value?: string | null;
  /** Show the value as a green pill instead of grey text. */
  pill?: boolean;
  danger?: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.rowLabel, danger && { color: '#8a4b3c' }]}>{label}</Text>
      {value ? (
        pill ? (
          <View style={styles.valuePill}>
            <Text style={styles.valuePillText}>{value}</Text>
          </View>
        ) : (
          <Text style={styles.rowValue}>{value}</Text>
        )
      ) : null}
      <Chevron />
    </Pressable>
  );
}

export default function SettingsScreen({
  brandName,
  email,
  brandComplete,
  onOpenBrand,
  onExportBriefs,
  onSignOut,
  onBack,
}: {
  brandName?: string;
  email?: string;
  /** Whether the brand profile has its main answers filled in. */
  brandComplete: boolean;
  onOpenBrand: () => void;
  onExportBriefs: () => void;
  onSignOut: () => void;
  onBack: () => void;
}) {
  const [photos, setPhotos] = useState<ImagePicker.MediaLibraryPermissionResponse | null>(null);

  useEffect(() => {
    ImagePicker.getMediaLibraryPermissionsAsync()
      .then(setPhotos)
      .catch(() => setPhotos(null));
  }, []);

  function confirmSignOut() {
    Alert.alert('Sign out?', 'This clears your brand setup and takes you back to the start.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
    ]);
  }

  const initial = (brandName?.trim()[0] ?? '').toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>Settings</Text>

        <Pressable onPress={onOpenBrand} style={styles.account} accessibilityRole="button">
          <View style={styles.tile}>
            <Text style={styles.tileText}>{initial || '?'}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.accountName}>{brandName || 'Your brand'}</Text>
            {!!email && <Text style={styles.accountEmail}>{email}</Text>}
          </View>
          <Chevron />
        </Pressable>

        <Text style={styles.section}>CONTENT</Text>
        <View style={styles.group}>
          <Row
            label="Brand profile"
            value={brandComplete ? 'Complete' : 'Unfinished'}
            onPress={onOpenBrand}
          />
          <Row
            label="Photo access"
            value={photoAccessLabel(photos)}
            pill
            onPress={() => Linking.openSettings()}
            last
          />
        </View>

        <Text style={styles.section}>DATA</Text>
        <View style={styles.group}>
          <Row label="Export my briefs" onPress={onExportBriefs} />
          <Row label="Sign out" danger onPress={confirmSignOut} last />
        </View>
      </ScrollView>
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
    paddingBottom: 32,
    gap: 12,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: -1.2,
    color: colors.ink,
    marginTop: 4,
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius.card,
    backgroundColor: colors.lilac,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  tile: {
    width: 42,
    height: 42,
    borderRadius: radius.card,
    backgroundColor: colors.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.ink,
  },
  accountName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14.5,
    color: colors.ink,
  },
  accountEmail: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textBody,
  },
  section: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    color: colors.textLabel,
    marginTop: 8,
  },
  group: {
    borderRadius: radius.card,
    backgroundColor: colors.white,
    paddingHorizontal: 15,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 15,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: 'rgba(51,36,28,0.07)',
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  rowValue: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textFaint,
  },
  valuePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
  },
  valuePillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.ink,
  },
  chevron: {
    width: 7,
    height: 7,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: colors.textFaint,
    transform: [{ rotate: '45deg' }],
  },
});
