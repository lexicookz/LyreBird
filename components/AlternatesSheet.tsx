// components/AlternatesSheet.tsx
// "3 alternates" on the brief: three other ways to open the same video, written
// by the AI. Picking one puts it in the hook line as a normal edit; nothing
// else about the brief changes.
//
// The hooks are kept while the brief is open, so closing and reopening the
// sheet doesn't spend another AI call. "Get 3 more" asks again on purpose.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BottomSheet from './BottomSheet';
import { ScalePressable } from './motion';
import { HookOption, requestAlternates } from '../lib/briefs';
import { tap } from '../lib/haptics';
import { fonts, radius, Colors, useStyles, useTheme } from '../theme';

export default function AlternatesSheet({
  visible,
  briefId,
  onPick,
  onClose,
}: {
  visible: boolean;
  briefId: string;
  onPick: (hook: HookOption) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [hooks, setHooks] = useState<HookOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setHooks(await requestAlternates(briefId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't write other hooks.");
    } finally {
      setLoading(false);
    }
  }

  // First open asks the AI; later opens show what it already wrote.
  useEffect(() => {
    if (visible && !hooks && !loading) load();
  }, [visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView style={styles.scroll} bounces={false}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.title}>Other hooks</Text>
            <Text style={styles.subtitle}>Pick one to use it as your hook line.</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <View style={[styles.closeBar, { transform: [{ rotate: '45deg' }] }]} />
            <View style={[styles.closeBar, { transform: [{ rotate: '-45deg' }] }]} />
          </Pressable>
        </View>

        {loading && (
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.textFaint} />
            <Text style={styles.loadingText}>Writing 3 other hooks…</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={load} style={styles.retry} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && hooks && (
          <View style={{ gap: 10 }}>
            {hooks.map((hook, i) => (
              <ScalePressable
                key={`${i}-${hook.line}`}
                onPress={() => {
                  tap();
                  onPick(hook);
                }}
                style={styles.option}
                accessibilityRole="button"
                accessibilityLabel={`Use hook: ${hook.line}`}
              >
                <Text style={styles.optionLine}>{hook.line}</Text>
                {!!hook.on_screen_text && (
                  <Text style={styles.optionMeta}>On screen: {hook.on_screen_text}</Text>
                )}
                {!!hook.visual && <Text style={styles.optionMeta}>Shot: {hook.visual}</Text>}
              </ScalePressable>
            ))}
            <Pressable onPress={load} style={styles.more} accessibilityRole="button">
              <Text style={styles.moreText}>Get 3 more</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  scroll: {
    maxHeight: 640,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: -1,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textMuted,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBar: {
    position: 'absolute',
    width: 12,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.textStrong,
  },
  loading: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 36,
  },
  loadingText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  error: {
    gap: 12,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.pink,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.onPastel,
  },
  retry: {
    alignSelf: 'flex-start',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.onPastel,
  },
  retryText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.onPastelInverse,
  },
  option: {
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.card,
    backgroundColor: colors.green,
  },
  optionLine: {
    fontFamily: fonts.heading,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.3,
    color: colors.onPastel,
  },
  optionMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: colors.onPastelBody,
  },
  more: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 2,
  },
  moreText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textLabel,
  },
});
