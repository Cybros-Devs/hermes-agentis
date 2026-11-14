import type { BackgroundSettings } from '../backgrounds/types';
import type { EyeState, ExpressionMood } from '../types/hermes';

export type OnboardingStepId = 'welcome' | 'background' | 'tune' | 'done' | (string & {});

export interface CharacterReaction {
  mood: ExpressionMood;
  eyeState: EyeState;
  line: string;
}

export interface StepDialogueScript {
  mood: ExpressionMood;
  eyeState: EyeState;
  lines: readonly [string] | readonly [string, string];
}

export interface OnboardingStepContext {
  settings: BackgroundSettings;
}

export interface OnboardingStepDefinition<TContext = OnboardingStepContext> {
  id: OnboardingStepId;
  label: string;
  heading: string;
  primaryCta: string;
  canSkip?: boolean;
  when?: (ctx: TContext) => boolean;
}

export interface OnboardingPersistedState {
  completed: boolean;
  skipped?: boolean;
  updatedAt: number;
}
