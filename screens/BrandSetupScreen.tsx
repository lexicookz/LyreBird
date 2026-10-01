// screens/BrandSetupScreen.tsx
// First-run brand questions, four steps (Figma: "Branding form 1-4").
// Step 1 adds "Who it's for" (target_audience), which the Figma frame doesn't have.
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton, Chip, Eyebrow, PrimaryButton, StepProgress } from '../components/ui';
import { BrandSetup, emptyBrandSetup } from '../data/brandSetup';
import { colors, fonts, funnelStages, FUNNEL_ORDER, pagePadding, radius } from '../theme';
import type { FunnelStage } from '../types';

const TOTAL_STEPS = 4;

const TONES = ['Plain-spoken', 'Warm', 'Dry humour', 'Expert', 'No hype', 'Playful', 'Clinical', 'Blunt'];

// Example hooks for the "So a hook becomes" preview. Writing a real one needs
// Gemini, which only the worker can call, so these are fixed examples keyed on
// the most recently picked tone.
const TONE_HOOKS: Record<string, string> = {
  'Plain-spoken': '“Eleven refill brands. Here’s the one I kept.”',
  Warm: '“If you’ve ever given up on refills, this one’s for you.”',
  'Dry humour': '“I bought 11 refill brands. Nine leaked.”',
  Expert: '“Most refill bottles fail at the valve. Here’s why.”',
  'No hype': '“It’s a bottle you refill. It doesn’t leak. That’s it.”',
  Playful: '“POV: your refill pouch finally behaves.”',
  Clinical: '“Three products, one bottle, zero leaks in 30 days.”',
  Blunt: '“Stop buying refills that leak.”',
};

const COMMON_AVOIDS = ['“Cures”', '“Miracle”', 'Price promises'];

const FOCUS_DESCRIPTIONS: Record<FunnelStage, string> = {
  TOFU: 'People who have never heard of you',
  MOFU: 'Weighing you up against others',
  BOFU: 'Ready to buy, need a reason now',
};

const FOCUS_OUTCOMES: Record<FunnelStage, string> = {
  TOFU: 'Awareness clips surfaced first in your library, and suggested dates that lean top-of-funnel until the mix catches up.',
  MOFU: 'Consider clips surfaced first in your library, and suggested dates that lean mid-funnel until the mix catches up.',
  BOFU: 'Convert clips surfaced first in your library, and suggested dates that lean bottom-of-funnel until the mix catches up.',
};

// ---------- step bodies ----------

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  minHeight,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
  minHeight?: number;
}) {
  return (
    <View style={styles.field}>
      <Eyebrow>{label}</Eyebrow>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        multiline={multiline}
        accessibilityLabel={label}
        style={[
          styles.input,
          multiline ? [styles.inputMultiline, { minHeight }] : styles.inputSingle,
        ]}
      />
    </View>
  );
}

function StepWhatYouSell({
  setup,
  update,
}: {
  setup: BrandSetup;
  update: (patch: Partial<BrandSetup>) => void;
}) {
  return (
    <>
      <Field
        label="Brand name"
        value={setup.name}
        onChangeText={(name) => update({ name })}
        placeholder="Nima Studio"
      />
      <Field
        label="What we sell"
        value={setup.product_summary}
        onChangeText={(product_summary) => update({ product_summary })}
        placeholder="Refillable cleanser, serum and moisturiser. One aluminium bottle, pouches by post."
        multiline
        minHeight={104}
      />
      <Field
        label="Who it's for"
        value={setup.target_audience}
        onChangeText={(target_audience) => update({ target_audience })}
        placeholder="Busy people who want less plastic in the bathroom."
        multiline
        minHeight={80}
      />
      <View style={[styles.note, { backgroundColor: colors.green, flexDirection: 'row', gap: 11 }]}>
        <View style={styles.noteIcon}>
          <Text style={styles.noteIconText}>?</Text>
        </View>
        <Text style={[styles.noteText, { flex: 1 }]}>
          Plain words beat marketing words here. “Refill pouches by post” works better than
          “sustainable skincare solutions”.
        </Text>
      </View>
    </>
  );
}

function StepSound({
  setup,
  update,
}: {
  setup: BrandSetup;
  update: (patch: Partial<BrandSetup>) => void;
}) {
  function toggle(tone: string) {
    update({
      tones: setup.tones.includes(tone)
        ? setup.tones.filter((t) => t !== tone)
        : [...setup.tones, tone],
    });
  }

  const latest = setup.tones[setup.tones.length - 1];

  return (
    <>
      <View style={styles.chipWrap}>
        {TONES.map((tone) => (
          <Chip
            key={tone}
            label={tone}
            selected={setup.tones.includes(tone)}
            onPress={() => toggle(tone)}
          />
        ))}
      </View>
      <View style={[styles.note, { backgroundColor: colors.lilac, gap: 6 }]}>
        <Eyebrow color={colors.textBody}>So a hook becomes</Eyebrow>
        <Text style={styles.previewHook}>
          {latest ? TONE_HOOKS[latest] : 'Pick a tone to see an example.'}
        </Text>
        <Text style={styles.previewHint}>Updates live as you change the picks above.</Text>
      </View>
    </>
  );
}

