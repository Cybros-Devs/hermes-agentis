import { useEffect, useRef, useState } from 'react';
import { AsciiPortraitCanvas } from '../components/AsciiPortraitCanvas';
import { DecodedText } from '../components/DecodedText';
import type { ExpressionMood, EyeState, MouthViseme } from '../types/hermes';
import { amplitudeToViseme, textToVisemeTimeline } from '../utils/asciiCharacter';
import type { LookTarget } from '../utils/asciiPortraitEngine';
import { isReducedMotionPreferred } from './trigger';

if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
  const preloadImg = new Image();
  preloadImg.src = '/assets/aistudio/image_9fdb5ec4.png';
  const preloadSheet = new Image();
  preloadSheet.src = '/assets/aistudio/image_f0b5dc2e.png';
}

interface CharacterHostProps {
  mood: ExpressionMood;
  eyeState?: EyeState;
  lines: readonly string[];
  speechKey: string;
  soundEnabled: boolean;
  userInteracted: boolean;
  lookTargetRef?: React.RefObject<LookTarget | null>;
  onCycleMood?: () => void;
}

export function CharacterHost({
  mood,
  eyeState = 'open',
  lines,
  speechKey,
  soundEnabled,
  userInteracted,
  lookTargetRef,
  onCycleMood,
}: CharacterHostProps) {
  const [reducedMotion, setReducedMotion] = useState(isReducedMotionPreferred);
  const [skippedKey, setSkippedKey] = useState<string | null>(null);
  const [viseme, setViseme] = useState<MouthViseme>('smile');
  const [energy, setEnergy] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const isLineSkipped = skippedKey === speechKey;
  const shouldAnimateText = !reducedMotion && !isLineSkipped;
  const fullSpeechText = lines.join(' ');

  // Watch prefers-reduced-motion changes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const stopActiveAudio = () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {
        // already stopped
      }
      audioSourceRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore headless env
      }
    }
  };

  // Drive phoneme lip-sync + optional mood-mapped TTS pipeline on new speechKey
  useEffect(() => {
    stopActiveAudio();

    if (reducedMotion || isLineSkipped || !fullSpeechText.trim()) {
      setIsSpeaking(false);
      setEnergy(0);
      setViseme(mood === 'happy' ? 'smile' : 'rest');
      return;
    }

    const timeline = textToVisemeTimeline(fullSpeechText);
    const wordCount = fullSpeechText.trim().split(/\s+/).length;
    const durationMs = Math.max(950, Math.min(2400, wordCount * 210));
    const startMs = performance.now();

    setIsSpeaking(true);

    // Optional mood-mapped TTS after user interaction & when unmuted
    if (soundEnabled && userInteracted) {
      const controller = new AbortController();
      abortCtrlRef.current = controller;

      void (async () => {
        try {
          const res = await fetch('/api/hermes/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: fullSpeechText, mood }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error('TTS unavailable');
          const data = (await res.json()) as { audioBase64?: string };
          if (!data.audioBase64 || controller.signal.aborted) return;

          const Ctor =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctor) return;
          if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
          const ctx = audioCtxRef.current;
          if (ctx.state === 'suspended') await ctx.resume();

          const bin = atob(data.audioBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const audioBuf = await ctx.decodeAudioData(bytes.buffer.slice(0));
          if (controller.signal.aborted) return;

          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(ctx.destination);
          audioSourceRef.current = src;
          src.start(0);
        } catch {
          if (controller.signal.aborted) return;
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
              const utter = new SpeechSynthesisUtterance(fullSpeechText);
              utter.rate = mood === 'alert' ? 1.12 : mood === 'thinking' ? 0.96 : 1.04;
              utter.pitch = mood === 'happy' ? 1.08 : 1.0;
              window.speechSynthesis.speak(utter);
            } catch {
              // ignore headless restrictions
            }
          }
        }
      })();
    }

    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startMs;
      if (elapsed >= durationMs) {
        window.clearInterval(timer);
        setIsSpeaking(false);
        setEnergy(0);
        setViseme(mood === 'happy' ? 'smile' : 'rest');
        return;
      }

      const progress = elapsed / durationMs;
      const t = elapsed / 1000;
      const env = Math.max(
        0.14,
        Math.min(0.88, 0.44 + 0.32 * Math.sin(t * 15) + 0.14 * Math.cos(t * 23))
      );
      const phoneme = timeline[Math.min(timeline.length - 1, Math.floor(progress * timeline.length))];
      const nextViseme =
        phoneme ?? amplitudeToViseme(env, mood, Math.floor(t * 20), true, undefined, fullSpeechText);
      setEnergy(env);
      setViseme(nextViseme);
    }, 65);

    return () => {
      window.clearInterval(timer);
      stopActiveAudio();
    };
  }, [speechKey, fullSpeechText, mood, reducedMotion, isLineSkipped, soundEnabled, userInteracted]);

  const handleSkipLine = () => {
    stopActiveAudio();
    setSkippedKey(speechKey);
    setIsSpeaking(false);
    setEnergy(0);
    setViseme(mood === 'happy' ? 'smile' : 'rest');
  };

  return (
    <div className="flex flex-col items-center text-center gap-3">
      {/* Reuses the app's exact AsciiPortraitCanvas portrait renderer + native blink/gaze animator */}
      <div className="relative flex items-center justify-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-4 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.14)_0%,transparent_68%)]"
        />
        <AsciiPortraitCanvas
          variant="hero"
          mood={mood}
          viseme={reducedMotion ? 'smile' : viseme}
          eyeState={reducedMotion ? 'open' : eyeState}
          energy={reducedMotion ? 0 : energy}
          isSpeaking={reducedMotion ? false : isSpeaking}
          isListening={false}
          lookTargetRef={reducedMotion ? undefined : lookTargetRef}
          onClick={onCycleMood}
        />
      </div>

      {/* Clickable dialogue bubble: tap/click skips current line decode & speech */}
      <button
        type="button"
        onClick={handleSkipLine}
        data-testid="onboarding-dialogue"
        data-mood={mood}
        aria-label={`${fullSpeechText}. Click to finish line immediately.`}
        className="w-full max-w-md rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-center transition-colors hover:border-[#34D399]/35 cursor-pointer"
      >
        <div className="space-y-1">
          {lines.map((line, idx) => (
            <p
              key={`${speechKey}-${idx}`}
              className={
                idx === 0
                  ? 'text-[14px] leading-snug font-medium text-[#ECF3F0]'
                  : 'text-[13px] leading-snug text-[#6EE7B7]/90'
              }
            >
              <DecodedText
                text={line}
                animate={shouldAnimateText}
                speedMultiplier={1.15}
              />
            </p>
          ))}
        </div>
      </button>
    </div>
  );
}
