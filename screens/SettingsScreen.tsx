// screens/SettingsScreen.tsx
// Figma: "Settings" (121:227). Rows that need something not built yet are left
// out rather than shown dead: the plan card (no plans/billing), "Analyse on
// open" (analysis always runs on import), and "Delete account" (no real accounts).
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScalePressable } from '../components/motion';
import * as ImagePicker from 'expo-image-picker';
import { BackButton, BrandMark } from '../components/ui';
import { fonts, pagePadding, radius, Appearance, Colors, useStyles, useTheme } from '../theme';

function photoAccessLabel(p: ImagePicker.MediaLibraryPermissionResponse | null) {
  if (!p) return null;
  if (p.status === 'undetermined') return 'Not asked';
  if (!p.granted) return 'Off';
  if (p.accessPrivileges === 'limited') return 'Limited';
  return 'All photos';
}

function Chevron() {
  const styles = useStyles(makeStyles);
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
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <ScalePressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
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
    </ScalePressable>
  );
}

const APPEARANCE_OPTIONS: { key: Appearance; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

export default function SettingsScreen({
  brandName,
  brandColor,
  email,
  brandComplete,
  onOpenBrand,
  onExportBriefs,
  onSignOut,
  onBack,
}: {
  brandName?: string;
  brandColor?: string;
  email?: string;
  /** Whether the brand profile has its main answers filled in. */
  brandComplete: boolean;
  onOpenBrand: () => void;
  onExportBriefs: () => void;
  onSignOut: () => void;
  onBack: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { appearance, setAppearance } = useTheme();
  const [photos, setPhotos] = useState<ImagePicker.MediaLibraryPermissionResponse | null>(null);

  useEffect(() => {
    ImagePicker.getMediaLibraryPermissionsAsync()
      .then(setPhotos)
      .catch(() => setPhotos(null));
  }, []);

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your videos, briefs and brand stay saved in your account for when you log back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>Settings</Text>

        <ScalePressable onPress={onOpenBrand} style={styles.account} accessibilityRole="button">
          <BrandMark name={brandName} color={brandColor} size={42} shape="square" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.accountName}>{brandName || 'Your brand'}</Text>
            {!!email && <Text style={styles.accountEmail}>{email}</Text>}
          </View>
          <Chevron />
        </ScalePressable>

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

        <Text style={styles.section}>APPEARANCE</Text>
        <View style={[styles.group, styles.appearanceGroup]}>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {APPEARANCE_OPTIONS.map((option) => {
              const active = appearance === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setAppearance(option.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.appearanceHint}>
            {appearance === 'system' ? 'Follows your phone’s light or dark setting.' : `Always ${appearance}.`}
          </Text>
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

const makeStyles = (colors: Colors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
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
  accountName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14.5,
    color: colors.onPastel,
  },
  accountEmail: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onPastelBody,
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
    backgroundColor: colors.surface,
    paddingHorizontal: 15,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  appearanceGroup: {
    paddingVertical: 12,
    gap: 10,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
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
  appearanceHint: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 15,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: colors.divider,
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
    color: colors.onPastel,
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
