// components/AddVideoMenu.tsx
// What the "+" opens (Figma: "Menu nav", 18:647): a dark card above the tab bar
// listing the ways to add a video: from the camera roll, or one screen
// recording of a scroll that the worker splits into clips.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScalePressable } from './motion';
import { MAX_CLIP_SECONDS } from '../data/library';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radius, Colors, useStyles, useTheme } from '../theme';
import { ImagePickerAsset } from 'expo-image-picker';

export default function AddVideoMenu({
  bottom,
  onCameraRoll,
  onScreenRecording,
  onClose,
}: {
  /** Distance from the screen's bottom edge to the top of the tab bar. */
  bottom: number;
  onCameraRoll: () => void;
  /** One long recording of a scroll, split into clips by the worker. */
  onScreenRecording: () => void;
  onClose: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <>
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        // The "×" on the tab bar is the accessible way to close; this is just tap-outside.
        accessible={false}
        importantForAccessibility="no"
      />
      <View style={[styles.card, { bottom }]}>
        <Text style={styles.title}>Add a video</Text>
        <ScalePressable
          onPress={onCameraRoll}
          accessibilityRole="button"
          style={({ pressed }) => [styles.option, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.optionIcon}>
            <Ionicons name="images-outline" size={17} color={colors.onPastel} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.optionTitle}>Camera roll</Text>
            <Text style={styles.optionSub}>Multi-select what you saved earlier</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>BEST</Text>
          </View>
        </ScalePressable>
        <ScalePressable
          onPress={onScreenRecording}
          accessibilityRole="button"
          style={({ pressed }) => [styles.option, pressed && { opacity: 0.8 }]}
        >
          <View style={[styles.optionIcon, { backgroundColor: colors.lilac }]}>
            <Ionicons name="phone-portrait-outline" size={17} color={colors.onPastel} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.optionTitle}>Screen recording</Text>
            <Text style={styles.optionSub}>One long scroll, split into separate videos</Text>
          </View>
        </ScalePressable>
        <View style={styles.divider} />
        <Text style={styles.note}>
          Camera roll videos should be {MAX_CLIP_SECONDS} seconds or less. Recordings can be longer.
        </Text>
      </View>
    </>
  );
}



const makeStyles = (colors: Colors) => StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
  },
  card: {
    position: 'absolute',
    left: 41,
    right: 41,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: colors.ink,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.cream,
    textAlign: 'center',
    marginBottom: 14,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingBottom: 14,
  },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.cream,
  },
  optionSub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.creamSoft,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.creamFaint,
  },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.creamSoft,
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.creamFaint,
    marginBottom: 14,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.creamMuted,
  },
});
