import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpressionMood, VoiceState } from '../types/hermes';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceAgent(onFinalTranscript: (transcript: string) => void) {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isSpeaking: false,
    isThinking: false,
    isMuted: false,
    micSupported: Boolean(getSpeechRecognitionCtor()),
    interimTranscript: '',
    inputLevel: 0,
    outputLevel: 0,
    frequencyBands: new Array(12).fill(0),
  });

  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  const isMutedRef = useRef(voiceState.isMuted);
  isMutedRef.current = voiceState.isMuted;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const isListeningRef = useRef(false);

  const ensureAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        audioCtxRef.current = new Ctor();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  const stopSpeaking = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // already stopped
      }
      currentSourceRef.current = null;
    }
    if (playbackTimerRef.current !== null) {
      window.clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    setVoiceState((prev) => ({
      ...prev,
      isSpeaking: false,
      isThinking: false,
      outputLevel: 0,
      frequencyBands: new Array(12).fill(0),
    }));
  }, []);

  /**
   * Plays server-synthesized Gemini TTS WAV audio through Web Audio AnalyserNode
   * so outputLevel + 12 frequency bands drive the ASCII character's real-time lip sync.
   * Falls back cleanly to a cadence-matched speech envelope if audio playback is unavailable.
   */
  const speakText = useCallback(
    async (text: string, mood: ExpressionMood) => {
      if (!text.trim()) return;
      stopSpeaking();

      if (isMutedRef.current) {
        return;
      }

      const runEnvelopeFallback = (durationMs: number) => {
        const startedAt = performance.now();
        setVoiceState((prev) => ({ ...prev, isSpeaking: true }));

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            const utter = new SpeechSynthesisUtterance(text);
            utter.rate = 1.06;
            utter.pitch = 1.08;
            window.speechSynthesis.speak(utter);
          } catch {
            // headless safe
          }
        }

        playbackTimerRef.current = window.setInterval(() => {
          const elapsed = performance.now() - startedAt;
          if (elapsed >= durationMs) {
            stopSpeaking();
            return;
          }
          const t = elapsed / 1000;
          const phrase = 0.72 + 0.28 * Math.sin(t * 2.15 + 0.4);
          const syllable = 0.52 + 0.34 * Math.sin(t * 11.4) + 0.14 * Math.cos(t * 17.8);
          const level = Math.max(0.06, Math.min(0.96, syllable * phrase));
          const bands = Array.from({ length: 12 }, (_, idx) =>
            Math.max(0.05, Math.min(1, level * (0.62 + 0.38 * Math.sin(t * 9.6 + idx * 0.72))))
          );
          setVoiceState((prev) => ({
            ...prev,
            isSpeaking: true,
            outputLevel: level,
            frequencyBands: bands,
          }));
        }, 42);
      };

      try {
        const ttsRes = await fetch('/api/hermes/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, mood }),
        });

        if (!ttsRes.ok) {
          throw new Error('TTS endpoint unavailable');
        }

        const data = (await ttsRes.json()) as { audioBase64?: string };
        if (!data.audioBase64) {
          throw new Error('No audio returned');
        }

        const ctx = ensureAudioContext();
        if (!ctx) {
          throw new Error('AudioContext unavailable');
        }

        const binary = atob(data.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.65;

        source.connect(analyser);
        analyser.connect(ctx.destination);

        currentSourceRef.current = source;
        setVoiceState((prev) => ({ ...prev, isSpeaking: true }));

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const timeData = new Uint8Array(analyser.fftSize);

        playbackTimerRef.current = window.setInterval(() => {
          analyser.getByteFrequencyData(freqData);
          analyser.getByteTimeDomainData(timeData);

          let sumSq = 0;
          for (let i = 0; i < timeData.length; i++) {
            const norm = (timeData[i] - 128) / 128;
            sumSq += norm * norm;
          }
          const rms = Math.min(1, Math.sqrt(sumSq / timeData.length) * 3.2);
          const bands = Array.from({ length: 12 }, (_, idx) => {
            const bin = freqData[Math.min(freqData.length - 1, idx + 1)] ?? 0;
            return Math.min(1, bin / 220);
          });

          setVoiceState((prev) => ({
            ...prev,
            isSpeaking: true,
            outputLevel: rms,
            frequencyBands: bands,
          }));
        }, 42);

        source.onended = () => {
          stopSpeaking();
        };

        source.start(0);
      } catch {
        const estimatedMs = Math.max(1400, Math.min(6000, text.split(/\s+/).length * 260));
        runEnvelopeFallback(estimatedMs);
      }
    },
    [ensureAudioContext, stopSpeaking]
  );

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    micAnalyserRef.current = null;
    setVoiceState((prev) => ({
      ...prev,
      isListening: false,
      interimTranscript: '',
      inputLevel: 0,
    }));
  }, []);

  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;
    ensureAudioContext();
    isListeningRef.current = true;
    setVoiceState((prev) => ({ ...prev, isListening: true, interimTranscript: '' }));

    // Attempt live mic amplitude meter if permitted
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isListeningRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
        const ctx = ensureAudioContext();
        if (ctx) {
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          micAnalyserRef.current = analyser;
        }
      } catch {
        // Microphone denied or headless browser; SpeechRecognition or manual voice prompt still works
      }
    }

    const RecCtor = getSpeechRecognitionCtor();
    if (RecCtor) {
      try {
        const rec = new RecCtor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';
        rec.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const transcript = res[0]?.transcript ?? '';
            if (res.isFinal) {
              const cleaned = transcript.trim();
              if (cleaned) {
                setVoiceState((prev) => ({ ...prev, interimTranscript: '' }));
                onFinalRef.current(cleaned);
              }
            } else {
              interim += transcript;
            }
          }
          if (interim) {
            setVoiceState((prev) => ({ ...prev, interimTranscript: interim }));
          }
        };
        rec.onerror = () => {
          // Keep UI clean; allow manual fallback
        };
        rec.onend = () => {
          if (isListeningRef.current) {
            try {
              rec.start();
            } catch {
              stopListening();
            }
          }
        };
        recognitionRef.current = rec;
        rec.start();
      } catch {
        // SpeechRecognition failed to start
      }
    }
  }, [ensureAudioContext, stopListening]);

  // Live mic input meter animation when listening
  useEffect(() => {
    if (!voiceState.isListening) return;
    let alive = true;
    const data = new Uint8Array(32);

    const sample = () => {
      if (!alive) return;
      if (micAnalyserRef.current) {
        micAnalyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.min(1, Math.sqrt(sum / data.length) * 3.8);
        setVoiceState((prev) => ({ ...prev, inputLevel: rms }));
      } else {
        // Gentle idle standby breath on mic level when listening without hardware audio stream
        const t = performance.now() / 1000;
        const sim = 0.08 + 0.05 * Math.sin(t * 4);
        setVoiceState((prev) => ({ ...prev, inputLevel: sim }));
      }
      rafRef.current = requestAnimationFrame(sample);
    };

    rafRef.current = requestAnimationFrame(sample);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [voiceState.isListening]);

  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

  const toggleMute = useCallback(() => {
    setVoiceState((prev) => {
      const nextMuted = !prev.isMuted;
      if (nextMuted) {
        stopSpeaking();
      }
      return { ...prev, isMuted: nextMuted };
    });
  }, [stopSpeaking]);

  const setThinking = useCallback((thinking: boolean) => {
    setVoiceState((prev) => ({ ...prev, isThinking: thinking }));
  }, []);

  const setInterimPreview = useCallback((text: string) => {
    setVoiceState((prev) => ({ ...prev, interimTranscript: text }));
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
    };
  }, [stopListening, stopSpeaking]);

  return {
    voiceState,
    speakText,
    stopSpeaking,
    startListening,
    stopListening,
    toggleListening,
    toggleMute,
    setThinking,
    setInterimPreview,
  };
}
