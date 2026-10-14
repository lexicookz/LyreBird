import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Share } from 'react-native';
import App from '../App';
import { sampleCalendar } from '../data/calendar';
import { sampleLibrary } from '../data/library';
import { mockBriefs } from '../data/mockVideos';
import { BRAND_COLORS, brandColorOf } from '../data/brandSetup';
import { darkColors, lightColors } from '../theme';


// The analysis path posts the video to the pipeline API. In a test runner
// there is no server at that address, so every imported clip failed and the
// "finishes analysing" expectations never had a chance. Mock the reply with a
// valid analysis so these tests exercise the flow rather than the network.
function mockAnalyzeVideo(delayMs = 60_000) {
  const reply = {
    ok: true,
    status: 200,
    json: async () => ({
      status: 'success',
      data: {
        hook: 'Opening hook',
        transcript: null,
        onScreenText: [],
        shotBeats: [],
        pacing: null,
        audioStyle: { backgroundMusic: null, voiceover: null },
        cta: null,
        whyItWorks: [],
        format: 'talking_head',
        funnelStage: 'TOFU',
        description: 'A test clip.',
      },
      model_version: 'gemini-3.8-flash',
      prompt_version: 'v2',
    }),
  } as Response;

  // Resolves on a timer rather than immediately, so a clip is observably
  // 'processing' before it is 'ready'. A suite on fake timers advances past
  // delayMs to finish the analysis; one on real timers leaves it pending and
  // sees the analysing state, which is what it is asserting.
  return jest
    .spyOn(global, 'fetch')
    .mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(reply), delayMs))
    );
}

