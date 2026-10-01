// screens/BriefsScreen.tsx
import React from 'react';
import { View, Text, Image, FlatList, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mockBriefs, mockClips } from '../data/mockVideos';
import { Brief, Clip } from '../types';

function BriefCard({ brief, onPress }: { brief: Brief; clip?: Clip; onPress: () => void }) {
  const clip = mockClips.find((c) => c.id === brief.clip_id);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {clip && (
        <Image source={{ uri: clip.thumbnail_url ?? undefined }} style={styles.thumbnail} />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.hook} numberOfLines={2}>{brief.hook}</Text>
        {clip && (
          <Text style={styles.source} numberOfLines={1}>From: {clip.title ?? 'Untitled clip'}</Text>
        )}
        <Text style={styles.status}>{brief.status}</Text>
      </View>
    </Pressable>
  );
}

export default function BriefsScreen({
  onSelectBrief,
}: {
  onSelectBrief: (brief: Brief, clip: Clip) => void;
}) {
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'left', 'right']}
    >
      <Text style={styles.header}>Briefs</Text>

      {mockBriefs.length === 0 ? (
        <Text style={styles.emptyText}>No briefs yet.</Text>
      ) : (
        <FlatList
          data={mockBriefs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const clip = mockClips.find((c) => c.id === item.clip_id);
            return (
              <BriefCard
                brief={item}
                clip={clip}
                onPress={() => {
                  if (clip) onSelectBrief(item, clip);
                }}
              />
            );
          }}
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
  header: {
    fontSize: 28,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
  hook: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  source: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  status: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
    textTransform: 'capitalize',
  },
});