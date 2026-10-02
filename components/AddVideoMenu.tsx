// components/AddVideoMenu.tsx
// What the "+" opens (Figma: "Menu nav", 18:647): a dark card above the tab bar
// listing the ways to add a video. Only the camera roll exists today; screen
// recordings and links can be added here as more rows.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_CLIP_SECONDS } from '../data/library';
import { colors, fonts, radius } from '../theme';

export default function AddVideoMenu({
  bottom,
  onCameraRoll,
  onClose,
}: {
  /** Distance from the screen's bottom edge to the top of the tab bar. */
  bottom: number;
  onCameraRoll: () => void;
  onClose: () => void;
}) {
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
        <Pressable
          onPress={onCameraRoll}
          accessibilityRole="button"
          style={({ pressed }) => [styles.option, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.optionIcon}>
            <View style={styles.optionIconInner} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.optionTitle}>Camera roll</Text>
            <Text style={styles.optionSub}>Multi-select what you saved earlier</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>BEST</Text>
          </View>
        </Pressable>
        <View style={styles.divider} />
        <Text style={styles.note}>Videos should be {MAX_CLIP_SECONDS} seconds or less in length</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(51,36,28,0.3)',
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
    backgroundColor: '#c5d6ae',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconInner: {
    width: 16,
    height: 13,
    borderRadius: 3,
    borderWidth: 1.6,
    borderColor: colors.ink,
  },
  optionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.cream,
  },
  optionSub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: 'rgba(251,247,244,0.5)',
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(251,247,244,0.12)',
  },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: 'rgba(251,247,244,0.7)',
  },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(251,247,244,0.1)',
    marginBottom: 14,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: 'rgba(251,247,244,0.45)',
  },
});
