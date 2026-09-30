import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';

export default function ImportScreen() {
  const [videos, setVideos] = useState([]);

  const chooseVideos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to your camera roll to import videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled) setVideos((current) => [...current, ...result.assets]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>YOUR LIBRARY</Text>
        <Text style={styles.title}>Import videos</Text>
        <Text style={styles.subtitle}>Choose clips from your camera roll to add to your project.</Text>

        <TouchableOpacity style={styles.uploadCard} onPress={chooseVideos} activeOpacity={0.8}>
          <View style={styles.iconCircle}><Text style={styles.plus}>＋</Text></View>
          <Text style={styles.uploadTitle}>Select from camera roll</Text>
          <Text style={styles.uploadHint}>Browse and choose one or more videos</Text>
          <View style={styles.browseButton}><Text style={styles.browseText}>Browse videos</Text></View>
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Selected videos</Text>
          <Text style={styles.count}>{videos.length}</Text>
        </View>

        {videos.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>▧</Text>
            <Text style={styles.emptyTitle}>No videos selected</Text>
            <Text style={styles.emptyCopy}>Your chosen clips will appear here.</Text>
          </View>
        ) : (
          videos.map((video, index) => (
            <View key={`${video.uri}-${index}`} style={styles.videoRow}>
              <Video source={{ uri: video.uri }} style={styles.thumbnail} resizeMode="cover" useNativeControls={false} />
              <View style={styles.videoInfo}>
                <Text style={styles.videoName} numberOfLines={1}>{video.fileName || `Video ${index + 1}`}</Text>
                <Text style={styles.videoMeta}>{video.duration ? `${Math.round(video.duration / 1000)} sec` : 'Ready to import'}</Text>
              </View>
              <Text style={styles.check}>✓</Text>
            </View>
          ))
        )}

        {videos.length > 0 && (
          <TouchableOpacity style={styles.continueButton} onPress={() => Alert.alert('Videos ready', `${videos.length} video${videos.length === 1 ? '' : 's'} selected.`)}>
            <Text style={styles.continueText}>Continue</Text>
            <Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8FC' },
  container: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 },
  eyebrow: { color: '#6D62E8', fontSize: 11, fontWeight: '800', letterSpacing: 1.8, marginBottom: 10 },
  title: { color: '#17182B', fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: '#77798C', fontSize: 15, lineHeight: 22, marginTop: 9, marginBottom: 26 },
  uploadCard: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#DCD9FF', borderStyle: 'dashed', borderRadius: 20, alignItems: 'center', paddingVertical: 26, paddingHorizontal: 18 },
  iconCircle: { height: 54, width: 54, borderRadius: 27, backgroundColor: '#F0EFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  plus: { color: '#6D62E8', fontSize: 31, lineHeight: 36, fontWeight: '400' },
  uploadTitle: { color: '#202137', fontSize: 16, fontWeight: '700' },
  uploadHint: { color: '#898A9B', fontSize: 13, marginTop: 6 },
  browseButton: { backgroundColor: '#6D62E8', borderRadius: 11, paddingVertical: 12, paddingHorizontal: 22, marginTop: 19 },
  browseText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 30, marginBottom: 13 },
  sectionTitle: { color: '#202137', fontSize: 17, fontWeight: '700', flex: 1 },
  count: { color: '#77798C', fontSize: 13, backgroundColor: '#ECECF3', borderRadius: 10, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 3 },
  emptyState: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 27, alignItems: 'center', borderWidth: 1, borderColor: '#EEEEF3' },
  emptyIcon: { fontSize: 27, color: '#A6A5B8', marginBottom: 8 },
  emptyTitle: { color: '#434458', fontSize: 14, fontWeight: '700' },
  emptyCopy: { color: '#9697A6', fontSize: 12, marginTop: 5 },
  videoRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 10, marginBottom: 9, borderWidth: 1, borderColor: '#EEEEF3' },
  thumbnail: { width: 62, height: 54, borderRadius: 9, backgroundColor: '#E9E8F2' },
  videoInfo: { flex: 1, marginHorizontal: 12 },
  videoName: { color: '#25263A', fontSize: 14, fontWeight: '700' },
  videoMeta: { color: '#9293A2', fontSize: 12, marginTop: 5 },
  check: { color: '#6D62E8', fontSize: 18, fontWeight: '800', marginHorizontal: 7 },
  continueButton: { backgroundColor: '#6D62E8', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, marginTop: 16, flexDirection: 'row', alignItems: 'center' },
  continueText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center', paddingLeft: 18 },
  arrow: { color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
});