import type { BackgroundPresetKind } from '../backgrounds/types';
import type { CharacterReaction, StepDialogueScript } from './types';

/**
 * Standalone dialogue script for guided onboarding.
 * Keep every spoken/decoded line <= 12 words so Hermes feels sharp and alive.
 */

export const STEP_DIALOGUE: Record<'welcome' | 'background' | 'tune' | 'done', StepDialogueScript> = {
  welcome: {
    mood: 'happy',
    eyeState: 'happy',
    lines: [
      "Hey. I'm Hermes, synced to your terminal.",
      "Let's make this place yours.",
    ],
  },
  background: {
    mood: 'listening',
    eyeState: 'open',
    lines: [
      'Pick the atmosphere running behind your workspace.',
      'Every choice updates live behind us.',
    ],
  },
  tune: {
    mood: 'focused',
    eyeState: 'open',
    lines: [
      'Dial the glass tint and frosted blur.',
      'Keep text crisp while the motion breathes.',
    ],
  },
  done: {
    mood: 'happy',
    eyeState: 'happy',
    lines: [
      'This feels like you.',
      'Your backdrop is locked in. Ready whenever you are.',
    ],
  },
};

export const PRESET_REACTIONS: Record<BackgroundPresetKind | 'custom', CharacterReaction> = {
  'aurora-drift': {
    mood: 'neutral',
    eyeState: 'half',
    line: '...calm. I like it.',
  },
  'mesh-gradient': {
    mood: 'happy',
    eyeState: 'happy',
    line: 'Smooth corners. Easy on late-night eyes.',
  },
  'braille-rain': {
    mood: 'speaking',
    eyeState: 'wide',
    line: 'Rain in code. Playful and sharp.',
  },
  'scanline-shimmer': {
    mood: 'alert',
    eyeState: 'side',
    line: 'Scanlines sweeping. A little mischievous, right?',
  },
  nebula: {
    mood: 'thinking',
    eyeState: 'half',
    line: 'Deep clouds drifting. Good headspace for thinking.',
  },
  'constellation-drift': {
    mood: 'focused',
    eyeState: 'open',
    line: 'Quiet stars lining up. Very steady.',
  },
  'horizon-tide': {
    mood: 'listening',
    eyeState: 'open',
    line: 'Slow bioluminescent tide. Grounded and clear.',
  },
  custom: {
    mood: 'happy',
    eyeState: 'wide',
    line: 'Your own frame. Bold personal choice.',
  },
};

export function getPresetReaction(presetOrCustomId: string): CharacterReaction {
  if (presetOrCustomId in PRESET_REACTIONS) {
    return PRESET_REACTIONS[presetOrCustomId as BackgroundPresetKind];
  }
  return PRESET_REACTIONS.custom;
}

export function getTuneReaction(
  changedControl: 'opacity' | 'blur',
  opacity: number,
  blurPx: number
): CharacterReaction {
  if (changedControl === 'opacity') {
    if (opacity < 0.35) {
      return {
        mood: 'focused',
        eyeState: 'half',
        line: 'Whisper-quiet backdrop. Pure terminal focus.',
      };
    }
    if (opacity > 0.72) {
      return {
        mood: 'happy',
        eyeState: 'wide',
        line: 'Rich color coming right through the glass.',
      };
    }
    return {
      mood: 'happy',
      eyeState: 'open',
      line: 'Balanced tint. Clean and readable.',
    };
  }

  if (blurPx <= 4) {
    return {
      mood: 'alert',
      eyeState: 'wide',
      line: 'Crystal sharp edges. Zero haze behind panes.',
    };
  }
  if (blurPx >= 20) {
    return {
      mood: 'thinking',
      eyeState: 'half',
      line: 'Deep frosted glass. Soft glow, crisp type.',
    };
  }
  return {
    mood: 'focused',
    eyeState: 'open',
    line: 'Smooth frost. Keeps every line legible.',
  };
}
