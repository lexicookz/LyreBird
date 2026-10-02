// screens/LibraryScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mockVideos, mockAnalyses } from '../data/mockVideos';
import { Video } from '../types';

// Maps the stored pipeline values to the friendly labels Alicia's designs use.
const FUNNEL_FILTERS: { key: 'all' | 'TOFU' | 'MOFU' | 'BOFU'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'TOFU', label: 'Awareness' },
  { key: 'MOFU', label: 'Consider' },
  { key: 'BOFU', label: 'Convert' },
];

function VideoCard({
  video,
  onSelectVideo,
  onDelete,
}: {
  video: Video;
  onSelectVideo: (video: Video) => void;
  onDelete: (video: Video) => void;
}) {
  return (
    <Pressable style={styles.card} onPress={() => onSelectVideo(video)}>
      <Image source={{ uri: video.thumbnail_url ?? undefined }} style={styles.thumbnail} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.title} numberOfLines={2}>{video.title}</Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onDelete(video);
            }}
            hitSlop={8}
          >
            <Text style={styles.deleteIcon}>🗑</Text>
          </Pressable>
        </View>
        <Text style={styles.status}>{video.status}</Text>
        <View style={styles.tagRow}>
          {video.tags.map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

export default function LibraryScreen({
  onSelectVideo,
  onOpenBrandProfile,
  onOpenImport,
  onOpenCalendar,
}: {
  onSelectVideo: (video: Video) => void;
  onOpenBrandProfile: () => void;
  onOpenImport: () => void;
  onOpenCalendar: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'TOFU' | 'MOFU' | 'BOFU'>('all');
  const [videos, setVideos] = useState(mockVideos);

  function handleDeleteVideo(video: Video) {
    Alert.alert(
      'Delete video?',
      `"${video.title}" will be removed from your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => setVideos((prev) => prev.filter((v) => v.id !== video.id)),
        },
      ]
    );
  }
  const filteredVideos = videos.filter((video) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      query === '' ||
      (video.title ?? '').toLowerCase().includes(query) ||
      video.tags.some((tag) => tag.toLowerCase().includes(query));

    if (!matchesQuery) return false;

    if (activeFilter === 'all') return true;

    const analysis = mockAnalyses.find((a) => a.clip_id === video.id);
    return analysis?.payload.funnelStage === activeFilter;
  });

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.headerRow}>
        <Text style={styles.header}>Library</Text>
        <View style={styles.headerLinks}>
          <Pressable onPress={onOpenImport}>
            <Text style={styles.headerLink}>Import</Text>
          </Pressable>
          <Pressable onPress={onOpenBrandProfile}>
            <Text style={styles.headerLink}>Brand Profile</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search hooks, captions, tags"
          placeholderTextColor="#aaa"
        />
      </View>

      <View style={styles.filterRow}>
        {FUNNEL_FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              onPress={() => setActiveFilter(filter.key)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {filteredVideos.length === 0 ? (
        <Text style={styles.emptyText}>No videos match your search.</Text>
      ) : (
        <FlatList
          data={filteredVideos}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <VideoCard video={item} onSelectVideo={onSelectVideo} onDelete={handleDeleteVideo} />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerLinks: {
    flexDirection: 'row',
    gap: 14,
  },
  headerLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  deleteIcon: {
    fontSize: 16,
    marginLeft: 8,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  filterChip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
  },
  filterChipActive: {
    backgroundColor: '#111',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 40,
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
    flex: 1,
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

