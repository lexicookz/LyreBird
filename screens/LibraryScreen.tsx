// screens/LibraryScreen.tsx
import React from 'react';
import { View, Text, Image, FlatList, StyleSheet, SafeAreaView } from 'react-native';
import { mockVideos } from '../data/mockVideos';
import { Video } from '../types';

function VideoCard({ video }: { video: Video }) {
  return (
    <View style={styles.card}>
      <Image source={{ uri: video.thumbnailUrl }} style={styles.thumbnail} />
      <View style={styles.cardBody}>
        <Text style={styles.title} numberOfLines={2}>{video.title}</Text>
        <Text style={styles.status}>{video.status}</Text>
        <View style={styles.tagRow}>
          {video.tags.map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function LibraryScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Text style={styles.header}>Library</Text>
      <FlatList
        data={mockVideos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <VideoCard video={item} />}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  thumbnail: {
    width: 90,
    height: 120,
  },
  cardBody: {
    flex: 1,
    padding: 10,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  status: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
    textTransform: 'capitalize',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    color: '#333',
  },
});