// screens/BrandProfileScreen.tsx
// Figma: "Branding" (121:1241). The brand every brief is written against,
// editable in place. Holds the same answers as first-run brand setup.
// (Sign out moved to Settings.)
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton, BrandMark, Chip, Eyebrow } from '../components/ui';
import { BRAND_COLORS, BrandSetup, TONES, brandColorOf, emptyBrandSetup } from '../data/brandSetup';
import { fonts, FUNNEL_ORDER, pagePadding, radius, Colors, useStyles, useTheme } from '../theme';

const FUNNEL_NOTES = {
  TOFU: 'Briefs will lean top-of-funnel until this shifts.',
  MOFU: 'Briefs will lean mid-funnel until this shifts.',
  BOFU: 'Briefs will lean bottom-of-funnel until this shifts.',
};

export default function BrandProfileScreen({
  setup,
  onSave,
  onBack,
}: {
  /** The saved answers, or null if setup was skipped. */
  setup: BrandSetup | null;
  onSave: (setup: BrandSetup) => void;
  onBack: () => void;
}) {
  const { colors, stages } = useTheme();
  const styles = useStyles(makeStyles);
  const [draft, setDraft] = useState<BrandSetup>(setup ?? emptyBrandSetup);
  const [addingTone, setAddingTone] = useState(false);
  const [avoidDraft, setAvoidDraft] = useState('');
  const [trackWidth, setTrackWidth] = useState(0);

  const dirty = JSON.stringify(draft) !== JSON.stringify(setup ?? emptyBrandSetup);
  const canSave = dirty && draft.name.trim().length > 0;

  function update(patch: Partial<BrandSetup>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function handleSave() {
    if (!canSave) return;
    onSave({ ...draft, name: draft.name.trim() });
  }

  function handleBack() {
    if (!dirty) return onBack();
    Alert.alert('Discard changes?', 'Your edits to the brand profile haven’t been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onBack },
    ]);
  }

  function addAvoid() {
    const term = avoidDraft.trim();
    if (term && !draft.avoid.includes(term)) update({ avoid: [...draft.avoid, term] });
    setAvoidDraft('');
  }

  function cycleColor() {
    const current = BRAND_COLORS.indexOf(brandColorOf(draft));
    update({ color: BRAND_COLORS[(current + 1) % BRAND_COLORS.length] });
  }

  function cycleFocus() {
    update({ focus: FUNNEL_ORDER[(FUNNEL_ORDER.indexOf(draft.focus) + 1) % FUNNEL_ORDER.length] });
  }

  function setShare(share: number) {
    update({ focusShare: Math.min(100, Math.max(10, Math.round(share / 10) * 10)) });
  }

  function handleTrackPress(e: GestureResponderEvent) {
    if (trackWidth > 0) setShare((e.nativeEvent.locationX / trackWidth) * 100);
  }

  const unusedTones = TONES.filter((t) => !draft.tones.includes(t));

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.topRow}>
            <BackButton onPress={handleBack} />
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
            >
              <Text style={[styles.save, !canSave && { opacity: 0.35 }]}>Save</Text>
            </Pressable>
          </View>

          <View style={styles.identity}>
            <BrandMark
              name={draft.name}
              color={colors[brandColorOf(draft)]}
              size={58}
              shape="square"
              onPress={cycleColor}
              accessibilityLabel={`Brand colour, ${brandColorOf(draft)}. Tap to change.`}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <TextInput
                value={draft.name}
                onChangeText={(name) => update({ name })}
                placeholder="Brand name"
                placeholderTextColor={colors.textPlaceholder}
                accessibilityLabel="Brand name"
                style={styles.nameInput}
              />
              <Text style={styles.hint}>Tap the square for a new colour, or anything below to edit.</Text>
            </View>
          </View>

          <Eyebrow>Every brief is written against this</Eyebrow>

          <View style={[styles.card, { backgroundColor: colors.lilac }]}>
            <Eyebrow color={colors.onPastelBody}>What we sell</Eyebrow>
            <TextInput
              value={draft.product_summary}
              onChangeText={(product_summary) => update({ product_summary })}
              multiline
              placeholder="What do you sell? A sentence is plenty."
              placeholderTextColor={colors.onPastelBody}
              accessibilityLabel="What we sell"
              style={styles.bodyInput}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.green }]}>
            <Eyebrow color={colors.onPastelBody}>Who it's for</Eyebrow>
            <TextInput
              value={draft.target_audience}
              onChangeText={(target_audience) => update({ target_audience })}
              multiline
              placeholder="Who are you trying to reach?"
              placeholderTextColor={colors.onPastelBody}
              accessibilityLabel="Who it's for"
              style={styles.bodyInput}
            />
          </View>

          <View style={[styles.card, styles.plainCard]}>
            <Eyebrow>Tone</Eyebrow>
            <View style={styles.chips}>
              {draft.tones.map((tone) => (
                <Chip
                  key={tone}
                  label={tone}
                  onPress={() => update({ tones: draft.tones.filter((t) => t !== tone) })}
                />
              ))}
              {unusedTones.length > 0 && (
                <Pressable
                  onPress={() => setAddingTone(!addingTone)}
                  style={styles.addChip}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: addingTone }}
                >
                  <Text style={styles.addChipText}>{addingTone ? 'Done' : '+ add'}</Text>
                </Pressable>
              )}
            </View>
            {addingTone && (
              <View style={styles.chips}>
                {unusedTones.map((tone) => (
                  <Pressable
                    key={tone}
                    onPress={() => update({ tones: [...draft.tones, tone] })}
                    style={styles.addChip}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${tone}`}
                  >
                    <Text style={styles.addChipText}>+ {tone}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {draft.tones.length > 0 && <Text style={styles.small}>Tap a tone to remove it.</Text>}
          </View>

          <View style={[styles.card, styles.plainCard]}>
            <Eyebrow>Never say</Eyebrow>
            {draft.avoid.map((term) => (
              <View key={term} style={styles.avoidRow}>
                <View style={styles.dash} />
                <Text style={styles.avoidText}>{term}</Text>
                <Pressable
                  onPress={() => update({ avoid: draft.avoid.filter((t) => t !== term) })}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${term}`}
                >
                  <Text style={styles.remove}>×</Text>
                </Pressable>
              </View>
            ))}
            <TextInput
              value={avoidDraft}
              onChangeText={setAvoidDraft}
              onSubmitEditing={addAvoid}
              blurOnSubmit={false}
              returnKeyType="done"
              placeholder="Add another…"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="Add a word or claim to avoid"
              style={styles.avoidInput}
            />
          </View>

          <View style={[styles.card, { backgroundColor: colors.peach }]}>
            <Eyebrow color={colors.onPastelBody}>This quarter we need</Eyebrow>
            <View style={styles.focusRow}>
              <Pressable
                onPress={cycleFocus}
                accessibilityRole="button"
                accessibilityLabel={`Focus, ${stages[draft.focus].label}. Tap to change.`}
              >
                <Text style={styles.focusLabel}>{stages[draft.focus].label} ›</Text>
              </Pressable>
              <Text style={styles.focusValue}>{draft.focusShare}%</Text>
            </View>
            <Pressable
              onPress={handleTrackPress}
              onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
              hitSlop={{ top: 12, bottom: 12 }}
              accessibilityRole="adjustable"
              accessibilityLabel="How much of your mix"
              accessibilityValue={{ min: 10, max: 100, now: draft.focusShare, text: `${draft.focusShare}%` }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) =>
                setShare(draft.focusShare + (e.nativeEvent.actionName === 'increment' ? 10 : -10))
              }
              style={styles.track}
            >
              <View style={[styles.trackFill, { width: `${draft.focusShare}%` }]} />
            </Pressable>
            <Text style={styles.pastelSmall}>{FUNNEL_NOTES[draft.focus]}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingHorizontal: pagePadding,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  save: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textLabel,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  nameInput: {
    fontFamily: fonts.display,
    fontSize: 25,
    letterSpacing: -1,
    color: colors.ink,
    padding: 0,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  card: {
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 9,
  },
  plainCard: {
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  bodyInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onPastel,
    padding: 0,
    textAlignVertical: 'top',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  addChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 0.8,
    borderColor: colors.hairline,
  },
  addChipText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textStrong,
  },
  small: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textBody,
  },
  pastelSmall: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.onPastelBody,
  },
  avoidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dash: {
    width: 12,
    height: 1.6,
    backgroundColor: colors.danger,
  },
  avoidText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.ink,
  },
  remove: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.textFaint,
  },
  avoidInput: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.ink,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: colors.divider,
  },
  focusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  focusLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: colors.onPastel,
  },
  focusValue: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.onPastel,
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.frost,
    overflow: 'hidden',
  },
  trackFill: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.onPastel,
  },
});