describe('palettes', () => {
  test('light and dark have exactly the same colour names', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  test('text on pastels stays dark in both themes', () => {
    expect(darkColors.onPastel).toBe(lightColors.onPastel);
  });
});

describe('brandColorOf', () => {
  test('picks the same colour for the same name, and honours a chosen one', () => {
    expect(brandColorOf({ name: 'Nima Studio' })).toBe(brandColorOf({ name: '  nima studio ' }));
    expect(BRAND_COLORS).toContain(brandColorOf({ name: 'Nima Studio' }));
    expect(brandColorOf({ name: 'Nima Studio', color: 'peach' })).toBe('peach');
  });
});

// Real Supabase auth needs a server, which a test runner has no business
// reaching. These tests are about App's wiring -- sign up leads to brand
// setup, sign out returns to log in -- so the account module is replaced by
// an AsyncStorage-backed stand-in with the same surface. Whether
// signInWithPassword is called correctly is a different question, and not
// one this suite can answer.
jest.mock('../data/account', () => {
  const KEY = 'lyrebird.account';
  // Resolved per call, not at factory time: the AsyncStorage mock from
  // jest.setup is not in place yet while this factory runs.
  const store = () => {
    const mod = require('@react-native-async-storage/async-storage');
    return mod.default ?? mod;
  };
  return {
    MIN_PASSWORD_LENGTH: 6,
    AuthError: class AuthError extends Error {},
    isValidEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    loadAccount: async () => {
      const raw = await store().getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    },
    signIn: async (email: string) => {
      const account = { email: email.trim().toLowerCase() };
      await store().setItem(KEY, JSON.stringify(account));
      return account;
    },
    signUp: async (email: string) => {
      const account = { email: email.trim().toLowerCase() };
      await store().setItem(KEY, JSON.stringify(account));
      return account;
    },
    signOut: async () => {
      await store().removeItem(KEY);
    },
    currentUserId: async () => {
      const raw = await store().getItem(KEY);
      return raw ? 'user-1' : null;
    },
  };
});

// Clips live in Supabase now. These tests are about App's navigation and
// screens, so the data layer answers from memory -- reaching a database would
// make them a different kind of test, and a slower one.
// The calendar is in Supabase now. These tests are about the screens, so it
// answers from memory -- the rows behave like the table, including keeping
// one entry per brief the way scheduleBrief does.
jest.mock('../lib/calendar', () => {
  const rows: any[] = [];
  let n = 0;
  return {
    __rows: rows,
    fetchCalendar: jest.fn(async () => [...rows]),
    scheduleBrief: jest.fn(async (ownerId: string, briefId: string, date: string, status: string) => {
      const i = rows.findIndex((r) => r.brief_id === briefId);
      if (i >= 0) rows.splice(i, 1);
      n += 1;
      const row = {
        id: `cal-${n}`, owner_id: ownerId, brief_id: briefId,
        scheduled_for: date, status, platform: null, notes: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      rows.push(row);
      return row;
    }),
    moveEntry: jest.fn(async (id: string, date: string) => {
      const row = rows.find((r) => r.id === id);
      if (row) row.scheduled_for = date;
      return row;
    }),
    setEntryStatus: jest.fn(async (id: string, status: string) => {
      const row = rows.find((r) => r.id === id);
      if (row) row.status = status;
      return row;
    }),
    unscheduleBrief: jest.fn(async (briefId: string) => {
      const i = rows.findIndex((r) => r.brief_id === briefId);
      if (i >= 0) rows.splice(i, 1);
    }),
  };
});

jest.mock('../lib/clips', () => {
  const rows: { clips: any[]; analyses: any[] } = { clips: [], analyses: [] };
  let n = 0;
  return {
    CLIPS_BUCKET: 'clips',
    __rows: rows,
    LIBRARY_PAGE_SIZE: 24,
    // Filtering, sorting and paging happen in Postgres now, so the mock
    // answers the same shape the query does rather than a bare list.
    fetchLibrary: jest.fn(async (q: any = {}) => {
      let clips = [...rows.clips];
      if (q.tags?.length) {
        clips = clips.filter((c: any) => q.tags.every((t: string) => (c.tags ?? []).includes(t)));
      }
      clips.sort((a: any, b: any) =>
        q.sort === 'oldest'
          ? Date.parse(a.created_at) - Date.parse(b.created_at)
          : Date.parse(b.created_at) - Date.parse(a.created_at)
      );
      const size = q.pageSize ?? 24;
      const from = (q.page ?? 0) * size;
      const slice = clips.slice(from, from + size);
      const ids = new Set(slice.map((c: any) => c.id));
      return {
        clips: slice,
        analyses: rows.analyses.filter((a: any) => ids.has(a.clip_id)),
        hasMore: from + slice.length < clips.length,
        total: clips.length,
      };
    }),
    fetchTags: jest.fn(async () => {
      const seen = new Set<string>();
      for (const c of rows.clips) for (const t of c.tags ?? []) seen.add(t);
      return [...seen].sort();
    }),
    uploadClip: jest.fn(async (ownerId: string, asset: any) => {
      n += 1;
      const stamp = new Date().toISOString();
      const clip = {
        id: `db-${n}`,
        owner_id: ownerId,
        recording_id: null,
        storage_path: `${ownerId}/${asset.fileName ?? `clip-${n}.mp4`}`,
        thumbnail_path: null,
        thumbnail_url: null,
        title: (asset.fileName ?? `Saved video ${n}`).replace(/\.[^.]+$/, ''),
        tags: [],
        duration_seconds: asset.duration ? Math.round(asset.duration / 1000) : null,
        position_in_parent: null,
        status: 'processing',
        error_message: null,
        created_at: stamp,
        updated_at: stamp,
      };
      rows.clips = [clip, ...rows.clips];
      return clip;
    }),
    prepareClip: jest.fn(async () => undefined),
    requestAnalysis: jest.fn(async (clipId: string) => {
      rows.clips = rows.clips.map((c) => (c.id === clipId ? { ...c, status: 'processing' } : c));
    }),
    deleteClip: jest.fn(async (clip: any) => {
      rows.clips = rows.clips.filter((c) => c.id !== clip.id);
      rows.analyses = rows.analyses.filter((a) => a.clip_id !== clip.id);
    }),
  };
});

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn(async () => ({
    granted: false,
    canAskAgain: true,
    status: 'undetermined',
  })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [
      { uri: 'file:///a.mov', fileName: 'a.mov', duration: 31_000, width: 1080, height: 1920 },
      { uri: 'file:///b.mov', fileName: 'b.mov', duration: 44_000, width: 1080, height: 1920 },
      { uri: 'file:///c.mov', fileName: 'c.mov', duration: 120_000, width: 1080, height: 1920 },
    ],
  })),
}));

