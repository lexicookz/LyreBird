// Guards the hand-written mirror in types/brief.ts against the JSON Schema
// exported from worker/app/brief_schema.py.
//
// tsc checks that the samples below match the TS types exactly; this test
// checks that their keys and enum values match the exported schema. If either
// side changes alone, one of the two fails.

import type { CalendarPlatform, FunnelStage } from '../types';
import type { AnalysisField, BrandProfile, BriefDraft } from '../types/brief';
import brandProfileSchema from '../worker/schemas/brand_profile.schema.json';
import briefDraftSchema from '../worker/schemas/brief_draft.schema.json';

type Schema = {
  $ref?: string;
  $defs?: Record<string, Schema>;
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: string[];
  anyOf?: Schema[];
};

// A Record over the union makes tsc reject a missing or extra member, so these
// lists are exhaustive by construction.
const funnelStages: Record<FunnelStage, true> = { TOFU: true, MOFU: true, BOFU: true };
const platforms: Record<CalendarPlatform, true> = {
  tiktok: true,
  instagram: true,
  youtube: true,
  other: true,
};
const analysisFields: Record<AnalysisField, true> = {
  hook: true,
  transcript: true,
  onScreenText: true,
  shotBeats: true,
  pacing: true,
  cta: true,
  format: true,
  funnelStage: true,
};

const sampleBrand: BrandProfile = {
  name: 'Fieldnote Coffee',
  niche: 'Specialty coffee for home brewers',
  target_audience: 'Home brewers aged 25-45 who already own a grinder and scale.',
  tone: 'Precise and nerdy, but never condescending.',
  goal: 'Follows from people who brew at home',
  constraints: ['No price claims'],
  style_profile: null,
};

const sampleDraft: BriefDraft = {
  title: 'Your grinder is not the problem',
  funnel_stage: 'TOFU',
  target_duration_seconds: 28,
  hook: {
    line: 'A better grinder will not save stale beans.',
    on_screen_text: 'NO ROAST DATE, NO SALE',
    visual: 'Overhead, beans hitting the scale',
  },
  beats: [
    {
      start_seconds: 0,
      end_seconds: 2,
      shot: 'Overhead on the scale',
      action: 'Beans pour onto the scale',
      voiceover: '',
      on_screen_text: 'NO ROAST DATE, NO SALE',
    },
  ],
  cta: 'Check the bag in your cupboard right now.',
  caption: 'Roast date or it did not happen.',
  hashtags: ['specialtycoffee'],
  why_it_works: [
    {
      brief_element: 'hook',
      source_field: 'hook',
      source_detail: 'Contrarian claim in the first line',
      rationale: 'Challenges an expensive habit the audience already has.',
    },
  ],
  production_notes: ['Cut on the grinder clicks.'],
  posting_slots: [
    { day_offset: 1, start_hour: 18, end_hour: 20, platform: 'tiktok', rationale: 'Evening scroll.' },
  ],
};

/** Follows $ref and nullable anyOf down to the object or enum schema. */
function resolve(node: Schema, root: Schema): Schema {
  if (node.$ref) return resolve(root.$defs![node.$ref.split('/').pop()!], root);
  const nonNull = node.anyOf?.find((s) => (s as { type?: string }).type !== 'null');
  return nonNull ? resolve(nonNull, root) : node;
}

/** Asserts the sample's keys match the schema's at every nested object. */
function expectSameShape(sample: unknown, node: Schema, root: Schema, path: string) {
  const schema = resolve(node, root);
  if (schema.properties && sample !== null && typeof sample === 'object' && !Array.isArray(sample)) {
    expect({ path, keys: Object.keys(sample).sort() }).toEqual({
      path,
      keys: Object.keys(schema.properties).sort(),
    });
    for (const [key, child] of Object.entries(schema.properties)) {
      expectSameShape((sample as Record<string, unknown>)[key], child, root, `${path}.${key}`);
    }
  } else if (schema.items && Array.isArray(sample)) {
    expect(sample.length).toBeGreaterThan(0); // an empty sample would check nothing
    sample.forEach((item, i) => expectSameShape(item, schema.items!, root, `${path}[${i}]`));
  }
}

function enumAt(root: Schema, ...keys: string[]): string[] {
  let node: Schema = root;
  for (const key of keys) {
    node = resolve(node, root);
    node = key === '[]' ? node.items! : node.properties![key];
  }
  return [...resolve(node, root).enum!].sort();
}

describe('types/brief.ts mirrors worker/schemas', () => {
  it('BriefDraft has the same fields at every level', () => {
    expectSameShape(sampleDraft, briefDraftSchema as Schema, briefDraftSchema as Schema, 'BriefDraft');
  });

  it('BrandProfile has the same fields', () => {
    expectSameShape(sampleBrand, brandProfileSchema as Schema, brandProfileSchema as Schema, 'BrandProfile');
  });

  it('enum vocabularies match', () => {
    const root = briefDraftSchema as Schema;
    expect(enumAt(root, 'funnel_stage')).toEqual(Object.keys(funnelStages).sort());
    expect(enumAt(root, 'posting_slots', '[]', 'platform')).toEqual(Object.keys(platforms).sort());
    expect(enumAt(root, 'why_it_works', '[]', 'source_field')).toEqual(
      Object.keys(analysisFields).sort()
    );
  });
});