function StepAvoid({
  setup,
  update,
}: {
  setup: BrandSetup;
  update: (patch: Partial<BrandSetup>) => void;
}) {
  const [draft, setDraft] = useState('');

  function add(term: string) {
    const trimmed = term.trim();
    if (!trimmed || setup.avoid.includes(trimmed)) return;
    update({ avoid: [...setup.avoid, trimmed] });
  }

  function remove(term: string) {
    update({ avoid: setup.avoid.filter((t) => t !== term) });
  }

  const suggestions = COMMON_AVOIDS.filter((t) => !setup.avoid.includes(t));

  return (
    <>
      <View style={styles.list}>
        {setup.avoid.map((term) => (
          <View key={term} style={styles.avoidRow}>
            <Text style={styles.avoidText}>{term}</Text>
            <Pressable
              onPress={() => remove(term)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${term}`}
            >
              <View style={styles.cross}>
                <View style={[styles.crossBar, { transform: [{ rotate: '45deg' }] }]} />
                <View style={[styles.crossBar, { transform: [{ rotate: '-45deg' }] }]} />
              </View>
            </Pressable>
          </View>
        ))}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => {
            add(draft);
            setDraft('');
          }}
          blurOnSubmit={false}
          returnKeyType="done"
          placeholder="Add another…"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Add a word or claim to avoid"
          style={styles.addInput}
        />
      </View>

      {suggestions.length > 0 && (
        <View style={{ gap: 8 }}>
          <Eyebrow>Common ones</Eyebrow>
          <View style={styles.chipWrap}>
            {suggestions.map((term) => (
              <Pressable
                key={term}
                onPress={() => add(term)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${term}`}
                style={styles.suggestion}
              >
                <Text style={styles.suggestionText}>+ {term}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={[styles.note, { backgroundColor: colors.pink }]}>
        <Text style={styles.noteText}>
          This is a filter on our writing, not legal advice. Check your own regulator.
        </Text>
      </View>
    </>
  );
}

function StepFocus({
  setup,
  update,
}: {
  setup: BrandSetup;
  update: (patch: Partial<BrandSetup>) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);

  function setShare(share: number) {
    update({ focusShare: Math.min(100, Math.max(10, Math.round(share / 10) * 10)) });
  }

  function handleTrackPress(e: GestureResponderEvent) {
    if (trackWidth > 0) setShare((e.nativeEvent.locationX / trackWidth) * 100);
  }

  return (
    <>
      <View style={styles.list}>
        {FUNNEL_ORDER.map((stage) => {
          const selected = setup.focus === stage;
          return (
            <Pressable
              key={stage}
              onPress={() => update({ focus: stage })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.option, selected && { backgroundColor: funnelStages[stage].color }]}
            >
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected && <View style={styles.tick} />}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.optionTitle}>{funnelStages[stage].label}</Text>
                <Text style={[styles.optionBody, selected && { color: colors.textBody }]}>
                  {FOCUS_DESCRIPTIONS[stage]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        <View style={styles.mixHeader}>
          <Eyebrow>How much of your mix</Eyebrow>
          <Text style={styles.mixValue}>{setup.focusShare}%</Text>
        </View>
        <Pressable
          onPress={handleTrackPress}
          onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
          hitSlop={{ top: 14, bottom: 14 }}
          accessibilityRole="adjustable"
          accessibilityLabel="How much of your mix"
          accessibilityValue={{ min: 10, max: 100, now: setup.focusShare, text: `${setup.focusShare}%` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            setShare(setup.focusShare + (e.nativeEvent.actionName === 'increment' ? 10 : -10))
          }
          style={styles.track}
        >
          <View style={[styles.trackFill, { width: `${setup.focusShare}%` }]} />
        </Pressable>
      </View>

      <View style={[styles.note, { backgroundColor: colors.lilac, gap: 5 }]}>
        <Eyebrow color={colors.textBody}>So you will see</Eyebrow>
        <Text style={styles.outcome}>{FOCUS_OUTCOMES[setup.focus]}</Text>
      </View>
    </>
  );
}

// ---------- screen ----------

const STEPS = [
  { title: 'What do you\nsell?', subtitle: 'A sentence is plenty. This is what every brief gets written around.' },
  { title: 'How do you\nsound?', subtitle: 'Pick a few. Every brief we write gets rewritten in this voice, so it is worth two minutes now.' },
  { title: 'Anything we\nmust not say?', subtitle: 'Claims you cannot legally make, or words you hate. We avoid them in every brief.' },
  { title: 'What do you\nneed more of?', subtitle: 'We use this to suggest dates and nudge the mix. Change it any time.' },
];

export default function BrandSetupScreen({
  initial,
  onBack,
  onDone,
}: {
  initial?: BrandSetup | null;
  /** Back from step 1. */
  onBack: () => void;
  /** Finished or skipped. `null` if there's nothing worth saving (no brand name). */
  onDone: (setup: BrandSetup | null) => void;
}) {
  const [step, setStep] = useState(1);
  const [setup, setSetup] = useState<BrandSetup>(initial ?? emptyBrandSetup);

  function update(patch: Partial<BrandSetup>) {
    setSetup((current) => ({ ...current, ...patch }));
  }

  // brands.name is NOT NULL, so a setup without a name isn't saved.
  function finish() {
    const named = setup.name.trim();
    onDone(named ? { ...setup, name: named } : null);
  }

  function handleBack() {
    if (step === 1) onBack();
    else setStep(step - 1);
  }

  function handleContinue() {
    if (step < TOTAL_STEPS) setStep(step + 1);
    else finish();
  }

  const { title, subtitle } = STEPS[step - 1];
  const canContinue = step !== 1 || setup.name.trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topRow}>
            <BackButton onPress={handleBack} />
            <Pressable onPress={finish} hitSlop={10} accessibilityRole="button">
              <Text style={styles.skip}>Skip for now</Text>
            </Pressable>
          </View>

          <StepProgress current={step} total={TOTAL_STEPS} />
          <Eyebrow>{`Step ${step} of ${TOTAL_STEPS}`}</Eyebrow>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {step === 1 && <StepWhatYouSell setup={setup} update={update} />}
          {step === 2 && <StepSound setup={setup} update={update} />}
          {step === 3 && <StepAvoid setup={setup} update={update} />}
          {step === 4 && <StepFocus setup={setup} update={update} />}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label={step === TOTAL_STEPS ? 'Finish setup' : 'Continue'}
            onPress={handleContinue}
            disabled={!canContinue}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    paddingHorizontal: pagePadding,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skip: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.textLabel,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 30.6,
    letterSpacing: -1.2,
    color: colors.ink,
    paddingTop: 2,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19.5,
    color: colors.textMuted,
  },
  footer: {
    paddingHorizontal: pagePadding,
    paddingTop: 8,
    paddingBottom: 12,
  },

  // fields
  field: {
    gap: 6,
  },
  input: {
    backgroundColor: colors.field,
    borderRadius: radius.field,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    color: colors.ink,
  },
  inputSingle: {
    height: 52,
    fontSize: 14.5,
  },
  inputMultiline: {
    paddingTop: 13,
    paddingBottom: 13,
    fontSize: 14,
    lineHeight: 21,
    textAlignVertical: 'top',
  },

  // tinted notes
  note: {
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: radius.card,
  },
  noteIcon: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.frost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteIconText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    color: colors.ink,
  },
  noteText: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    lineHeight: 16.7,
    color: colors.textBody,
  },

  // step 2
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  previewHook: {
    fontFamily: fonts.heading,
    fontSize: 14.5,
    lineHeight: 18.85,
    color: colors.ink,
  },
  previewHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textBody,
  },

  // step 3
  list: {
    gap: 8,
  },
  avoidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.field,
    backgroundColor: colors.field,
  },
  avoidText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  cross: {
    width: 13,
    height: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crossBar: {
    position: 'absolute',
    width: 13,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.textFaint,
  },
  addInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.field,
    borderWidth: 0.8,
    borderStyle: 'dashed',
    borderColor: 'rgba(51,36,28,0.24)',
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  suggestion: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 0.8,
    borderColor: 'rgba(51,36,28,0.14)',
    backgroundColor: colors.white,
  },
  suggestionText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textStrong,
  },

  // step 4
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: radius.field,
    backgroundColor: colors.field,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.6,
    borderColor: 'rgba(51,36,28,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  tick: {
    width: 9,
    height: 5,
    marginTop: -2,
    borderLeftWidth: 1.6,
    borderBottomWidth: 1.6,
    borderColor: colors.cream,
    transform: [{ rotate: '-45deg' }],
  },
  optionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14.5,
    color: colors.ink,
  },
  optionBody: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  mixHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  mixValue: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.ink,
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  trackFill: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  outcome: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18.1,
    color: colors.ink,
  },
});