// Confirmation dialogs answer "yes" (the destructive button) straight away.
jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
  buttons?.find((b) => b.style === 'destructive')?.onPress?.();
});
jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

const SNOOZE_HOOK = "“I used to hit snooze 5 times. Here's what fixed it.”";

/** A returning user: signed in and through onboarding. */
async function signedIn() {
  await AsyncStorage.multiSet([
    ['lyrebird.onboarded', 'true'],
    ['lyrebird.account', JSON.stringify({ email: 'alicia@example.com' })],
    [
      'lyrebird.brandSetup',
      JSON.stringify({
        name: 'Nima Studio',
        product_summary: 'Refill skincare',
        target_audience: '',
        tones: ['Warm'],
        avoid: [],
        focus: 'TOFU',
        focusShare: 60,
      }),
    ],
  ]);
}

/**
 * One analysed sample clip in the library, with no brief yet.
 *
 * Seeded into the mocked data layer rather than AsyncStorage: the library
 * reads from the database now, so a row in local storage would never be seen.
 */
async function withOneAnalysedClip() {
  const sample = sampleLibrary();
  const id = 'cccccccc-0000-4000-8000-000000000001';
  const clipsApi = require('../lib/clips');
  clipsApi.__rows.clips = sample.clips.filter((c) => c.id === id);
  clipsApi.__rows.analyses = sample.analyses.filter((a) => a.clip_id === id);
}

/**
 * Sample entries in the calendar table, the way the database would hold
 * them. Seeded there rather than in AsyncStorage: the calendar reads rows
 * now, so a local copy would never be seen.
 */
function withSampleCalendar() {
  const rows = require('../lib/calendar').__rows;
  rows.length = 0;
  sampleCalendar().forEach((item, i) =>
    rows.push({
      id: `cal-seed-${i + 1}`,
      owner_id: 'user-1',
      brief_id: item.briefId,
      scheduled_for: item.date,
      status: item.status,
      platform: null,
      notes: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    })
  );
}

