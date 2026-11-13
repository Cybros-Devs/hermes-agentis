import { useEffect, useMemo, useState } from 'react';
import {
  Mic,
  MicOff,
  Square,
  Volume2,
  VolumeX,
  Sparkles,
  RotateCcw,
  Orbit,
} from 'lucide-react';
import type {
  ChannelId,
  ExpressionMood,
  PhosphorTheme,
  VoiceState,
} from '../types/hermes';
import { amplitudeToViseme, resolveEyeState } from '../utils/asciiCharacter';
import type { AsciiShaderMode } from '../utils/ascii3dEngine';
import { Ascii3DViewport } from './Ascii3DViewport';

interface PhoneVideoWidgetProps {
  activeChannel: ChannelId;
  mood: ExpressionMood;
  phosphor: PhosphorTheme;
  onPhosphorChange: (theme: PhosphorTheme) => void;
  shaderMode: AsciiShaderMode;
  onShaderModeChange: (mode: AsciiShaderMode) => void;
  onCycleMood: () => void;
  voiceState: VoiceState;
  lastSpokenLine: string;
  onToggleListening: () => void;
  onToggleMute: () => void;
  onStopSpeaking: () => void;
  onQuickVoicePrompt: (prompt: string) => void;
}

const THEME_STYLES: Record<
  PhosphorTheme,
  { text: string; bar: string; accentBorder: string }
> = {
  gold: {
    text: 'text-[#FFD700]',
    bar: 'bg-[#F5B800]',
    accentBorder: 'border-[#F5B800]/40',
  },
  cyan: {
    text: 'text-[#22D3EE]',
    bar: 'bg-[#22D3EE]',
    accentBorder: 'border-[#22D3EE]/40',
  },
  mono: {
    text: 'text-[#E6E9F0]',
    bar: 'bg-[#E6E9F0]',
    accentBorder: 'border-slate-500/40',
  },
};

