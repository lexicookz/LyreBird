// components/VideoPlayerModal.tsx
// Watch a saved clip, full screen, with the phone's own controls (play/pause,
// scrub, full screen). The video is the 480p copy /prepare keeps in the private
// `clips` bucket, played from a short-lived signed link.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { signedVideoUrl } from '../lib/clips';
import { fonts, radius, Colors, useStyles } from '../theme';

/** Only mounted once there's a link, so the player starts with a real source. */
function Player({ url }: { url: string }) {
  const styles = useStyles(makeStyles);
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
      testID="video-player"
    />
  );
}

export default function VideoPlayerModal({
  visible,
  storagePath,
  title,
  onClose,
}: {
  visible: boolean;
  storagePath: string;
  title?: string | null;
  onClose: () => void;
}) {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setUrl(null);
    setFailed(false);
    signedVideoUrl(storagePath)
      .then((u) => {
        if (!active) return;
        if (u) setUrl(u);
        else setFailed(true);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [visible, storagePath]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.root}>
        {url ? (
          <Player url={url} />
        ) : failed ? (
          <Text style={styles.message}>This video can't be played. It may still be uploading, or it was deleted.</Text>
        ) : (
          <ActivityIndicator color="#ffffff" size="large" accessibilityLabel="Loading video" />
        )}
        <View style={[styles.top, { top: insets.top + 8 }]}>
          {!!title && (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          )}
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close video"
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// The player is always on black, in both themes, like every video app.
const makeStyles = (_colors: Colors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  message: {
    color: '#ffffff',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  top: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
  },
  close: {
    marginLeft: 'auto',
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 24,
  },
});