describe('App', () => {
  beforeEach(async () => {
    mockAnalyzeVideo();
    await AsyncStorage.clear();
    // The mocked data layer holds rows between tests; clear it like storage.
    const clipsApi = require('../lib/clips');
    clipsApi.__rows.clips = [];
    clipsApi.__rows.analyses = [];
    require('../lib/calendar').__rows.length = 0;
  });

  // ---------- first run and accounts ----------

  test('a first launch starts on the opener', async () => {
    const { findByText } = await render(<App />);

    expect(await findByText("Hi. Let's start creating")).toBeTruthy();
  });

  test('a new user signs up, sets up their brand and lands in the app', async () => {
    const { findByText, getByText, getByLabelText, findByLabelText, findAllByText } = await render(<App />);

    await fireEvent.press(await findByText('Start collecting'));
    expect(await findByText('Create your account')).toBeTruthy();
    await fireEvent.changeText(getByLabelText('Email'), 'Alicia@Example.com');
    await fireEvent.changeText(getByLabelText('Password'), 'secret1');
    await fireEvent.press(getByText('Create account'));

    // Step 1: brand name and audience
    await fireEvent.changeText(await findByLabelText('Brand name'), 'Nima Studio');
    await fireEvent.changeText(getByLabelText("Who it's for"), 'People who hate plastic');
    await fireEvent.press(getByText('Continue'));
    // Step 2: pick a tone
    await fireEvent.press(await findByText('Dry humour'));
    await fireEvent.press(getByText('Continue'));
    // Step 3: add a common one
    await fireEvent.press(await findByText('+ “Miracle”'));
    await fireEvent.press(getByText('Continue'));
    // Step 4: pick Convert and finish
    await fireEvent.press(await findByText('Convert'));
    await fireEvent.press(getByText('Finish setup'));

    expect((await findAllByText('Library')).length).toBeGreaterThan(0);
    expect(JSON.parse((await AsyncStorage.getItem('lyrebird.account')) ?? '{}')).toEqual({
      email: 'alicia@example.com',
    });
    expect(JSON.parse((await AsyncStorage.getItem('lyrebird.brandSetup')) ?? '{}')).toMatchObject({
      name: 'Nima Studio',
      target_audience: 'People who hate plastic',
      tones: ['Dry humour'],
      avoid: ['“Miracle”'],
      focus: 'BOFU',
    });
  });

  test('sign up checks the email and password before going on', async () => {
    const { findByText, getByText, getByLabelText } = await render(<App />);

    await fireEvent.press(await findByText('Start collecting'));
    await fireEvent.changeText(getByLabelText('Email'), 'not-an-email');
    await fireEvent.changeText(getByLabelText('Password'), 'secret1');
    await fireEvent.press(getByText('Create account'));
    expect(await findByText('That email doesn’t look right.')).toBeTruthy();

    await fireEvent.changeText(getByLabelText('Email'), 'a@b.co');
    await fireEvent.changeText(getByLabelText('Password'), '123');
    await fireEvent.press(getByText('Create account'));
    expect(await findByText('Passwords need at least 6 characters.')).toBeTruthy();
  });

  test('Skip on the opener goes to log in, and the two screens link to each other', async () => {
    const { findByText, getByText } = await render(<App />);

    await fireEvent.press(await findByText('Skip'));
    expect(await findByText('Welcome back')).toBeTruthy();
    await fireEvent.press(getByText('Create an account'));
    expect(await findByText('Create your account')).toBeTruthy();
    await fireEvent.press(getByText('Log in'));
    expect(await findByText('Welcome back')).toBeTruthy();
  });

  test('signing out goes to log in and keeps the brand; logging back in returns to the app', async () => {
    await signedIn();
    const { findByLabelText, findByText, getByText, getByLabelText, findAllByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Settings'));
    expect(await findByText('alicia@example.com')).toBeTruthy();
    await fireEvent.press(getByText('Sign out'));

    expect(await findByText('Welcome back')).toBeTruthy();
    expect(await AsyncStorage.getItem('lyrebird.account')).toBeNull();
    expect(await AsyncStorage.getItem('lyrebird.brandSetup')).not.toBeNull();

    await fireEvent.changeText(getByLabelText('Email'), 'alicia@example.com');
    await fireEvent.changeText(getByLabelText('Password'), 'secret1');
    await fireEvent.press(getByText('Log in'));
    expect((await findAllByText('Library')).length).toBeGreaterThan(0);
  });

  // ---------- library ----------

  test('once signed in, starts on the Library tab with the bottom tab bar visible', async () => {
    await signedIn();
    const { findAllByText, getByText } = await render(<App />);

    expect((await findAllByText('Library')).length).toBeGreaterThan(0);
    expect(getByText('Search')).toBeTruthy();
    expect(getByText('Briefs')).toBeTruthy();
    expect(getByText('Calendar')).toBeTruthy();
  });

  test('a new library shows the empty state', async () => {
    await signedIn();
    const { findByText } = await render(<App />);

    expect(await findByText('Nothing saved yet')).toBeTruthy();
  });

  test('the + opens the add menu, and camera roll imports videos and starts analysing them', async () => {
    await signedIn();
    const { findByLabelText, findByText, getByText, queryByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Add videos'));
    expect(await findByText('Add a video')).toBeTruthy();
    expect(getByText('Videos should be 90 seconds or less in length')).toBeTruthy();

    // The × closes it again.
    await fireEvent.press(await findByLabelText('Close add a video'));
    expect(queryByText('Add a video')).toBeNull();

    await fireEvent.press(await findByLabelText('Add videos'));
    await fireEvent.press(await findByText('Camera roll'));

    // First time: our explainer, then the system permission prompt and picker.
    expect(await findByText('We need to see your saved videos')).toBeTruthy();
    await fireEvent.press(getByText('Continue'));
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();

    // The 2-minute video is over the 90-second cap and is left out.
    expect(await findByText('2 videos selected')).toBeTruthy();
    await fireEvent.press(getByText('Import'));

    expect(await findByText('Analysing 2 new clips')).toBeTruthy();
  });

  test('a video can be deleted from its analysis screen', async () => {
    await signedIn();
    await withOneAnalysedClip();
    const { findByText, getByText } = await render(<App />);

    await fireEvent.press(await findByText(SNOOZE_HOOK));
    await fireEvent.press(await findByText('Delete video'));

    expect(await findByText('Nothing saved yet')).toBeTruthy();
    // Deleted from the database, not from local storage -- that is where
    // clips live now, and the row going is what makes the deletion stick.
    expect(require('../lib/clips').__rows.clips).toEqual([]);
    expect(getByText('Add your first videos')).toBeTruthy();
  });

  // ---------- briefs ----------

  test('adapting an analysed video creates an editable brief', async () => {
    await signedIn();
    await withOneAnalysedClip();
    const { findByText, getByText, getByLabelText, findByLabelText } = await render(<App />);

    await fireEvent.press(await findByText(SNOOZE_HOOK));
    expect(await findByText('Why this one works')).toBeTruthy();
    await fireEvent.press(getByText('Adapt for my brand'));

    expect(await findByText('Your version')).toBeTruthy();
    await fireEvent.changeText(getByLabelText('Hook line'), 'Five snoozes. One rule.');
    await fireEvent.press(getByLabelText('Back'));

    await fireEvent.press(await findByLabelText('Back'));
    await fireEvent.press(await findByLabelText('Briefs'));
    expect(await findByText('1 brief,\n1 not dated')).toBeTruthy();
    expect(getByText('“Five snoozes. One rule.”')).toBeTruthy();
    const saved = JSON.parse((await AsyncStorage.getItem('lyrebird.briefs')) ?? '[]');
    expect(saved[0]).toMatchObject({ hook: 'Five snoozes. One rule.', status: 'edited' });
  });

  // ---------- calendar ----------

  test('a new calendar starts empty', async () => {
    await signedIn();
    const { findByLabelText, findByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Calendar'));

    expect(await findByText('Nothing to film\nthis week')).toBeTruthy();
    expect(require('../lib/calendar').__rows).toHaveLength(0);
  });

  test('an entry on the calendar can be rescheduled and its status changed', async () => {
    await signedIn();
    withSampleCalendar();
    await AsyncStorage.setItem('lyrebird.briefs', JSON.stringify(mockBriefs));
    const { findByLabelText, findByText, getByText, getAllByText, queryByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Calendar'));
    await fireEvent.press(await findByText(SNOOZE_HOOK));

    expect(await findByText('Schedule brief')).toBeTruthy();
    expect(getByText('Remove from calendar')).toBeTruthy();
    await fireEvent.press(getAllByText('Posted')[0]);
    await fireEvent.press(getByText('Save schedule'));

    expect(queryByText('Schedule brief')).toBeNull();
    expect(getByText('Posted')).toBeTruthy();
    const saved = require('../lib/calendar').__rows.map((r: any) => ({ briefId: r.brief_id, date: r.scheduled_for, status: r.status }));
    expect(saved).toContainEqual(
      expect.objectContaining({ briefId: 'bbbbbbbb-0000-4000-8000-000000000001', status: 'posted' })
    );
  });

  test('a calendar entry shows the funnel stage of its video, read-only in the sheet', async () => {
    await signedIn();
    withSampleCalendar();
    await AsyncStorage.setItem('lyrebird.briefs', JSON.stringify(mockBriefs));
    const { findByLabelText, findByText, getByLabelText, queryByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Calendar'));
    // Brief 3 was written from a Convert (BOFU) video.
    await fireEvent.press(await findByText('“Last chance before the price goes up”'));

    expect(await findByText('Schedule brief')).toBeTruthy();
    expect(getByLabelText("Stage, Convert, set by the video's analysis")).toBeTruthy();
    expect(queryByText('Tap to change')).toBeNull();
  });

  test('a calendar save that fails shows a message that can be dismissed', async () => {
    await signedIn();
    withSampleCalendar();
    await AsyncStorage.setItem('lyrebird.briefs', JSON.stringify(mockBriefs));
    require('../lib/calendar').scheduleBrief.mockRejectedValueOnce(
      new Error('Could not schedule that brief: the database said no')
    );
    const { findByLabelText, findByText, getByText, getByLabelText, queryByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Calendar'));
    await fireEvent.press(await findByText(SNOOZE_HOOK));
    await fireEvent.press(await findByText('Save schedule'));

    expect(await findByText('Could not schedule that brief: the database said no')).toBeTruthy();
    await fireEvent.press(getByLabelText('Dismiss message'));
    expect(queryByText('Could not schedule that brief: the database said no')).toBeNull();
    expect(getByText('Calendar')).toBeTruthy();
  });

  test('"See brief" on a calendar entry opens the brief', async () => {
    await signedIn();
    withSampleCalendar();
    await AsyncStorage.setItem('lyrebird.briefs', JSON.stringify(mockBriefs));
    const { findByLabelText, findByText, getByText, queryByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Calendar'));
    await fireEvent.press(await findByText(SNOOZE_HOOK));
    await fireEvent.press(await findByText('See brief'));

    expect(await findByText('Your version')).toBeTruthy();
    // From the brief, its own Schedule button opens the sheet without "See brief".
    await fireEvent.press(getByText('Reschedule'));
    expect(await findByText('Schedule brief')).toBeTruthy();
    expect(queryByText('See brief')).toBeNull();
  });

  // ---------- search, settings, branding ----------

  test('search finds videos and briefs', async () => {
    await signedIn();
    await withOneAnalysedClip();
    await AsyncStorage.setItem('lyrebird.briefs', JSON.stringify(mockBriefs));
    const { findByLabelText, getByLabelText, findByText, getByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Search'));
    await fireEvent.changeText(getByLabelText('Search videos and briefs'), 'snooze');

    expect(await findByText('VIDEOS · 1')).toBeTruthy();
    expect(getByText('BRIEFS · 1')).toBeTruthy();
  });

  test('brand changes made from Settings are saved', async () => {
    await signedIn();
    const { findByLabelText, findByText, getByLabelText, getByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Settings'));
    await fireEvent.press(await findByText('Brand profile'));
    await fireEvent.changeText(getByLabelText("Who it's for"), 'Busy parents');
    await fireEvent.press(getByText('Save'));

    expect(await findByText('Settings')).toBeTruthy();
    expect(JSON.parse((await AsyncStorage.getItem('lyrebird.brandSetup')) ?? '{}')).toMatchObject({
      target_audience: 'Busy parents',
    });
  });

  test('the brand colour can be changed on Branding and is saved', async () => {
    await signedIn();
    const { findByLabelText, findByText, getByLabelText, getByText } = await render(<App />);
    const before = brandColorOf({ name: 'Nima Studio' });

    await fireEvent.press(await findByLabelText('Settings'));
    await fireEvent.press(await findByText('Brand profile'));
    await fireEvent.press(getByLabelText(`Brand colour, ${before}. Tap to change.`));
    await fireEvent.press(getByText('Save'));

    const saved = JSON.parse((await AsyncStorage.getItem('lyrebird.brandSetup')) ?? '{}');
    expect(saved.color).toBeDefined();
    expect(saved.color).not.toBe(before);
  });

  test('Appearance in Settings can pin the theme to dark, and the choice is saved', async () => {
    await signedIn();
    const { findByLabelText, findByText, getByRole } = await render(<App />);

    await fireEvent.press(await findByLabelText('Settings'));
    expect(await findByText('Follows your phone’s light or dark setting.')).toBeTruthy();
    await fireEvent.press(getByRole('radio', { name: 'Dark' }));

    expect(await findByText('Always dark.')).toBeTruthy();
    expect(await AsyncStorage.getItem('lyrebird.appearance')).toBe('dark');
  });

  test('Export my briefs shares them as text', async () => {
    await signedIn();
    await AsyncStorage.setItem('lyrebird.briefs', JSON.stringify(mockBriefs.slice(0, 1)));
    const { findByLabelText, findByText } = await render(<App />);

    await fireEvent.press(await findByLabelText('Settings'));
    await fireEvent.press(await findByText('Export my briefs'));

    expect(Share.share).toHaveBeenCalledWith({
      message: expect.stringContaining("HOOK\nI used to hit snooze 5 times. Here's what fixed it."),
    });
  });
});
