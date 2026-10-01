import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import LibraryScreen from './screens/LibraryScreen';
import BriefsScreen from './screens/BriefsScreen';
import VideoDetailScreen from './screens/VideoDetailScreen';
import BriefScreen from './screens/BriefScreen';
import BrandProfileScreen from './screens/BrandProfileScreen';
import CalendarScreen from './screens/CalendarScreen';
import OpenerScreen from './screens/OpenerScreen';
import BrandSetupScreen from './screens/BrandSetupScreen';
import {
  BrandSetup,
  applyBrandSetup,
  completeOnboarding,
  loadOnboarding,
} from './data/brandSetup';
import BottomTabBar, { TabKey, useTabBarSpace } from './components/BottomTabBar';
import { ImportBar, PhotoAccessSheet, useVideoImport } from './components/ImportFlow';
import { useLibrary } from './data/library';
import { stageForBrief, suggestDate, useCalendar } from './data/calendar';
import ScheduleSheet from './components/ScheduleSheet';
import { mockBriefs, mockBrandProfile } from './data/mockVideos';
import { Video, Brief, Clip } from './types';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { colors } from './theme';
import { fontAssets } from './theme/fontAssets';

// A "pushed" screen sits on top of the tabs, full-screen, no bottom bar.
type PushedScreen =
  | { type: 'detail'; clipId: string }
  | { type: 'brief'; video: Video; brief?: Brief }
  | { type: 'brandProfile' };

