import React, { useState } from 'react';
import LibraryScreen from './screens/LibraryScreen';
import VideoDetailScreen from './screens/VideoDetailScreen';
import BriefScreen from './screens/BriefScreen';
import { mockBriefs } from './data/mockVideos';
import { Video } from './types';

type Screen = 'library' | 'detail' | 'brief';

export default function App() {
  const [screen, setScreen] = useState<Screen>('library');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  function handleSelectVideo(video: Video) {
    setSelectedVideo(video);
    setScreen('detail');
  }

  function handleBackToLibrary() {
    setSelectedVideo(null);
    setScreen('library');
  }

  function handleViewBrief() {
    setScreen('brief');
  }

  function handleBackToDetail() {
    setScreen('detail');
  }

  if (screen === 'brief' && selectedVideo) {
    const existingBrief = mockBriefs.find((b) => b.videoId === selectedVideo.id);
    return (
      <BriefScreen
        video={selectedVideo}
        existingBrief={existingBrief}
        onBack={handleBackToDetail}
      />
    );
  }

  if (screen === 'detail' && selectedVideo) {
    return (
      <VideoDetailScreen
        video={selectedVideo}
        onBack={handleBackToLibrary}
        onViewBrief={handleViewBrief}
      />
    );
  }

  return <LibraryScreen onSelectVideo={handleSelectVideo} />;
}
