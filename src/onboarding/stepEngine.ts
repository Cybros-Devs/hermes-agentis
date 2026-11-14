import type { OnboardingStepContext, OnboardingStepDefinition } from './types';

export const ONBOARDING_STEPS: readonly OnboardingStepDefinition<OnboardingStepContext>[] = [
  {
    id: 'welcome',
    label: '01 · Welcome',
    heading: 'Meet Hermes',
    primaryCta: 'Choose backdrop',
    canSkip: true,
  },
  {
    id: 'background',
    label: '02 · Atmosphere',
    heading: 'Background preset',
    primaryCta: 'Tune glass',
    canSkip: true,
  },
  {
    id: 'tune',
    label: '03 · Glass',
    heading: 'Opacity & blur',
    primaryCta: 'Finish',
    canSkip: true,
  },
  {
    id: 'done',
    label: '04 · Ready',
    heading: 'All set',
    primaryCta: 'Save & enter',
    canSkip: true,
  },
];

export function getVisibleSteps<TContext>(
  steps: readonly OnboardingStepDefinition<TContext>[],
  ctx: TContext
): OnboardingStepDefinition<TContext>[] {
  return steps.filter((step) => (step.when ? step.when(ctx) : true));
}

export function clampStepIndex(index: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.max(0, Math.min(totalSteps - 1, index));
}

export function getNextStepIndex(currentIndex: number, totalSteps: number): number {
  return clampStepIndex(currentIndex + 1, totalSteps);
}

export function getPrevStepIndex(currentIndex: number): number {
  return Math.max(0, currentIndex - 1);
}
