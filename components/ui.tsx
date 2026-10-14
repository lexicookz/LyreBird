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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, pagePadding, radius, Colors, useStyles, useTheme } from '../theme';

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
  const styles = useStyles(makeStyles);
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
  const styles = useStyles(makeStyles);
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
  color,
}: {
  children: string;
  color?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return <Text style={[styles.eyebrow, { color: color ?? colors.textLabel }]}>{children}</Text>;
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
  const styles = useStyles(makeStyles);
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

/**
 * The brand's initial on its colour. A circle in screen headers (it opens
 * Settings); a rounded square on Settings and Branding. Grey and empty when
 * there's no brand name yet.
 */
export function BrandMark({
  name,
  color,
  size = 34,
  shape = 'circle',
  onPress,
  accessibilityLabel,
}: {
  name?: string;
  /** A hex colour, e.g. from colors[brandColorOf(setup)]. */
  color?: string;
  size?: number;
  shape?: 'circle' | 'square';
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const initial = (name?.trim()[0] ?? '').toUpperCase();
  const style = [
    styles.mark,
    {
      width: size,
      height: size,
      borderRadius: shape === 'circle' ? radius.pill : radius.card,
      backgroundColor: initial && color ? color : colors.track,
    },
  ];
  const letter = !!initial && (
    <Text style={[styles.markText, { fontSize: Math.round(size * 0.4) }]}>{initial}</Text>
  );
  if (!onPress) return <View style={style}>{letter}</View>;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {letter}
    </Pressable>
  );
}

/**
 * A dismissible message pinned near the top of the screen, for things that
 * went wrong in the background (a save that didn't reach Supabase, a failed
 * upload). Render it last so it sits above the screen.
 */
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.errorBanner, { top: insets.top + 8 }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Text style={styles.errorText}>{message}</Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss message"
        style={styles.errorClose}
      >
        <Text style={styles.errorCloseText}>×</Text>
      </Pressable>
    </View>
  );
}

/** Segmented progress bar: `current` of `total` segments filled. */
export function StepProgress({ current, total }: { current: number; total: number }) {
  const styles = useStyles(makeStyles);
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

const makeStyles = (colors: Colors) => StyleSheet.create({
  errorBanner: {
    position: 'absolute',
    left: pagePadding,
    right: pagePadding,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: radius.card,
    backgroundColor: colors.pink,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.onPastel,
  },
  errorClose: {
    width: 20,
    alignItems: 'center',
  },
  errorCloseText: {
    fontFamily: fonts.body,
    fontSize: 18,
    lineHeight: 18,
    color: colors.onPastelBody,
  },
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
    color: colors.onPastel,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    fontFamily: fonts.heading,
    color: colors.onPastel,
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
