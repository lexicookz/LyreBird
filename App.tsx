import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Share } from 'react-native';
import LibraryScreen, { confirmDeleteClip } from './screens/LibraryScreen';
import BriefsScreen from './screens/BriefsScreen';
import VideoDetailScreen from './screens/VideoDetailScreen';
import BriefScreen from './screens/BriefScreen';
import BrandProfileScreen from './screens/BrandProfileScreen';
import CalendarScreen from './screens/CalendarScreen';
import OpenerScreen from './screens/OpenerScreen';
import BrandSetupScreen from './screens/BrandSetupScreen';
import AuthScreen from './screens/AuthScreen';
import SettingsScreen from './screens/SettingsScreen';
import SearchScreen from './screens/SearchScreen';
import {
  BrandSetup,
  completeOnboarding,
  loadOnboarding,
  brandColorOf,
  saveBrandSetup,
} from './data/brandSetup';
import { Account, loadAccount, signIn, signOut, signUp } from './data/account';
import BottomTabBar, { TabKey, useTabBarSpace } from './components/BottomTabBar';
import { ImportBar, PhotoAccessSheet, useVideoImport } from './components/ImportFlow';
import AddVideoMenu from './components/AddVideoMenu';
import { useLibrary } from './data/library';
import { suggestDate, useCalendar } from './data/calendar';
import { briefAsText, briefFromAnalysis, useBriefs } from './data/briefs';
import ScheduleSheet from './components/ScheduleSheet';
import { mockAnalyses, mockBrandProfile, mockClips } from './data/mockVideos';
import { Brief, Clip, FunnelStage } from './types';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Colors, ThemeProvider, useStyles, useTheme } from './theme';
import { StatusBar } from 'expo-status-bar';
import { fontAssets } from './theme/fontAssets';

// A "pushed" screen sits on top of the tabs, full-screen, no bottom bar.
// They hold ids, not objects, so they always show the latest data. `backTo`
// is where Back goes (e.g. a brief opened from a video's analysis).
type PushedScreen =
  | { type: 'detail'; clipId: string }
  | { type: 'brief'; briefId: string; backTo?: PushedScreen }
  | { type: 'settings' }
  | { type: 'brandProfile'; backTo?: PushedScreen };

// Signed out: opener -> sign up (or log in) -> brand setup -> the app.
type Stage = 'loading' | 'opener' | 'signup' | 'login' | 'brand' | 'done';

