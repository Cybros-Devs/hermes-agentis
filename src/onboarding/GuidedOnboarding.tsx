import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Volume2, VolumeX, X } from 'lucide-react';
import {
  BackgroundCustomSlots,
  BackgroundPresetGrid,
  BackgroundTuningSliders,
} from '../backgrounds/BackgroundControls';
import {
  DEFAULT_BACKGROUND_SETTINGS,
  ONBOARDING_REPLAY_EVENT,
  clampBlurPx,
  clampOpacity,
  loadBackgroundSettings,
  publishBackgroundSettings,
  subscribeBackgroundSettings,
} from '../backgrounds/persistence';
import { getPresetById } from '../backgrounds/presets';
import type { BackgroundCustomSlot, BackgroundSettings } from '../backgrounds/types';
import type { ExpressionMood, EyeState } from '../types/hermes';
import type { LookTarget } from '../utils/asciiPortraitEngine';
import { CharacterHost } from './CharacterHost';
import {
  STEP_DIALOGUE,
  getPresetReaction,
  getTuneReaction,
} from './dialogueScript';
import './onboarding.css';
import {
  ONBOARDING_STEPS,
  getNextStepIndex,
  getPrevStepIndex,
  getVisibleSteps,
} from './stepEngine';
import {
  isReducedMotionPreferred,
  saveOnboardingCompleted,
  shouldShowOnboardingOnBoot,
} from './trigger';

const MOOD_CYCLE: readonly ExpressionMood[] = [
  'happy',
  'focused',
  'thinking',
  'listening',
  'alert',
  'neutral',
];

