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
import { suggestDate, useCalendar } from './data/calendar';
import { briefFromAnalysis, useBriefs } from './data/briefs';
import ScheduleSheet from './components/ScheduleSheet';
import { mockAnalyses, mockBrandProfile, mockClips } from './data/mockVideos';
import { Brief, Clip, FunnelStage } from './types';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { colors } from './theme';
import { fontAssets } from './theme/fontAssets';

// A "pushed" screen sits on top of the tabs, full-screen, no bottom bar.
// They hold ids, not objects, so they always show the latest data. A brief opened
// from a video's analysis remembers it in `backTo`, so Back returns there.
type PushedScreen =
  | { type: 'detail'; clipId: string }
  | { type: 'brief'; briefId: string; backTo?: PushedScreen }
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
  const briefs = useBriefs();
  /** The brief whose schedule sheet is open, if any. */
  const [schedulingBriefId, setSchedulingBriefId] = useState<string | null>(null);

  useEffect(() => {
    loadOnboarding().then(({ onboarded, brand }) => {
      setBrandSetup(brand);
      setOnboarding(onboarded ? 'done' : 'opener');
    });
  }, []);

  // ---------- lookups across the stores ----------

  function clipFor(clipId: string): Clip | undefined {
    return (
      library.clips.find((c) => c.id === clipId) ?? mockClips.find((c) => c.id === clipId)
    );
  }

  /** A brief's funnel stage: from its analysis, else its calendar entry. */
  function stageOf(brief: Brief): FunnelStage {
    const analysis =
      library.analyses.find((a) => a.id === brief.analysis_id) ??
      mockAnalyses.find((a) => a.id === brief.analysis_id);
    return (
      analysis?.payload.funnelStage ??
      calendar.items.find((i) => i.briefId === brief.id)?.stage ??
      'TOFU'
    );
  }

  const briefClipIds = new Set(briefs.briefs.map((b) => b.clip_id));

  // ---------- actions ----------

  function handleFinishOnboarding(setup: BrandSetup | null) {
    if (setup) setBrandSetup(setup);
    setOnboarding('done');
    // Not awaited: if the write fails the user just sees onboarding again next launch.
    completeOnboarding(setup).catch(() => {});
  }

  function handleImport() {
    library.importVideos(videoImport.pending);
    videoImport.clearPending();
    setActiveTab('library');
  }

  function handleLoadSamples() {
    library.loadSamples();
    briefs.loadSamples();
  }

  /** "Adapt for my brand": open the clip's brief, creating a draft if there isn't one. */
  function handleAdapt(clip: Clip) {
    const existing = briefs.briefs.find((b) => b.clip_id === clip.id);
    const backTo: PushedScreen = { type: 'detail', clipId: clip.id };
    if (existing) {
      setPushed({ type: 'brief', briefId: existing.id, backTo });
      return;
    }
    const analysis = library.analyses.find((a) => a.clip_id === clip.id);
    if (!analysis) return;
    const brief = briefFromAnalysis(clip, analysis, mockBrandProfile.id);
    briefs.add(brief);
    setPushed({ type: 'brief', briefId: brief.id, backTo });
  }

  const openBrandProfile = () => setPushed({ type: 'brandProfile' });
  const closePushed = () => setPushed(pushed?.type === 'brief' ? (pushed.backTo ?? null) : null);

  if (onboarding === 'loading' || !library.loaded || !calendar.loaded || !briefs.loaded) {
    return null;
  }

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

  // Rendered over whichever screen opened it (a tab or a brief).
  const schedulingBrief = briefs.briefs.find((b) => b.id === schedulingBriefId);
  const scheduleSheet = (
    <ScheduleSheet
      visible={!!schedulingBrief}
      hook={schedulingBrief?.hook ?? ''}
      existing={calendar.items.find((i) => i.briefId === schedulingBriefId)}
      defaultStage={schedulingBrief ? stageOf(schedulingBrief) : 'TOFU'}
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

  // ---------- pushed screens: full-screen, no tab bar ----------

  if (pushed?.type === 'brandProfile') {
    return (
      <BrandProfileScreen
        existingProfile={
          brandSetup ? applyBrandSetup(mockBrandProfile, brandSetup) : mockBrandProfile
        }
        onBack={closePushed}
      />
    );
  }

  const openBrief = pushed?.type === 'brief' ? briefs.briefs.find((b) => b.id === pushed.briefId) : undefined;
  if (openBrief) {
    return (
      <>
        <BriefScreen
          key={openBrief.id}
          brief={openBrief}
          clip={clipFor(openBrief.clip_id)}
          brandName={brandSetup?.name}
          entry={calendar.items.find((i) => i.briefId === openBrief.id)}
          onEdit={(patch) => briefs.edit(openBrief.id, patch)}
          onBack={closePushed}
          onSchedule={() => setSchedulingBriefId(openBrief.id)}
        />
        {scheduleSheet}
      </>
    );
  }

  const detailClip = pushed?.type === 'detail' ? clipFor(pushed.clipId) : undefined;
  if (detailClip) {
    return (
      <VideoDetailScreen
        video={detailClip}
        analysis={library.analyses.find((a) => a.clip_id === detailClip.id)}
        hasBrief={briefClipIds.has(detailClip.id)}
        onBack={closePushed}
        onAdapt={() => handleAdapt(detailClip)}
      />
    );
  }

  // ---------- tabs ----------

  function renderTabContent() {
    switch (activeTab) {
      case 'library':
      case 'search':
        // Search reuses the Library (with its search box) until the Search tab is designed.
        return (
          <LibraryScreen
            clips={library.clips}
            analyses={library.analyses}
            briefClipIds={briefClipIds}
            lastImportCount={library.lastImportCount}
            now={library.now}
            brandName={brandSetup?.name}
            focus={brandSetup?.focus}
            onSelectVideo={(clip) => setPushed({ type: 'detail', clipId: clip.id })}
            onOpenBrandProfile={openBrandProfile}
            onAddVideos={videoImport.start}
            onLoadSamples={handleLoadSamples}
            onRetry={library.retryAnalysis}
          />
        );
      case 'briefs':
        return (
          <BriefsScreen
            briefs={briefs.briefs}
            calendarItems={calendar.items}
            stageOf={stageOf}
            brandName={brandSetup?.name}
            onSelectBrief={(brief) => setPushed({ type: 'brief', briefId: brief.id })}
            onSchedule={setSchedulingBriefId}
            onOpenBrandProfile={openBrandProfile}
          />
        );
      case 'calendar':
        return (
          <CalendarScreen
            items={calendar.items}
            briefs={briefs.briefs}
            clipFor={clipFor}
            brandName={brandSetup?.name}
            onOpenBrandProfile={openBrandProfile}
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