function AppContent() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<TabKey>('library');
  const [pushed, setPushed] = useState<PushedScreen | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [onboarded, setOnboarded] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [brandSetup, setBrandSetup] = useState<BrandSetup | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const tabBarSpace = useTabBarSpace();
  const library = useLibrary();
  const videoImport = useVideoImport();
  const calendar = useCalendar();
  const briefs = useBriefs();
  /** The brief whose schedule sheet is open, if any. */
  const [schedulingBriefId, setSchedulingBriefId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadOnboarding(), loadAccount()]).then(([{ onboarded, brand }, acct]) => {
      setBrandSetup(brand);
      setOnboarded(onboarded);
      setAccount(acct);
      setStage(!acct ? 'opener' : onboarded ? 'done' : 'brand');
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
  /** Background of the brand initial shown in headers and Settings. */
  const brandColor = colors[brandColorOf(brandSetup)];

  // ---------- actions ----------

  /**
   * Signing up and logging in are different calls now that accounts are real,
   * so which one runs follows the screen the user is on. Errors are not caught
   * here: AuthScreen awaits this and shows the message, since it is the thing
   * with somewhere to put it.
   */
  async function handleAuth(email: string, password: string) {
    const acct = stage === 'signup' ? await signUp(email, password) : await signIn(email, password);
    setAccount(acct);
    setStage(onboarded ? 'done' : 'brand');
  }

  function handleFinishOnboarding(setup: BrandSetup | null) {
    if (setup) setBrandSetup(setup);
    setOnboarded(true);
    setStage('done');
    // Not awaited: if the write fails the user just sees onboarding again next launch.
    completeOnboarding(setup).catch(() => {});
  }

  function handleSaveBrand(setup: BrandSetup) {
    setBrandSetup(setup);
    saveBrandSetup(setup).catch(() => {});
    closePushed();
  }

  /** Signs out. Brand, videos and briefs stay on the phone. */
  function handleSignOut() {
    setPushed(null);
    setActiveTab('library');
    setAccount(null);
    setStage('login');
    signOut().catch(() => {});
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

  function handleExportBriefs() {
    const text = briefs.briefs.map(briefAsText).join('\n\n— — —\n\n');
    Share.share({ message: text || 'No briefs yet.' });
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

  const openSettings = () => setPushed({ type: 'settings' });
  function closePushed() {
    setPushed(
      pushed && (pushed.type === 'brief' || pushed.type === 'brandProfile')
        ? (pushed.backTo ?? null)
        : null
    );
  }

  if (stage === 'loading' || !library.loaded || !calendar.loaded || !briefs.loaded) {
    return null;
  }

  // ---------- signed out / first run ----------

  if (stage === 'opener') {
    return <OpenerScreen onStart={() => setStage('signup')} onSkip={() => setStage('login')} />;
  }

  if (stage === 'signup' || stage === 'login') {
    return (
      <AuthScreen
        key={stage}
        mode={stage}
        savedCount={library.clips.length}
        onSubmit={handleAuth}
        onSwitchMode={() => setStage(stage === 'login' ? 'signup' : 'login')}
      />
    );
  }

  if (stage === 'brand') {
    return (
      <BrandSetupScreen
        initial={brandSetup}
        onBack={() => setStage('opener')}
        onDone={handleFinishOnboarding}
      />
    );
  }

  // Rendered over whichever screen opened it (a tab or a brief).
  const schedulingBrief = briefs.briefs.find((b) => b.id === schedulingBriefId);
  const openedFromBrief = pushed?.type === 'brief' && pushed.briefId === schedulingBriefId;
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
      onSeeBrief={
        schedulingBriefId && !openedFromBrief
          ? () => {
              setPushed({ type: 'brief', briefId: schedulingBriefId });
              setSchedulingBriefId(null);
            }
          : undefined
      }
    />
  );

  // ---------- pushed screens: full-screen, no tab bar ----------

  if (pushed?.type === 'settings') {
    const complete = !!(
      brandSetup?.name &&
      brandSetup.product_summary &&
      brandSetup.target_audience &&
      brandSetup.tones.length
    );
    return (
      <SettingsScreen
        brandName={brandSetup?.name}
        brandColor={brandColor}
        email={account?.email}
        brandComplete={complete}
        onOpenBrand={() => setPushed({ type: 'brandProfile', backTo: { type: 'settings' } })}
        onExportBriefs={handleExportBriefs}
        onSignOut={handleSignOut}
        onBack={closePushed}
      />
    );
  }

  if (pushed?.type === 'brandProfile') {
    return <BrandProfileScreen setup={brandSetup} onSave={handleSaveBrand} onBack={closePushed} />;
  }

  const openBrief =
    pushed?.type === 'brief' ? briefs.briefs.find((b) => b.id === pushed.briefId) : undefined;
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
        onDelete={() =>
          confirmDeleteClip(detailClip, () => {
            library.removeClip(detailClip.id);
            setPushed(null);
          })
        }
      />
    );
  }

  // ---------- tabs ----------

  function renderTabContent() {
    switch (activeTab) {
      case 'library':
        return (
          <LibraryScreen
            clips={library.clips}
            analyses={library.analyses}
            briefClipIds={briefClipIds}
            lastImportCount={library.lastImportCount}
            now={library.now}
            tags={library.tags}
            allTags={library.allTags}
            onTagsChange={library.setTags}
            onSortChange={library.setSort}
            hasMore={library.hasMore}
            loadingMore={library.loadingMore}
            onLoadMore={library.loadMore}
            onSearchChange={library.setSearch}
            brandName={brandSetup?.name}
            brandColor={brandColor}
            focus={brandSetup?.focus}
            onSelectVideo={(clip) => setPushed({ type: 'detail', clipId: clip.id })}
            onOpenBrandProfile={openSettings}
            onAddVideos={videoImport.start}
            onLoadSamples={handleLoadSamples}
            onRetry={library.retryAnalysis}
            onDelete={library.removeClip}
          />
        );
      case 'search':
        return (
          <SearchScreen
            clips={library.clips}
            analyses={library.analyses}
            briefs={briefs.briefs}
            stageOf={stageOf}
            onSelectClip={(clip) => setPushed({ type: 'detail', clipId: clip.id })}
            onSelectBrief={(brief) => setPushed({ type: 'brief', briefId: brief.id })}
          />
        );
      case 'briefs':
        return (
          <BriefsScreen
            briefs={briefs.briefs}
            calendarItems={calendar.items}
            stageOf={stageOf}
            brandName={brandSetup?.name}
            brandColor={brandColor}
            onSelectBrief={(brief) => setPushed({ type: 'brief', briefId: brief.id })}
            onSchedule={setSchedulingBriefId}
            onOpenBrandProfile={openSettings}
          />
        );
      case 'calendar':
        return (
          <CalendarScreen
            items={calendar.items}
            briefs={briefs.briefs}
            clipFor={clipFor}
            brandName={brandSetup?.name}
            brandColor={brandColor}
            onOpenBrandProfile={openSettings}
            onEditEntry={setSchedulingBriefId}
          />
        );
    }
  }

  return (
    <View style={styles.container}>
      {/* The bar floats over the bottom of the screen. The Library scrolls under it
          and pads itself; other tabs are kept clear of it here. */}
      <View style={[styles.content, activeTab !== 'library' && { paddingBottom: tabBarSpace }]}>
        {renderTabContent()}
      </View>
      {addMenuOpen && (
        <AddVideoMenu
          bottom={tabBarSpace - 8}
          onCameraRoll={() => {
            setAddMenuOpen(false);
            videoImport.start();
          }}
          onClose={() => setAddMenuOpen(false)}
        />
      )}
      <BottomTabBar
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setAddMenuOpen(false);
          setActiveTab(tab);
        }}
        onPressAdd={() => setAddMenuOpen(!addMenuOpen)}
        addOpen={addMenuOpen}
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

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
  },
});

/** Light clock and battery icons on the dark theme, dark ones on the light theme. */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  // Hold the first frame until Sora and Inter are ready so text doesn't jump
  // from the system font. If loading fails, carry on with the system font.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
      <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
