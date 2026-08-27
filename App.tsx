import React, { useState } from 'react';
import LibraryScreen from './screens/LibraryScreen';
import VideoDetailScreen from './screens/VideoDetailScreen';
import { Video } from './types';

export default function App() {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  if (selectedVideo) {
    return (
      <VideoDetailScreen
        video={selectedVideo}
        onBack={() => setSelectedVideo(null)}
      />
    );
  }

  return <LibraryScreen onSelectVideo={setSelectedVideo} />;
}
