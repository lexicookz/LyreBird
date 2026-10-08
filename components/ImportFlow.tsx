// components/ImportFlow.tsx
// Getting videos from the camera roll into the library:
//   "+" -> (first time) photo-access sheet -> the phone's own picker
//       -> "N videos selected" bar -> Import.
// Uses the system picker rather than the custom "Pick your saves" grid in Figma:
// a custom grid needs full media-library access, which Expo Go can't get on Android.
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import BottomSheet from './BottomSheet';
import { PrimaryButton } from './ui';
import { MAX_CLIP_SECONDS } from '../data/library';
import { fonts, pagePadding, radius, Colors, useStyles, useTheme } from '../theme';

/** Drives the import flow; render <ImportFlowUI> with what it returns. */
export function useVideoImport() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pending, setPending] = useState<ImagePicker.ImagePickerAsset[]>([]);

  async function openPicker() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 0,
      quality: 1,
    });
    if (result.canceled) return;

    const fits = result.assets.filter(
      (a) => !a.duration || a.duration / 1000 <= MAX_CLIP_SECONDS
    );
    const skipped = result.assets.length - fits.length;
    if (skipped > 0) {
      Alert.alert(
        'Some videos were too long',
        `${skipped} video${skipped === 1 ? ' was' : 's were'} over ${MAX_CLIP_SECONDS} seconds and ${skipped === 1 ? 'was' : 'were'} left out.`
      );
    }
    if (fits.length > 0) setPending(fits);
  }

  /** Called by the "+" button and the empty state's CTA. */
  async function start() {
    const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    // Explain once, before the system prompt. After that, go straight to the
    // picker: it works even with limited or no access, since the user picks.
    if (!permission.granted && permission.canAskAgain && permission.status === 'undetermined') {
      setSheetVisible(true);
    } else {
      await openPicker();
    }
  }

  async function continueFromSheet() {
    setSheetVisible(false);
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    await openPicker();
  }

  return {
    start,
    sheetVisible,
    closeSheet: () => setSheetVisible(false),
    continueFromSheet,
    pending,
    clearPending: () => setPending([]),
  };
}

// ---------- photo-access sheet ----------

function SmileTile() {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.tile}>
      <View style={styles.eyes}>
        <View style={styles.eye} />
        <View style={styles.eye} />
      </View>
      <View style={styles.smile} />
    </View>
  );
}

export function PhotoAccessSheet({
  visible,
  onContinue,
  onClose,
}: {
  visible: boolean;
  onContinue: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const ios = Platform.OS === 'ios';
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <SmileTile />
      <Text style={styles.sheetTitle}>We need to see your saved videos</Text>
      <Text style={styles.sheetBody}>
        {ios ? "Next screen is Apple's. Choose " : 'Next screen is from your phone. Choose '}
        <Text style={styles.bold}>{ios ? 'Allow Full Access' : 'Allow'}</Text>
        {' so your saved videos are ready to pick.'}
      </Text>
      <View style={styles.points}>
        <View style={styles.point}>
          <View style={[styles.pointDot, { backgroundColor: colors.green }]} />
          <Text style={styles.pointText}>
            We only read videos, never photos, and nothing leaves your phone until you pick it.
          </Text>
        </View>
        <View style={styles.point}>
          <View style={[styles.pointDot, { backgroundColor: colors.peach }]} />
          <Text style={styles.pointText}>
            {ios ? (
              <>
                <Text style={styles.italic}>Limited Access</Text> is fine too. You still choose
                every video yourself.
              </>
            ) : (
              'Choosing only some videos is fine too. You still choose every video yourself.'
            )}
          </Text>
        </View>
      </View>
      <PrimaryButton label="Continue" onPress={onContinue} />
      <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" style={styles.notNow}>
        <Text style={styles.notNowText}>Not now</Text>
      </Pressable>
    </BottomSheet>
  );
}

// ---------- "N videos selected" bar ----------

export function ImportBar({
  count,
  onImport,
  onCancel,
  bottom,
}: {
  count: number;
  onImport: () => void;
  onCancel: () => void;
  /** Distance from the bottom of the screen (sits just above the tab bar). */
  bottom: number;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.bar, { bottom }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.barTitle}>
          {count} video{count === 1 ? '' : 's'} selected
        </Text>
        <Text style={styles.barSub}>Analysis starts as soon as they land</Text>
      </View>
      <Pressable
        onPress={onCancel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Cancel import"
        style={styles.barCancel}
      >
        <View style={[styles.crossBar, { transform: [{ rotate: '45deg' }] }]} />
        <View style={[styles.crossBar, { transform: [{ rotate: '-45deg' }] }]} />
      </Pressable>
      <Pressable
        onPress={onImport}
        accessibilityRole="button"
        style={({ pressed }) => [styles.barButton, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.barButtonText}>Import</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  // sheet
  tile: {
    width: 52,
    height: 52,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 14,
  },
  eyes: {
    flexDirection: 'row',
    gap: 12,
  },
  eye: {
    width: 4,
    height: 7,
    borderRadius: 2,
    backgroundColor: colors.onPastel,
  },
  smile: {
    width: 16,
    height: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 1.8,
    borderTopWidth: 0,
    borderColor: colors.onPastel,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 28,
    letterSpacing: -1,
    color: colors.ink,
    marginBottom: 10,
  },
  sheetBody: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textMuted,
    marginBottom: 16,
  },
  bold: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
  },
  italic: {
    fontStyle: 'italic',
  },
  points: {
    gap: 8,
    marginBottom: 18,
  },
  point: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: colors.field,
    borderRadius: radius.card,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  pointDot: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    marginTop: 1,
  },
  pointText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textStrong,
  },
  notNow: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  notNowText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.textLabel,
  },

  // bar
  bar: {
    position: 'absolute',
    left: pagePadding,
    right: pagePadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.ink,
    borderRadius: radius.field,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 13,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  barTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.cream,
  },
  barSub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.creamSoft,
  },
  barCancel: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crossBar: {
    position: 'absolute',
    width: 12,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.creamSoft,
  },
  barButton: {
    backgroundColor: colors.peach,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  barButtonText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    color: colors.ink,
  },
});