function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function PhoneVideoWidget({
  activeChannel,
  mood,
  phosphor,
  onPhosphorChange,
  shaderMode,
  onShaderModeChange,
  onCycleMood,
  voiceState,
  lastSpokenLine,
  onToggleListening,
  onToggleMute,
  onStopSpeaking,
  onQuickVoicePrompt,
}: PhoneVideoWidgetProps) {
  const [tick, setTick] = useState(0);
  const [callSeconds, setCallSeconds] = useState(0);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [camera, setCamera] = useState({ yaw: 0.16, pitch: 0.04, zoom: 1.04 });

  // Animation tick for blinking & viseme cadence
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => (t + 1) % 10000);
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  // Call timer
  useEffect(() => {
    const id = window.setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const effectiveMood: ExpressionMood = voiceState.isThinking
    ? 'thinking'
    : voiceState.isListening && !voiceState.isSpeaking
    ? 'listening'
    : mood;

  const viseme = useMemo(
    () => amplitudeToViseme(voiceState.outputLevel, effectiveMood, tick, voiceState.isSpeaking),
    [voiceState.outputLevel, effectiveMood, tick, voiceState.isSpeaking]
  );

  const eyeState = useMemo(
    () => resolveEyeState(effectiveMood, tick, voiceState.isSpeaking),
    [effectiveMood, tick, voiceState.isSpeaking]
  );

  const energy = voiceState.isSpeaking
    ? voiceState.outputLevel
    : voiceState.isListening
    ? Math.max(0.18, voiceState.inputLevel)
    : 0.08;

  const theme = THEME_STYLES[phosphor];

  const statusLabel = voiceState.isThinking
    ? 'THINKING'
    : voiceState.isSpeaking
    ? 'SPEAKING'
    : voiceState.isListening
    ? 'LISTENING'
    : 'STANDBY';

  const captionText = voiceState.interimTranscript
    ? `YOU: "${voiceState.interimTranscript}"`
    : lastSpokenLine;

  return (
    <section
      aria-label="Hermes Phone Video Interface"
      className="relative flex flex-col w-full max-w-[420px] mx-auto lg:mx-0 rounded-[30px] bg-[#0B0D13] border border-white/12 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
    >
      {/* Handheld Top Bezel / Receiver Bar */}
      <div className="flex items-center justify-between px-2 pb-2.5">
        <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              voiceState.isListening || voiceState.isSpeaking
                ? 'bg-[#F5B800]'
                : 'bg-emerald-400'
            }`}
            aria-hidden="true"
          />
          <span className="font-semibold tracking-wider text-white">HERMES LINK</span>
          <span className="text-slate-500">/</span>
          <span className="text-[#F5B800]">#{activeChannel}</span>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs tabular-nums text-slate-400">
          <span>{statusLabel}</span>
          <span>{formatCallDuration(callSeconds)}</span>
        </div>
      </div>

      {/* 3D ASCII Video Screen Frame */}
      <div
        data-testid="ascii-stage"
        data-engine="3d-sdf-ascii"
        data-shader={shaderMode}
        data-viseme={viseme}
        data-mood={effectiveMood}
        data-speaking={String(voiceState.isSpeaking)}
        className={`relative overflow-hidden rounded-2xl bg-[#050609] border ${theme.accentBorder} px-2 pt-2.5 pb-2.5`}
      >
        <div className="crt-scanlines pointer-events-none absolute inset-0 z-10 opacity-45" />

        {/* Video Top Telemetry Overlay */}
        <div className="relative z-20 flex items-center justify-between px-2 pb-1 font-mono text-[11px] text-slate-400">
          <span>3D-SDF · {shaderMode.toUpperCase()}</span>
          <span>
            EXPR: <strong className={theme.text}>{effectiveMood.toUpperCase()}</strong>
          </span>
        </div>

        {/* Real-Time 3D Raymarched ASCII Engine Viewport */}
        <div className="relative z-20">
          <Ascii3DViewport
            mood={effectiveMood}
            viseme={viseme}
            eyeState={eyeState}
            energy={energy}
            bands={voiceState.frequencyBands}
            isSpeaking={voiceState.isSpeaking}
            isListening={voiceState.isListening}
            phosphor={phosphor}
            shaderMode={shaderMode}
            autoOrbit={autoOrbit}
            yaw={camera.yaw}
            pitch={camera.pitch}
            zoom={camera.zoom}
            onCameraChange={(next) => {
              setAutoOrbit(false);
              setCamera(next);
            }}
          />
        </div>

        {/* Audio-Synced 12-Band Spectrum Equalizer */}
        <div
          aria-hidden="true"
          className="relative z-20 flex items-end justify-center gap-1.5 h-5 mt-1 px-4"
        >
          {voiceState.frequencyBands.map((band, i) => {
            const inputBoost = voiceState.isListening ? voiceState.inputLevel * 0.7 : 0;
            const heightPct = Math.max(
              14,
              Math.min(100, Math.round((band + inputBoost) * 100))
            );
            return (
              <span
                key={i}
                className={`w-1.5 rounded-t-sm transition-transform duration-75 ${theme.bar}`}
                style={{
                  height: `${heightPct}%`,
                  opacity: voiceState.isSpeaking || voiceState.isListening ? 0.92 : 0.3,
                }}
              />
            );
          })}
        </div>

        {/* Real-time Live Transcript / Subtitle Scrim */}
        <div className="relative z-20 mt-2 rounded-xl bg-[#0C0F16]/90 border border-white/10 px-3 py-2 min-h-[50px] flex items-center">
          <p
            data-testid="live-caption"
            className="font-mono text-xs leading-relaxed text-slate-200 line-clamp-2"
          >
            {captionText}
          </p>
        </div>
      </div>

      {/* Tactile Phone Call Controls */}
      <div className="mt-3 flex flex-col gap-2.5">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onToggleListening}
            aria-pressed={voiceState.isListening}
            aria-label={voiceState.isListening ? 'Stop voice input' : 'Start voice input'}
            className={`min-h-[44px] rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B800] ${
              voiceState.isListening
                ? 'bg-[#F5B800] text-[#07080B] font-semibold'
                : 'bg-[#171C26] text-slate-100 hover:bg-[#1E2432] border border-white/10'
            }`}
          >
            {voiceState.isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span>{voiceState.isListening ? 'Listening' : 'Voice'}</span>
          </button>

          <button
            type="button"
            onClick={voiceState.isSpeaking ? onStopSpeaking : onToggleMute}
            aria-label={
              voiceState.isSpeaking
                ? 'Stop Hermes speaking'
                : voiceState.isMuted
                ? 'Unmute audio output'
                : 'Mute audio output'
            }
            className={`min-h-[44px] rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B800] ${
              voiceState.isSpeaking
                ? 'bg-rose-500/20 text-rose-200 border-rose-400/40 hover:bg-rose-500/30'
                : voiceState.isMuted
                ? 'bg-[#141821] text-slate-400 border-white/10 hover:text-white'
                : 'bg-[#171C26] text-slate-100 border-white/10 hover:bg-[#1E2432]'
            }`}
          >
            {voiceState.isSpeaking ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </>
            ) : voiceState.isMuted ? (
              <>
                <VolumeX className="w-4 h-4" />
                <span>Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" />
                <span>Audio On</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onCycleMood}
            aria-label="Cycle character expression"
            className="min-h-[44px] rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 bg-[#171C26] text-slate-100 border border-white/10 hover:bg-[#1E2432] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B800]"
          >
            <Sparkles className="w-4 h-4 text-[#F5B800]" />
            <span>Mood</span>
          </button>
        </div>

        {/* 3D Shader & Camera Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5 p-1 bg-[#12161F] rounded-lg border border-white/10">
            {(['solid', 'wire', 'depth', 'holo', 'norm'] as AsciiShaderMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onShaderModeChange(mode)}
                className={`px-1.5 py-1 rounded-md font-mono text-[10px] uppercase transition-colors cursor-pointer whitespace-nowrap ${
                  shaderMode === mode
                    ? 'bg-[#22D3EE] text-[#07080B] font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAutoOrbit((o) => !o)}
              aria-pressed={autoOrbit}
              aria-label="Toggle 3D camera auto-orbit"
              className={`px-2 py-1 rounded-md font-mono text-[10.5px] flex items-center gap-1 border transition-colors cursor-pointer whitespace-nowrap ${
                autoOrbit
                  ? 'bg-[#171C26] text-[#F5B800] border-[#F5B800]/40'
                  : 'bg-[#12161F] text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              <Orbit className="w-3 h-3" />
              <span>Orbit</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAutoOrbit(true);
                setCamera({ yaw: 0.16, pitch: 0.04, zoom: 1.04 });
              }}
              aria-label="Reset 3D camera angle"
              className="px-2 py-1 rounded-md bg-[#12161F] text-slate-400 border border-white/10 hover:text-white font-mono text-[10.5px] flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Display Phosphor Selector */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap">
            PHOSPHOR
          </span>
          <div className="flex items-center gap-1 p-1 bg-[#12161F] rounded-lg border border-white/10">
            {(['gold', 'cyan', 'mono'] as PhosphorTheme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onPhosphorChange(t)}
                className={`px-2.5 py-1 rounded-md font-mono text-[11px] uppercase transition-colors cursor-pointer whitespace-nowrap ${
                  phosphor === t
                    ? 'bg-[#F5B800] text-[#07080B] font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* One-tap Voice Utterance Triggers */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onQuickVoicePrompt('Read my morning brief')}
            className="px-2 py-1.5 rounded-lg bg-[#12161F] border border-white/10 font-mono text-[11px] text-slate-300 hover:border-[#F5B800]/50 hover:text-[#FFD700] transition-colors whitespace-nowrap truncate cursor-pointer"
          >
            &ldquo;Read brief&rdquo;
          </button>
          <button
            type="button"
            onClick={() => onQuickVoicePrompt('What tasks are running?')}
            className="px-2 py-1.5 rounded-lg bg-[#12161F] border border-white/10 font-mono text-[11px] text-slate-300 hover:border-[#F5B800]/50 hover:text-[#FFD700] transition-colors whitespace-nowrap truncate cursor-pointer"
          >
            &ldquo;Tasks&rdquo;
          </button>
          <button
            type="button"
            onClick={() => onQuickVoicePrompt('Approve the beta release dispatch')}
            className="px-2 py-1.5 rounded-lg bg-[#12161F] border border-white/10 font-mono text-[11px] text-slate-300 hover:border-[#F5B800]/50 hover:text-[#FFD700] transition-colors whitespace-nowrap truncate cursor-pointer"
          >
            &ldquo;Approve&rdquo;
          </button>
        </div>
      </div>
    </section>
  );
}
