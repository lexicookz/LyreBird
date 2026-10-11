// screens/OpenerScreen.tsx
// First thing a new user sees (Figma: "Opener option 3", 18:1563).
// Shown once; App.tsx remembers when onboarding is done.
import React from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, radius, Colors, useStyles, useTheme } from '../theme';

const DESIGN_WIDTH = 402;

const STAGE_MASCOTS: { label: string; source: ImageSourcePropType; mirrored?: boolean }[] = [
  { label: 'Aware', source: require('../assets/mascots/aware.png') },
  { label: 'Consider', source: require('../assets/mascots/consider.png'), mirrored: true },
  { label: 'Convert', source: require('../assets/mascots/convert.png') },
  { label: 'Ready', source: require('../assets/mascots/ready.png') },
];

/** A tilted label floating around the mascot ("hook in 3s"). */
function FloatingTag({
  label,
  color,
  rotate,
  style,
}: {
  label: string;
  color: string;
  rotate: string;
  style: object;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.tag, { backgroundColor: color, transform: [{ rotate }] }, style]}>
      <Text style={styles.tagLabel}>{label}</Text>
    </View>
  );
}

export default function OpenerScreen({
  onStart,
  onSkip,
}: {
  onStart: () => void;
  onSkip: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { width } = useWindowDimensions();
  // The hero artwork is absolutely positioned, so scale it with the screen.
  const s = width / DESIGN_WIDTH;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>LYREBIRD</Text>
          <Pressable onPress={onSkip} hitSlop={10} accessibilityRole="button">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        {/* Hero: mascot with pastel shapes and floating tags (positions from Figma). */}
        <View style={{ height: 320 * s }}>
          <View style={[styles.shape, { backgroundColor: colors.pink, left: 320 * s, top: 12 * s, width: 128 * s, height: 118 * s }]} />
          <View style={[styles.shape, { backgroundColor: colors.sky, left: -38 * s, top: 180 * s, width: 96 * s, height: 92 * s }]} />
          <View style={[styles.shape, { backgroundColor: colors.peach, left: 346 * s, top: 228 * s, width: 34 * s, height: 34 * s, transform: [{ rotate: '12deg' }] }]} />
          <View style={[styles.dot, { left: 130 * s, top: 8 * s, width: 22 * s, height: 22 * s }]} />
          <Image
            source={require('../assets/mascots/hero.png')}
            style={[styles.hero, { left: 54 * s, top: 38 * s, width: 290 * s, height: 274 * s }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <FloatingTag label="hook in 3s" color={colors.green} rotate="-9deg" style={{ left: 22 * s, top: 34 * s }} />
          <FloatingTag label="ready to film" color={colors.sky} rotate="6deg" style={{ left: 22 * s, top: 280 * s }} />
          <FloatingTag label="shot list" color={colors.pink} rotate="8deg" style={{ left: 302 * s, top: 306 * s }} />
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>Hi. Let's start creating</Text>
          <Text style={styles.body}>
            Save the videos you keep meaning to copy. We'll tell you why they work and
            write you a version you can film.
          </Text>
        </View>

        <View style={styles.stages}>
          {STAGE_MASCOTS.map((m) => (
            <View key={m.label} style={styles.stage}>
              <Image
                source={m.source}
                style={[styles.stageImage, m.mirrored && styles.mirrored]}
                resizeMode="contain"
              />
              <Text style={styles.stageLabel}>{m.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={onStart}
            accessibilityRole="button"
            style={({ pressed }) => [styles.ctaShadow, pressed && { opacity: 0.9 }]}
          >
            <LinearGradient
              colors={['#cfc5f2', '#ede8fb']}
              locations={[0.08, 0.89]}
              start={{ x: 0.46, y: 0 }}
              end={{ x: 0.54, y: 1 }}
              style={styles.cta}
            >
              <Text style={styles.ctaLabel}>Start collecting</Text>
              <View style={styles.ctaChevron} />
            </LinearGradient>
          </Pressable>
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
    flexGrow: 1,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingTop: 16,
    marginBottom: 30,
  },
  wordmark: {
    fontFamily: fonts.body,
    fontSize: 12,
    letterSpacing: 1.92,
    color: colors.textEyebrow,
  },
  skip: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.textPlaceholder,
  },
  shape: {
    position: 'absolute',
    borderRadius: 15,
  },
  dot: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: colors.lilac,
  },
  hero: {
    position: 'absolute',
  },
  tag: {
    position: 'absolute',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  tagLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.onPastel,
  },
  copy: {
    paddingHorizontal: 30,
    gap: 12,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 38,
    letterSpacing: -1.52,
    color: colors.ink,
    paddingTop: 4,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14.5,
    lineHeight: 21.75,
    color: colors.textMuted,
  },
  stages: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    marginTop: 20,
  },
  stage: {
    alignItems: 'center',
    gap: 9,
  },
  stageImage: {
    width: 60,
    height: 58,
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
  stageLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10.5,
    color: colors.textMuted,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 28,
    paddingHorizontal: 26,
  },
  ctaShadow: {
    borderRadius: radius.pill,
    shadowColor: '#9682dc',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 9,
    elevation: 4,
  },
  cta: {
    height: 64,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  ctaLabel: {
    fontFamily: fonts.heading,
    fontSize: 17,
    letterSpacing: -0.34,
    color: colors.onPastel,
  },
  ctaChevron: {
    width: 9,
    height: 9,
    borderTopWidth: 2.4,
    borderRightWidth: 2.4,
    borderColor: colors.onPastel,
    transform: [{ rotate: '45deg' }],
  },
});
