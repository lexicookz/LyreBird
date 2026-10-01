// components/ui.tsx
// Small building blocks shared across the redesigned screens. Measurements are
// from the Figma onboarding frames (Branding form 1-4).
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radius } from '../theme';

/** Full-width dark button ("Continue", "Finish setup"). */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.primary,
        disabled && styles.primaryDisabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

/** Round grey back button with a chevron. */
export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
    >
      <View style={styles.backChevron} />
    </Pressable>
  );
}

/** Small uppercase label above a field or section ("BRAND NAME"). */
export function Eyebrow({
  children,
  color = colors.textLabel,
}: {
  children: string;
  color?: string;
}) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}

/** Rounded pill. Selected chips go green and semibold. */
export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Segmented progress bar: `current` of `total` segments filled. */
export function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.progress} accessibilityLabel={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.progressSegment, i < current && styles.progressSegmentDone]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
  },
  primary: {
    height: 54,
    borderRadius: radius.field,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: {
    opacity: 0.35,
  },
  primaryLabel: {
    fontFamily: fonts.heading,
    fontSize: 15.5,
    color: colors.cream,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    width: 10,
    height: 10,
    marginLeft: 4,
    borderLeftWidth: 1.6,
    borderBottomWidth: 1.6,
    borderColor: colors.textStrong,
    transform: [{ rotate: '45deg' }],
  },
  eyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
  },
  chipSelected: {
    backgroundColor: colors.green,
  },
  chipLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textStrong,
  },
  chipLabelSelected: {
    fontFamily: fonts.bodySemiBold,
    color: colors.ink,
  },
  progress: {
    flexDirection: 'row',
    gap: 5,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
  },
  progressSegmentDone: {
    backgroundColor: colors.ink,
  },
});