export function GuidedOnboarding() {
  const [shouldBootOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return shouldShowOnboardingOnBoot(
        window.location.search,
        window.localStorage.getItem('duet.onboarding.v1')
      );
    } catch {
      return false;
    }
  });

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [bgSettings, setBgSettings] = useState<BackgroundSettings>(loadBackgroundSettings);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [userInteracted, setUserInteracted] = useState(false);
  const [reactionOverride, setReactionOverride] = useState<{
    mood: ExpressionMood;
    eyeState: EyeState;
    lines: readonly string[];
    key: string;
  } | null>(null);

  const lookTargetRef = useRef<LookTarget | null>(null);
  const modalCardRef = useRef<HTMLDivElement | null>(null);

  // Never block initial paint: let App + BackgroundLayer render first, then mount & fade in
  useEffect(() => {
    if (!shouldBootOpen) return;
    if (isReducedMotionPreferred()) {
      setMounted(true);
      setVisible(true);
      return;
    }

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      setMounted(true);
      raf2 = window.requestAnimationFrame(() => {
        setVisible(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [shouldBootOpen]);

  // Listen for "Replay intro" triggers from settings
  useEffect(() => {
    const onReplay = () => {
      setUserInteracted(true);
      setStepIndex(0);
      setReactionOverride(null);
      setBgSettings(loadBackgroundSettings());
      setMounted(true);
      if (isReducedMotionPreferred()) {
        setVisible(true);
      } else {
        window.requestAnimationFrame(() => setVisible(true));
      }
    };
    window.addEventListener(ONBOARDING_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(ONBOARDING_REPLAY_EVENT, onReplay);
  }, []);

  // Keep synced with Settings -> Backdrop if changed externally
  useEffect(() => {
    return subscribeBackgroundSettings((next) => setBgSettings(next));
  }, []);

  // Toggle attribute on <html> so only app chrome blurs/dims while BackgroundLayer remains clear
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (mounted && visible) {
      document.documentElement.setAttribute('data-onboarding-open', 'true');
    } else {
      document.documentElement.removeAttribute('data-onboarding-open');
    }
    return () => {
      document.documentElement.removeAttribute('data-onboarding-open');
    };
  }, [mounted, visible]);

  const activeSteps = useMemo(
    () => getVisibleSteps(ONBOARDING_STEPS, { settings: bgSettings }),
    [bgSettings]
  );
  const currentStep = activeSteps[Math.min(stepIndex, activeSteps.length - 1)] ?? activeSteps[0];

  const closeModal = useCallback((resetToDefaults: boolean) => {
    if (resetToDefaults) {
      setBgSettings((prev) => {
        const defaults: BackgroundSettings = {
          ...DEFAULT_BACKGROUND_SETTINGS,
          customSlots: prev.customSlots,
        };
        publishBackgroundSettings(defaults);
        return defaults;
      });
    }
    saveOnboardingCompleted(resetToDefaults);
    setVisible(false);

    if (isReducedMotionPreferred()) {
      setMounted(false);
    } else {
      window.setTimeout(() => setMounted(false), 200);
    }
  }, []);

  // Escape always skips to defaults and never traps user
  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mounted, closeModal]);

  // Focus modal card cleanly once visible
  useEffect(() => {
    if (visible && modalCardRef.current) {
      modalCardRef.current.focus({ preventScroll: true });
    }
  }, [visible]);

  const handleSelectPresetOrCustom = useCallback((id: string) => {
    setUserInteracted(true);
    setBgSettings((prev) => {
      const next: BackgroundSettings = { ...prev, activeId: id };
      publishBackgroundSettings(next);
      return next;
    });

    const reaction = getPresetReaction(id);
    setReactionOverride({
      mood: reaction.mood,
      eyeState: reaction.eyeState,
      lines: [reaction.line],
      key: `preset-${id}-${Date.now()}`,
    });
  }, []);

  const handleChangeOpacity = useCallback((rawOpacity: number) => {
    setUserInteracted(true);
    const opacity = clampOpacity(rawOpacity);
    setBgSettings((prev) => {
      const next: BackgroundSettings = { ...prev, opacity };
      publishBackgroundSettings(next);
      const reaction = getTuneReaction('opacity', opacity, next.blurPx);
      setReactionOverride({
        mood: reaction.mood,
        eyeState: reaction.eyeState,
        lines: [reaction.line],
        key: `opacity-${Math.round(opacity * 100)}`,
      });
      return next;
    });
  }, []);

  const handleChangeBlurPx = useCallback((rawBlur: number) => {
    setUserInteracted(true);
    const blurPx = clampBlurPx(rawBlur);
    setBgSettings((prev) => {
      const next: BackgroundSettings = { ...prev, blurPx };
      publishBackgroundSettings(next);
      const reaction = getTuneReaction('blur', next.opacity, blurPx);
      setReactionOverride({
        mood: reaction.mood,
        eyeState: reaction.eyeState,
        lines: [reaction.line],
        key: `blur-${blurPx}`,
      });
      return next;
    });
  }, []);

  const handleAddCustomSlot = useCallback((slot: BackgroundCustomSlot) => {
    setUserInteracted(true);
    setBgSettings((prev) => {
      const next: BackgroundSettings = {
        ...prev,
        activeId: slot.id,
        customSlots: [slot, ...prev.customSlots].slice(0, 6),
      };
      publishBackgroundSettings(next);
      return next;
    });
    const reaction = getPresetReaction('custom');
    setReactionOverride({
      mood: reaction.mood,
      eyeState: reaction.eyeState,
      lines: [reaction.line],
      key: `custom-${slot.id}`,
    });
  }, []);

  const handleRemoveCustomSlot = useCallback((id: string) => {
    setUserInteracted(true);
    setBgSettings((prev) => {
      const next: BackgroundSettings = {
        ...prev,
        activeId: prev.activeId === id ? DEFAULT_BACKGROUND_SETTINGS.activeId : prev.activeId,
        customSlots: prev.customSlots.filter((s) => s.id !== id),
      };
      publishBackgroundSettings(next);
      return next;
    });
  }, []);

  const handleStepNext = () => {
    setUserInteracted(true);
    if (stepIndex >= activeSteps.length - 1) {
      closeModal(false);
      return;
    }
    setReactionOverride(null);
    setStepIndex((i) => getNextStepIndex(i, activeSteps.length));
  };

  const handleStepBack = () => {
    setUserInteracted(true);
    if (stepIndex <= 0) return;
    setReactionOverride(null);
    setStepIndex((i) => getPrevStepIndex(i));
  };

  const handleCycleMood = () => {
    setUserInteracted(true);
    setReactionOverride((prev) => {
      const baseMood = prev?.mood ?? STEP_DIALOGUE[currentStep.id as keyof typeof STEP_DIALOGUE]?.mood ?? 'happy';
      const idx = MOOD_CYCLE.indexOf(baseMood);
      const nextMood = MOOD_CYCLE[(idx + 1) % MOOD_CYCLE.length];
      return {
        mood: nextMood,
        eyeState: nextMood === 'happy' ? 'happy' : nextMood === 'thinking' ? 'half' : 'open',
        lines: prev?.lines ?? STEP_DIALOGUE[currentStep.id as keyof typeof STEP_DIALOGUE]?.lines ?? ['Ready when you are.'],
        key: `mood-${nextMood}-${Date.now()}`,
      };
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 1.4));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.35) * 1.4));
    lookTargetRef.current = { x: nx, y: ny };
  };

  if (!mounted || !currentStep) return null;

  const stepScript =
    STEP_DIALOGUE[currentStep.id as keyof typeof STEP_DIALOGUE] ?? STEP_DIALOGUE.welcome;
  const activeMood = reactionOverride?.mood ?? stepScript.mood;
  const activeEye = reactionOverride?.eyeState ?? stepScript.eyeState;
  const activeLines = reactionOverride?.lines ?? stepScript.lines;
  const activeSpeechKey = reactionOverride?.key ?? `step-${currentStep.id}`;

  const activePreset = getPresetById(bgSettings.activeId);
  const activeCustom = bgSettings.customSlots.find((s) => s.id === bgSettings.activeId);
  const activeName = activeCustom?.label ?? activePreset?.name ?? 'Aurora Drift';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-step-heading"
      data-testid="onboarding-modal"
      data-step={currentStep.id}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        lookTargetRef.current = null;
      }}
      className={`onboarding-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        ref={modalCardRef}
        tabIndex={-1}
        className={`onboarding-modal-card relative flex flex-col w-full max-w-[540px] max-h-[92vh] rounded-2xl border border-[#34D399]/35 bg-[#081310]/86 backdrop-blur-xl shadow-[0_24px_72px_rgba(0,0,0,0.62)] p-4 sm:p-5 text-[#ECF3F0] focus:outline-none ${
          visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-[0.98]'
        }`}
      >
        {/* Top bar: step indicator + progress + sound toggle + Skip */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-[11px] tracking-wide text-[#6EE7B7] uppercase shrink-0">
              {currentStep.label}
            </span>
            <div className="flex items-center gap-1" aria-hidden="true">
              {activeSteps.map((s, idx) => (
                <span
                  key={s.id}
                  className={`h-1 rounded-full transition-all ${
                    idx === stepIndex
                      ? 'w-5 bg-[#34D399]'
                      : idx < stepIndex
                      ? 'w-2.5 bg-[#34D399]/55'
                      : 'w-2.5 bg-white/15'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setUserInteracted(true);
                setSoundEnabled((v) => !v);
              }}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? 'Mute onboarding voice' : 'Unmute onboarding voice'}
              data-testid="onboarding-mute-toggle"
              className="p-1.5 rounded-lg text-emerald-100/60 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => closeModal(true)}
              data-testid="onboarding-skip"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11.5px] text-emerald-100/65 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
            >
              <span>Skip</span>
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Character host pinned above step controls so portrait & dialogue stay visible on compact viewports */}
        <div className="shrink-0 pt-2.5 pb-2 border-b border-white/6">
          <h2 id="onboarding-step-heading" className="sr-only">
            {currentStep.heading}
          </h2>
          <CharacterHost
            mood={activeMood}
            eyeState={activeEye}
            lines={activeLines}
            speechKey={activeSpeechKey}
            soundEnabled={soundEnabled}
            userInteracted={userInteracted}
            lookTargetRef={lookTargetRef}
            onCycleMood={handleCycleMood}
          />
        </div>

        {/* Scrollable step controls keeping header, character, and footer always visible */}
        <div className="flex-1 min-h-0 overflow-y-auto cyber-scroll pr-0.5">
          {/* Step body — one decision per step, reuses BackgroundControls */}
          <div className="pt-2.5 space-y-3">
            {currentStep.id === 'welcome' && (
              <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-2.5 flex items-center justify-between text-xs text-emerald-100/70">
                <span>Live glass backdrop &amp; contrast setup</span>
                <span className="font-mono text-[11px] text-[#6EE7B7]">4 quick steps</span>
              </div>
            )}

            {currentStep.id === 'background' && (
              <div className="space-y-3">
                <BackgroundPresetGrid
                  activeId={bgSettings.activeId}
                  onSelectActive={handleSelectPresetOrCustom}
                  columns={3}
                />
                <div className="pt-2 border-t border-white/8">
                  <BackgroundCustomSlots
                    activeId={bgSettings.activeId}
                    customSlots={bgSettings.customSlots}
                    onSelectActive={handleSelectPresetOrCustom}
                    onAddCustomSlot={handleAddCustomSlot}
                    onRemoveCustomSlot={handleRemoveCustomSlot}
                  />
                </div>
              </div>
            )}

            {currentStep.id === 'tune' && (
              <div className="rounded-xl border border-white/10 bg-black/25 p-3.5">
                <BackgroundTuningSliders
                  opacity={bgSettings.opacity}
                  blurPx={bgSettings.blurPx}
                  onChangeOpacity={handleChangeOpacity}
                  onChangeBlurPx={handleChangeBlurPx}
                />
              </div>
            )}

            {currentStep.id === 'done' && (
              <div className="rounded-xl border border-[#34D399]/30 bg-[#34D399]/8 px-3.5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <div className="text-[11px] text-emerald-100/60">Active atmosphere</div>
                  <div className="font-medium text-white">{activeName}</div>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-[#6EE7B7]">
                  <span>{Math.round(bgSettings.opacity * 100)}% opacity</span>
                  <span>·</span>
                  <span>{bgSettings.blurPx}px blur</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer navigation */}
        <div className="mt-3 pt-3 border-t border-white/8 flex items-center justify-between gap-3 shrink-0">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={handleStepBack}
              data-testid="onboarding-back"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/12 bg-white/[0.03] hover:border-white/25 text-xs text-emerald-50/85 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <span className="text-[11px] font-mono text-emerald-100/45">
              Esc to skip
            </span>
          )}

          <button
            type="button"
            onClick={handleStepNext}
            data-testid="onboarding-next"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#34D399] hover:bg-[#6EE7B7] text-[#05140E] font-medium text-xs transition-colors cursor-pointer"
          >
            <span>{currentStep.primaryCta}</span>
            {stepIndex >= activeSteps.length - 1 ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
