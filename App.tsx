import React, { useCallback, useEffect, useState } from 'react';
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
  emptyBrandSetup,
  saveBrandSetup,
} from './data/brandSetup';
import { Account, currentUserId, loadAccount, signIn, signOut, signUp } from './data/account';
import { fetchMyBrand, saveBrand, setupFromBrand } from './lib/brands';
import BottomTabBar, { TabKey, useTabBarSpace } from './components/BottomTabBar';
import { ImportBar, PhotoAccessSheet, useVideoImport } from './components/ImportFlow';
import AddVideoMenu from './components/AddVideoMenu';
import { ErrorBanner } from './components/ui';
import { useLibrary } from './data/library';
import { suggestDate, useCalendar } from './data/calendar';
import { briefAsText, useBriefs } from './data/briefs';
import ScheduleSheet from './components/ScheduleSheet';
import { mockAnalyses, mockClips } from './data/mockVideos';
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
  const briefs = useBriefs();

  /**
   * A brief's funnel stage comes from the analysis of the clip it was written
   * from. The calendar doesn't store a stage, so it asks this for each entry.
   */
  const stageForBriefId = useCallback(
    (briefId: string): FunnelStage => {
      const brief = briefs.all.find((b) => b.id === briefId);
      const analysis =
        library.analyses.find((a) => a.id === brief?.analysis_id) ??
        library.analyses.find((a) => a.clip_id === brief?.clip_id) ??
        mockAnalyses.find((a) => a.id === brief?.analysis_id);
      return analysis?.payload.funnelStage ?? 'TOFU';
    },
    [briefs.all, library.analyses]
  );
  const calendar = useCalendar(stageForBriefId);
  /** The brief whose schedule sheet is open, if any. */
  const [schedulingBriefId, setSchedulingBriefId] = useState<string | null>(null);
  /** The user's brands row in Supabase, which the AI brief writer reads. */
  const [brandId, setBrandId] = useState<string | null>(null);
  /** A message about the brand that has nowhere else to go (failed save, no brand yet). */
  const [brandError, setBrandError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadOnboarding(), loadAccount()]).then(([{ onboarded, brand }, acct]) => {
      setBrandSetup(brand);
      setOnboarded(onboarded);
      setAccount(acct);
      setStage(!acct ? 'opener' : onboarded ? 'done' : 'brand');
    });
  }, []);

  // Once signed in: reload everything for this account, and find its brand.
  // The stores only load once on launch, so without this a fresh log-in would
  // show an empty library until the app was restarted.
  useEffect(() => {
    if (!account) return;
    library.refresh();
    calendar.refresh();
    briefs.refresh();
    fetchMyBrand()
      .then((row) => {
        setBrandId(row?.id ?? null);
        // On a new phone the brand exists in Supabase but not here yet.
        if (row) setBrandSetup((local) => local ?? setupFromBrand(row, emptyBrandSetup));
      })
      .catch((e) => setBrandError(e instanceof Error ? e.message : 'Could not load your brand.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the account changes
  }, [account?.email]);

  /** Save the brand on the phone and in Supabase. Resolves to the brand's id, or null. */
  async function persistBrand(setup: BrandSetup): Promise<string | null> {
    saveBrandSetup(setup).catch(() => {});
    const userId = await currentUserId();
    if (!userId) return null;
    try {
      const row = await saveBrand(userId, setup, brandId);
      setBrandId(row.id);
      return row.id;
    } catch (e) {
      setBrandError(e instanceof Error ? e.message : 'Could not save your brand.');
      return null;
    }
  }

  // ---------- lookups across the stores ----------

  function clipFor(clipId: string): Clip | undefined {
    return (
      library.clips.find((c) => c.id === clipId) ?? mockClips.find((c) => c.id === clipId)
    );
  }

  /** A brief's funnel stage, from the analysis of its clip. */
  function stageOf(brief: Brief): FunnelStage {
    return stageForBriefId(brief.id);
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
    if (setup) persistBrand(setup);
  }

  function handleSaveBrand(setup: BrandSetup) {
    setBrandSetup(setup);
    persistBrand(setup);
    closePushed();
  }

  /** Signs out. Everything stays in the account for the next log-in. */
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

  function handleExportBriefs() {
    const text = briefs.briefs.map(briefAsText).join('\n\n— — —\n\n');
    Share.share({ message: text || 'No briefs yet.' });
  }

  /**
   * "Adapt for my brand": open the clip's brief, or have the AI write one.
   * The AI needs the brand in Supabase, so it's saved first if it isn't yet.
   */
  async function handleAdapt(clip: Clip) {
    const existing = briefs.briefs.find((b) => b.clip_id === clip.id);
    const backTo: PushedScreen = { type: 'detail', clipId: clip.id };
    if (existing) {
      setPushed({ type: 'brief', briefId: existing.id, backTo });
      return;
    }
    if (!brandSetup?.name) {
      setBrandError('Set up your brand first, so the brief can be written for it.');
      setPushed({ type: 'brandProfile', backTo });
      return;
    }
    const id = brandId ?? (await persistBrand(brandSetup));
    if (!id) return;
    const briefId = await briefs.generate(clip.id, id);
    if (briefId) setPushed({ type: 'brief', briefId, backTo });
  }

  /**
   * Regenerate writes a new brief and keeps the old one. If the old one was on
   * the calendar, the new one takes its place there.
   */
  async function handleRegenerate(brief: Brief) {
    const newId = await briefs.regenerate(brief.id);
    if (!newId) return;
    const entry = calendar.items.find((i) => i.briefId === brief.id);
    if (entry) {
      await calendar.schedule({ briefId: newId, date: entry.date, status: entry.status });
      await calendar.unschedule(brief.id);
    }
    setPushed((current) =>
      current?.type === 'brief' ? { ...current, briefId: newId } : { type: 'brief', briefId: newId }
    );
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

  // One message at a time, most important first: without a brand there's no
  // brief; a failed brief or upload matters more than a calendar hiccup.
  const message: { text: string; dismiss: () => void } | null = brandError
    ? { text: brandError, dismiss: () => setBrandError(null) }
    : briefs.error
      ? { text: briefs.error, dismiss: briefs.clearError }
      : library.error
        ? { text: library.error, dismiss: library.clearError }
        : calendar.error
          ? { text: calendar.error, dismiss: calendar.clearError }
          : null;
  const banner = message && <ErrorBanner message={message.text} onDismiss={message.dismiss} />;

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
    return (
      <>
        <BrandProfileScreen setup={brandSetup} onSave={handleSaveBrand} onBack={closePushed} />
        {banner}
      </>
    );
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
          onRegenerate={() => handleRegenerate(openBrief)}
          regenerating={briefs.isWorking(openBrief.id)}
        />
        {scheduleSheet}
        {banner}
      </>
    );
  }

  const detailClip = pushed?.type === 'detail' ? clipFor(pushed.clipId) : undefined;
  if (detailClip) {
    return (
      <>
        <VideoDetailScreen
          video={detailClip}
          analysis={library.analyses.find((a) => a.clip_id === detailClip.id)}
          hasBrief={briefClipIds.has(detailClip.id)}
          onBack={closePushed}
          onAdapt={() => handleAdapt(detailClip)}
          adapting={briefs.isWorking(detailClip.id)}
          onDelete={() =>
            confirmDeleteClip(detailClip, () => {
              library.removeClip(detailClip.id);
              setPushed(null);
            })
          }
        />
        {banner}
      </>
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
            briefs={briefs.all}
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
      {banner}
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
