// components/RecordingProgress.tsx
// Where a screen-recording import is up to, floating above the tab bar. A
// split can take minutes, so it shows a real estimate and a moving bar rather
// than a spinner that looks like a hang.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RecordingImport } from '../data/recordings';
import { Appear } from './motion';
import { fonts, pagePadding, radius, Colors, useStyles, useTheme } from '../theme';

function minutes(seconds: number) {
  if (seconds < 60) return 'under a minute';
  const m = Math.round(seconds / 60);
  return `about ${m} min`;
}

export default function RecordingProgress({
  state,
  bottom,
  onRetry,
  onDismiss,
}: {
  state: RecordingImport;
  bottom: number;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [now, setNow] = useState(Date.now());

  // Tick while splitting so the estimate and bar move.
  useEffect(() => {
    if (state.phase !== 'splitting') return;
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, [state.phase]);

  if (state.phase === 'idle') return null;

  let title = '';
  let detail = '';
  let progress: number | null = null;
  let busy = false;

  switch (state.phase) {
    case 'uploading':
      title = 'Uploading your recording…';
      detail = 'Keep the app open until this finishes.';
      busy = true;
      break;
    case 'splitting': {
      const elapsed = (now - state.startedAt) / 1000;
      const left = Math.max(0, state.estimateSeconds - elapsed);
      title = 'Splitting your recording into videos…';
      detail = left > 0 ? `${minutes(left)} left` : 'Almost there…';
      // Never claims to be finished before it is.
      progress = Math.min(0.95, elapsed / state.estimateSeconds);
      busy = true;
      break;
    }
    case 'analysing':
      title = `Analysing video ${Math.min(state.done + 1, state.total)} of ${state.total}`;
      detail = 'Your new videos are in the Library. Their breakdowns appear as each one finishes.';
      progress = state.total ? state.done / state.total : null;
      busy = true;
      break;
    case 'done':
      title = `Your recording became ${state.clips} video${state.clips === 1 ? '' : 's'}`;
      detail = 'They are in your Library, in the order you scrolled them.';
      break;
    case 'failed':
      title = "That recording didn't go through";
      detail = state.message;
      break;
  }

  const failed = state.phase === 'failed';
  return (
    <Appear
      from="bottom"
      style={[styles.card, { bottom, backgroundColor: failed ? colors.pink : colors.sky }]}
      accessibilityRole={failed ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        {busy && <ActivityIndicator color={colors.onPastel} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{title}</Text>
          {!!detail && <Text style={styles.detail}>{detail}</Text>}
        </View>
        {failed && state.recordingId && (
          <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        )}
        {!busy && (
          <Pressable
            onPress={onDismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Text style={styles.close}>×</Text>
          </Pressable>
        )}
      </View>
      {progress !== null && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(4, progress * 100)}%` }]} />
        </View>
      )}
    </Appear>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  card: {
    position: 'absolute',
    left: pagePadding,
    right: pagePadding,
    borderRadius: radius.field,
    paddingHorizontal: 15,
    paddingVertical: 13,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.onPastel,
  },
  detail: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.onPastelBody,
  },
  retry: {
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
  close: {
    fontSize: 20,
    lineHeight: 20,
    color: colors.onPastelBody,
  },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.frost,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.onPastel,
  },
});