// First run: opener -> brand setup -> the app. Remembered on the device.
type OnboardingStage = 'loading' | 'opener' | 'brand' | 'done';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('library');
  const [pushed, setPushed] = useState<PushedScreen | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStage>('loading');
  const [brandSetup, setBrandSetup] = useState<BrandSetup | null>(null);
  const tabBarSpace = useTabBarSpace();
  const library = useLibrary();
  const videoImport = useVideoImport();
  const calendar = useCalendar();
  /** The brief whose schedule sheet is open, if any. */
  const [schedulingBriefId, setSchedulingBriefId] = useState<string | null>(null);

  useEffect(() => {
    loadOnboarding().then(({ onboarded, brand }) => {
      setBrandSetup(brand);
      setOnboarding(onboarded ? 'done' : 'opener');
    });
  }, []);

  function handleFinishOnboarding(setup: BrandSetup | null) {
    if (setup) setBrandSetup(setup);
    setOnboarding('done');
    // Not awaited: if the write fails the user just sees onboarding again next launch.
    completeOnboarding(setup).catch(() => {});
  }

  function handleSelectVideo(clip: Clip) {
    setPushed({ type: 'detail', clipId: clip.id });
  }

  function handleSelectBrief(brief: Brief, clip: Clip) {
    setPushed({ type: 'brief', video: clip, brief });
  }

  function handleViewBriefFromDetail(video: Video) {
    const existingBrief = mockBriefs.find((b) => b.clip_id === video.id);
    setPushed({ type: 'brief', video, brief: existingBrief });
  }

  function handleOpenBrandProfile() {
    setPushed({ type: 'brandProfile' });
  }

  function handleImport() {
    library.importVideos(videoImport.pending);
    videoImport.clearPending();
    setActiveTab('library');
  }

  function handleClosePushed() {
    setPushed(null);
  }

  if (onboarding === 'loading' || !library.loaded || !calendar.loaded) return null;

  if (onboarding === 'opener') {
    return (
      <OpenerScreen
        onStart={() => setOnboarding('brand')}
        onSkip={() => handleFinishOnboarding(null)}
      />
    );
  }

  if (onboarding === 'brand') {
    return (
      <BrandSetupScreen
        initial={brandSetup}
        onBack={() => setOnboarding('opener')}
        onDone={handleFinishOnboarding}
      />
    );
  }

  // Rendered over whichever screen opened it (the Calendar tab or a brief).
  const schedulingBrief = mockBriefs.find((b) => b.id === schedulingBriefId);
  const scheduleSheet = (
    <ScheduleSheet
      visible={!!schedulingBrief}
      hook={schedulingBrief?.hook ?? ''}
      existing={calendar.items.find((i) => i.briefId === schedulingBriefId)}
      defaultStage={schedulingBriefId ? stageForBrief(schedulingBriefId) : 'TOFU'}
      suggestedDate={suggestDate(calendar.items)}
      onSave={(values) => {
        if (schedulingBriefId) calendar.schedule({ briefId: schedulingBriefId, ...values });
        setSchedulingBriefId(null);
      }}
      onRemove={() => {
        if (schedulingBriefId) calendar.unschedule(schedulingBriefId);
        setSchedulingBriefId(null);
      }}
      onClose={() => setSchedulingBriefId(null)}
    />
  );

  // Pushed screens take over the full screen, no tab bar underneath.

  if (pushed?.type === 'brandProfile') {
    return (
      <BrandProfileScreen
        existingProfile={
          brandSetup ? applyBrandSetup(mockBrandProfile, brandSetup) : mockBrandProfile
        }
        onBack={handleClosePushed}
      />
    );
  }

  if (pushed?.type === 'brief') {
    const briefId = pushed.brief?.id;
    return (
      <>
        <BriefScreen
          video={pushed.video}
          existingBrief={pushed.brief}
          onBack={handleClosePushed}
          onSchedule={briefId ? () => setSchedulingBriefId(briefId) : undefined}
        />
        {scheduleSheet}
      </>
    );
  }

  // Look the clip up each render so a finished analysis shows straight away.
  const detailClip =
    pushed?.type === 'detail' ? library.clips.find((c) => c.id === pushed.clipId) : undefined;
  if (detailClip) {
    return (
      <VideoDetailScreen
        video={detailClip}
        analysis={library.analyses.find((a) => a.clip_id === detailClip.id)}
        onBack={handleClosePushed}
        onViewBrief={() => handleViewBriefFromDetail(detailClip)}
      />
    );
  }

  // Otherwise, render the active tab with the persistent bottom bar.
  function renderTabContent() {
    switch (activeTab) {
      case 'library':
      case 'search':
        // Search reuses the Library (with its search box) until the Search tab is designed.
        return (
          <LibraryScreen
            clips={library.clips}
            analyses={library.analyses}
            lastImportCount={library.lastImportCount}
            now={library.now}
            brandName={brandSetup?.name}
            focus={brandSetup?.focus}
            onSelectVideo={handleSelectVideo}
            onOpenBrandProfile={handleOpenBrandProfile}
            onAddVideos={videoImport.start}
            onLoadSamples={library.loadSamples}
            onRetry={library.retryAnalysis}
          />
        );
      case 'briefs':
        return <BriefsScreen onSelectBrief={handleSelectBrief} />;
      case 'calendar':
        return (
          <CalendarScreen
            items={calendar.items}
            brandName={brandSetup?.name}
            onOpenBrandProfile={handleOpenBrandProfile}
            onEditEntry={setSchedulingBriefId}
          />
        );
    }
  }

  const isLibraryTab = activeTab === 'library' || activeTab === 'search';

  return (
    <View style={styles.container}>
      {/* The bar floats over the bottom of the screen. The Library scrolls under it
          and pads itself; other tabs are kept clear of it here. */}
      <View style={[styles.content, !isLibraryTab && { paddingBottom: tabBarSpace }]}>
        {renderTabContent()}
      </View>
      <BottomTabBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onPressAdd={videoImport.start}
      />
      {videoImport.pending.length > 0 && (
        <ImportBar
          count={videoImport.pending.length}
          onImport={handleImport}
          onCancel={videoImport.clearPending}
          bottom={tabBarSpace + 4}
        />
      )}
      <PhotoAccessSheet
        visible={videoImport.sheetVisible}
        onContinue={videoImport.continueFromSheet}
        onClose={videoImport.closeSheet}
      />
      {scheduleSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
  },
});

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  // Hold the first frame until Sora and Inter are ready so text doesn't jump
  // from the system font. If loading fails, carry on with the system font.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}