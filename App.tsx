import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import LibraryScreen from './screens/LibraryScreen';
import BriefsScreen from './screens/BriefsScreen';
import VideoDetailScreen from './screens/VideoDetailScreen';
import BriefScreen from './screens/BriefScreen';
import BrandProfileScreen from './screens/BrandProfileScreen';
import CalendarScreen from './screens/CalendarScreen';
import ImportScreen from './screens/ImportScreen';
import OpenerScreen from './screens/OpenerScreen';
import BrandSetupScreen from './screens/BrandSetupScreen';
import {
  BrandSetup,
  applyBrandSetup,
  completeOnboarding,
  loadOnboarding,
} from './data/brandSetup';
import BottomTabBar, { TabKey, useTabBarSpace } from './components/BottomTabBar';
import { mockBriefs, mockBrandProfile } from './data/mockVideos';
import { Video, Brief, Clip } from './types';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { colors } from './theme';
import { fontAssets } from './theme/fontAssets';

// A "pushed" screen sits on top of the tabs, full-screen, no bottom bar.
type PushedScreen =
  | { type: 'detail'; video: Video }
  | { type: 'brief'; video: Video; brief?: Brief }
  | { type: 'brandProfile' }
  | { type: 'import' };

// First run: opener -> brand setup -> the app. Remembered on the device.
type OnboardingStage = 'loading' | 'opener' | 'brand' | 'done';

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('library');
  const [pushed, setPushed] = useState<PushedScreen | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStage>('loading');
  const [brandSetup, setBrandSetup] = useState<BrandSetup | null>(null);
  const tabBarSpace = useTabBarSpace();

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

  function handleSelectVideo(video: Video) {
    setPushed({ type: 'detail', video });
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

  function handleOpenImport() {
    setPushed({ type: 'import' });
  }

  function handleClosePushed() {
    setPushed(null);
  }

  if (onboarding === 'loading') return null;

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

  // Pushed screens take over the full screen, no tab bar underneath.
  if (pushed?.type === 'import') {
    return <ImportScreen onBack={handleClosePushed} />;
  }

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
    return (
      <BriefScreen
        video={pushed.video}
        existingBrief={pushed.brief}
        onBack={handleClosePushed}
      />
    );
  }

  if (pushed?.type === 'detail') {
    return (
      <VideoDetailScreen
        video={pushed.video}
        onBack={handleClosePushed}
        onViewBrief={() => handleViewBriefFromDetail(pushed.video)}
      />
    );
  }

  // Otherwise, render the active tab with the persistent bottom bar.
  function renderTabContent() {
    switch (activeTab) {
      case 'library':
        return (
          <LibraryScreen
            onSelectVideo={handleSelectVideo}
            onOpenBrandProfile={handleOpenBrandProfile}
            onOpenImport={handleOpenImport}
            onOpenCalendar={() => setActiveTab('calendar')}
          />
        );
      case 'search':
        // Temporary: reuses Library's search until Alicia's Search-tab design is confirmed.
        return (
          <LibraryScreen
            onSelectVideo={handleSelectVideo}
            onOpenBrandProfile={handleOpenBrandProfile}
            onOpenImport={handleOpenImport}
            onOpenCalendar={() => setActiveTab('calendar')}
          />
        );
      case 'briefs':
        return <BriefsScreen onSelectBrief={handleSelectBrief} />;
      case 'calendar':
        return <CalendarScreen onBack={() => setActiveTab('library')} />;
    }
  }

  return (
    <View style={styles.container}>
      {/* The bar floats over the bottom of the screen; keep content clear of it. */}
      <View style={[styles.content, { paddingBottom: tabBarSpace }]}>
        {renderTabContent()}
      </View>
      <BottomTabBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onPressAdd={handleOpenImport}
      />
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