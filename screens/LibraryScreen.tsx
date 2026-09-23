// screens/LibraryScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { fetchLibrary, uploadClipFromCameraRoll, UploadCancelled } from '../lib/clips';
import { useUserId } from '../lib/session';
import { Video, Analysis } from '../types';

// Maps the stored pipeline values to the friendly labels Alicia's designs use.
const FUNNEL_FILTERS: { key: 'all' | 'TOFU' | 'MOFU' | 'BOFU'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'TOFU', label: 'Awareness' },
  { key: 'MOFU', label: 'Consider' },
  { key: 'BOFU', label: 'Convert' },
];

function VideoCard({ video, onSelectVideo }: { video: Video; onSelectVideo: (video: Video) => void }) {
  return (
    <Pressable style={styles.card} onPress={() => onSelectVideo(video)}>
      <Image source={{ uri: video.thumbnail_url ?? undefined }} style={styles.thumbnail} />
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
    </Pressable>
  );
}

export default function LibraryScreen({
  onSelectVideo,
  onOpenBrandProfile,
  onOpenCalendar,
}: {
  onSelectVideo: (video: Video) => void;
  onOpenBrandProfile: () => void;
  onOpenCalendar: () => void;
}) {
  const userId = useUserId();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'TOFU' | 'MOFU' | 'BOFU'>('all');

  const [videos, setVideos] = useState<Video[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { clips, analyses: rows } = await fetchLibrary();
      setVideos(clips);
      setAnalyses(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your library.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleUpload() {
    if (!userId || uploading) return;
    setUploading(true);
    try {
      await uploadClipFromCameraRoll(userId);
      // Re-read rather than pushing the returned row onto the list: the
      // refresh is the thing worth knowing works, and it keeps ordering and
      // any server-set defaults honest.
      await load();
    } catch (e) {
      // Backing out of the picker is not an error worth an alert.
      if (!(e instanceof UploadCancelled)) {
        Alert.alert('Upload failed', e instanceof Error ? e.message : 'Something went wrong.');
      }
    } finally {
      setUploading(false);
    }
  }

  const filteredVideos = videos.filter((video) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      query === '' ||
      (video.title ?? '').toLowerCase().includes(query) ||
      video.tags.some((tag) => tag.toLowerCase().includes(query));

    if (!matchesQuery) return false;

    if (activeFilter === 'all') return true;

    const analysis = analyses.find((a) => a.clip_id === video.id);
    return (analysis?.payload as { funnelStage?: string } | undefined)?.funnelStage === activeFilter;
  });

  function renderBody() {
    if (loading) {
      return (
        <View style={styles.centeredBody}>
          <ActivityIndicator />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centeredBody}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={handleRefresh}>
            <Text style={styles.retryLink}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    if (filteredVideos.length === 0) {
      // Distinguish "nothing uploaded yet" from "nothing matched", so a new
      // account is not told its search failed.
      const message =
        videos.length === 0
          ? 'No clips yet. Upload one from your camera roll to get started.'
          : 'No videos match your search.';
      return <Text style={styles.emptyText}>{message}</Text>;
    }

    return (
      <FlatList
        data={filteredVideos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <VideoCard video={item} onSelectVideo={onSelectVideo} />}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Library</Text>
        <View style={styles.headerLinks}>
          <Pressable onPress={handleUpload} disabled={uploading || !userId}>
            <Text style={[styles.headerLink, (uploading || !userId) && styles.headerLinkDisabled]}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Text>
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

      {renderBody()}
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
  headerLinkDisabled: {
    color: '#aaa',
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
  centeredBody: {
    marginTop: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#c0392b',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryLink: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
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
