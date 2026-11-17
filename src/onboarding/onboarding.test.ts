import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRESETS } from '../backgrounds/presets';
import {
  PRESET_REACTIONS,
  STEP_DIALOGUE,
  getPresetReaction,
  getTuneReaction,
} from './dialogueScript';
import {
  ONBOARDING_STEPS,
  getNextStepIndex,
  getPrevStepIndex,
  getVisibleSteps,
} from './stepEngine';
import {
  hasOnboardingQueryParam,
  ONBOARDING_STORAGE_KEY,
  parseOnboardingState,
  readOnboardingStorageRaw,
  shouldShowOnboardingOnBoot,
} from './trigger';

function countWords(line: string): number {
  return line.trim().split(/\s+/).filter(Boolean).length;
}

test('all 7 presets and custom slot have unique reaction lines <= 12 words and moods', () => {
  const seenLines = new Set<string>();

  for (const preset of DEFAULT_PRESETS) {
    const reaction = PRESET_REACTIONS[preset.id];
    assert.ok(reaction, `missing reaction for ${preset.id}`);
    assert.ok(reaction.line.length > 0);
    assert.ok(
      countWords(reaction.line) <= 12,
      `reaction too long (${countWords(reaction.line)} words) for ${preset.id}`
    );
    assert.equal(seenLines.has(reaction.line), false, `duplicate reaction line for ${preset.id}`);
    seenLines.add(reaction.line);
  }

  const customReaction = getPresetReaction('custom-123');
  assert.equal(customReaction.line, PRESET_REACTIONS.custom.line);
  assert.ok(countWords(customReaction.line) <= 12);

  for (const [stepId, script] of Object.entries(STEP_DIALOGUE)) {
    for (const line of script.lines) {
      assert.ok(
        countWords(line) <= 12,
        `step ${stepId} line exceeds 12 words: "${line}"`
      );
    }
  }

  for (const op of [0.2, 0.55, 0.82]) {
    assert.ok(countWords(getTuneReaction('opacity', op, 12).line) <= 12);
  }
  for (const blur of [2, 12, 24]) {
    assert.ok(countWords(getTuneReaction('blur', 0.64, blur).line) <= 12);
  }
});

test('generic step engine supports extensible steps and bounded navigation', () => {
  const extended = [
    ...ONBOARDING_STEPS.slice(0, 3),
    {
      id: 'future-slot',
      label: '04 · Audio',
      heading: 'Audio profile',
      primaryCta: 'Continue',
      when: ({ settings }: { settings: { opacity: number } }) => settings.opacity > 0.5,
    },
    ONBOARDING_STEPS[3],
  ];

  const hidden = getVisibleSteps(extended, { settings: { opacity: 0.3 } as never });
  assert.equal(hidden.length, 4);

  const shown = getVisibleSteps(extended, { settings: { opacity: 0.7 } as never });
  assert.equal(shown.length, 5);
  assert.equal(getNextStepIndex(0, shown.length), 1);
  assert.equal(getNextStepIndex(4, shown.length), 4);
  assert.equal(getPrevStepIndex(0), 0);
  assert.equal(getPrevStepIndex(3), 2);
});

test('onboarding trigger handles fresh profiles, completed profiles, corrupt state, and ?onboarding=1', () => {
  assert.equal(shouldShowOnboardingOnBoot('', null), true);
  assert.equal(shouldShowOnboardingOnBoot('', 'corrupt-json{'), true);

  const completed = JSON.stringify({ completed: true, skipped: false, updatedAt: 1000 });
  assert.equal(parseOnboardingState(completed)?.completed, true);
  assert.equal(shouldShowOnboardingOnBoot('', completed), false);

  assert.equal(hasOnboardingQueryParam('?onboarding=1'), true);
  assert.equal(hasOnboardingQueryParam('?view=canvas&onboarding=1'), true);
  assert.equal(shouldShowOnboardingOnBoot('?onboarding=1', completed), true);
});

test('readOnboardingStorageRaw migrates the legacy duet.* key once and preserves completion', () => {
  const backing = new Map<string, string>();
  const storage = {
    getItem: (k: string): string | null => (backing.has(k) ? (backing.get(k) as string) : null),
    setItem: (k: string, v: string): void => {
      backing.set(k, v);
    },
    removeItem: (k: string): void => {
      backing.delete(k);
    },
  };
  const g = globalThis as unknown as { window?: unknown };
  const original = g.window;
  g.window = { localStorage: storage };

  try {
    const completed = JSON.stringify({ completed: true, skipped: true, updatedAt: 1234 });
    // Legacy key only → migrated to the current key, legacy removed, value preserved
    backing.set('duet.onboarding.v1', completed);
    assert.equal(readOnboardingStorageRaw(), completed);
    assert.equal(storage.getItem(ONBOARDING_STORAGE_KEY), completed);
    assert.equal(storage.getItem('duet.onboarding.v1'), null);

    // Current key already present → returned untouched
    const fresh = JSON.stringify({ completed: true, skipped: false, updatedAt: 99 });
    backing.clear();
    backing.set(ONBOARDING_STORAGE_KEY, fresh);
    assert.equal(readOnboardingStorageRaw(), fresh);

    // Nothing stored → null
    backing.clear();
    assert.equal(readOnboardingStorageRaw(), null);
  } finally {
    if (original === undefined) delete g.window;
    else g.window = original;
  }
});
