import { useEffect, useState } from 'react';
import {
  Brain,
  ChevronDown,
  LayoutGrid,
  PanelLeft,
  RotateCcw,
  Settings,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  BackgroundTask,
  ChannelId,
  ExpressionMood,
  HermesAgentSession,
  MouthViseme,
} from '../types/hermes';
import { formatCanvasDotLabel, type CanvasSession } from '../utils/canvasSessions';
import { formatDisplaySessionTitle } from '../utils/sidebarSessions';
import { summarizeChannelTaskActivity } from '../utils/taskInsights';
import { AsciiPortraitCanvas } from './AsciiPortraitCanvas';
import { BrailleShapeCanvas } from './BrailleShapeCanvas';
import { StatusPulse } from './ui';
import type { WorkspacePanelView } from './VoiceWorkspacePane';

interface MobileWorkspaceBarProps {
  activeChannel: ChannelId;
  activeSessionId: string;
  turnCount: number;
  mood: ExpressionMood;
  viseme: MouthViseme;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking?: boolean;
  isMuted: boolean;
  panelView: WorkspacePanelView;
  pendingCount: number;
  showThinking: boolean;
  canvasSessions: CanvasSession[];
  hermesSessions?: HermesAgentSession[];
  thinkingByChannel: Record<string, boolean>;
  tasks?: BackgroundTask[];
  homeSessionDraft?: boolean;
  onChangePanelView: (view: WorkspacePanelView) => void;
  onSelectChannel: (channelId: ChannelId) => void;
  onOpenMobileSidebar?: () => void;
  onResetSession: (channelId: ChannelId) => void;
  onCycleMood: () => void;
  onToggleMute: () => void;
  onToggleThinking: () => void;
  onOpenStudio?: () => void;
  updateAvailable?: boolean;
}

const VIEW_LABELS: Record<WorkspacePanelView, string> = {
  home: 'Home',
  canvas: 'Canvas',
  voice: 'Thread',
  queue: 'Queue',
  cli: 'CLI',
};

export function MobileWorkspaceBar({
  activeChannel,
  activeSessionId,
  turnCount,
  mood,
  viseme,
  isSpeaking,
  isListening,
  isThinking = false,
  isMuted,
  panelView,
  pendingCount,
  showThinking,
  canvasSessions,
  hermesSessions = [],
  thinkingByChannel,
  tasks = [],
  homeSessionDraft = false,
  onChangePanelView,
  onSelectChannel,
  onOpenMobileSidebar,
  onResetSession,
  onCycleMood,
  onToggleMute,
  onToggleThinking,
  onOpenStudio,
  updateAvailable = false,
}: MobileWorkspaceBarProps) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setViewMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMenuOpen]);

  const maxAvatars = 4;
  const visibleSessions = canvasSessions.slice(0, maxAvatars);
  const extraCount = Math.max(0, canvasSessions.length - maxAvatars);
  const activityByChannel = summarizeChannelTaskActivity(
    tasks,
    canvasSessions.map((s) => ({ id: s.channelId })),
    thinkingByChannel
  );
  const runningCount = canvasSessions.filter((s) =>
    Boolean(activityByChannel[s.channelId]?.hasActiveTask)
  ).length;
  const hasChannel = Boolean(activeChannel);
  const isHomeNewDraft = (panelView === 'home' && homeSessionDraft) || !hasChannel;
  const activeCanvasSession = hasChannel
    ? canvasSessions.find((s) => s.channelId === activeChannel)
    : undefined;
  const activeHermesSession = hasChannel
    ? hermesSessions.find((s) => s.channelId === activeChannel)
    : undefined;
  const dotLabel = hasChannel
    ? formatCanvasDotLabel(
        activeCanvasSession ?? {
          channelId: activeChannel,
          hermesSessionId: activeSessionId,
          name: activeChannel,
          topic: activeHermesSession?.topic ?? '',
        },
        activeHermesSession,
        turnCount
      )
    : null;
  const activeTitle = !hasChannel
    ? 'new session'
    : dotLabel?.primaryLabel ??
      formatDisplaySessionTitle({
        channelId: activeChannel,
        sessionId: activeSessionId,
      }).title;
  const activeMetaLine = dotLabel?.secondaryLabel ?? `${turnCount}t`;

  const views: { id: WorkspacePanelView; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'canvas', label: 'Canvas' },
    { id: 'voice', label: 'Thread' },
    { id: 'queue', label: pendingCount > 0 ? `Queue (${pendingCount})` : 'Queue' },
    { id: 'cli', label: 'CLI' },
  ];

  return (
    <div className="lg:hidden relative z-30 px-2.5 pt-2.5 pb-1.5 space-y-2 shrink-0">
      {/* Row 1: Dual Floating Glass Pills inspired by reference mobile bar */}
      <div className="flex items-center justify-between gap-1.5">
        {/* Left Pill: Animated Halftone Character + Active Lane + Tasks Drawer */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 rounded-full bg-[#11141B]/92 border border-white/[0.12] px-1 py-1 shadow-[0_6px_20px_rgba(0,0,0,0.35)]">
          <button
            type="button"
            onClick={onCycleMood}
            aria-label={`Cycle Hermes mood (current: ${mood})`}
            className="w-8 h-8 rounded-full overflow-hidden border border-white/20 bg-black/50 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <span className="w-8 h-8 overflow-hidden flex items-center justify-center pointer-events-none">
              <span className="scale-[0.76] origin-center shrink-0">
                <AsciiPortraitCanvas
                  variant="thumb"
                  mood={mood}
                  viseme={viseme}
                  eyeState="open"
                  energy={isSpeaking ? 0.65 : isListening ? 0.35 : 0.1}
                  isSpeaking={isSpeaking}
                  isListening={isListening}
                />
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChangePanelView(panelView === 'home' ? 'voice' : 'home')}
            className="flex-1 min-w-0 overflow-hidden text-left cursor-pointer"
          >
            <div className="text-[12px] font-semibold text-white leading-tight truncate">
              {isHomeNewDraft ? 'new session' : activeTitle}
            </div>
            <div className="font-mono text-[10px] tracking-tight text-zinc-400 tabular-nums leading-tight mt-0.5 flex items-center gap-1 whitespace-nowrap overflow-hidden">
              {isHomeNewDraft ? (
                <span>ready for prompt</span>
              ) : (
                <span className="truncate min-w-0">{activeMetaLine}</span>
              )}
            </div>
          </button>

          {onOpenMobileSidebar && (
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              aria-label="Open tasks and lanes"
              title="Tasks & lanes"
              className="ui-tactile w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Pill: View Switcher + Mute + Actions Menu */}
        <div className="relative flex items-center gap-1 rounded-full bg-[#11141B]/92 border border-white/[0.12] px-1.5 py-1 shadow-[0_6px_20px_rgba(0,0,0,0.35)] shrink-0">
          <button
            type="button"
            onClick={() => setViewMenuOpen((v) => !v)}
            aria-expanded={viewMenuOpen}
            aria-label="Switch workspace view"
            className="ui-tactile min-h-[32px] pl-1 pr-0.5 flex items-center gap-1.5 text-left cursor-pointer whitespace-nowrap"
          >
            <StatusPulse
              size="md"
              state={
                isSpeaking
                  ? 'speaking'
                  : isListening
                  ? 'listening'
                  : isThinking
                  ? 'thinking'
                  : runningCount > 0
                  ? 'live'
                  : 'idle'
              }
            />
            <div className="leading-tight">
              <div className="text-[11.5px] font-semibold text-white">{VIEW_LABELS[panelView]}</div>
              <div className="font-mono text-[9.5px] text-zinc-400">
                {pendingCount > 0 ? `${pendingCount} gate${pendingCount === 1 ? '' : 's'}` : 'view'}
              </div>
            </div>
            <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform duration-150 ${viewMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute Hermes audio' : 'Mute Hermes audio'}
            className={`ui-tactile w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isMuted
                ? 'bg-rose-500/20 text-rose-200'
                : 'bg-white/[0.05] text-zinc-300 hover:text-white'
            }`}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>

          {viewMenuOpen && (
            <>
              <div
                aria-hidden="true"
                onClick={() => setViewMenuOpen(false)}
                className="fixed inset-0 z-40 bg-transparent"
              />
              <div
                role="menu"
                aria-label="Workspace views"
                className="ui-menu-pop absolute right-0 top-[calc(100%+8px)] w-48 max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-5.5rem)] overflow-y-auto cyber-scroll rounded-2xl bg-[#13161F]/96 backdrop-blur-xl border border-white/14 shadow-[0_18px_40px_rgba(0,0,0,0.65)] p-1.5 space-y-1 z-50"
              >
              {views.map((tab) => {
                const active = panelView === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setViewMenuOpen(false);
                      onChangePanelView(tab.id);
                    }}
                    className={`w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                      active
                        ? 'bg-[rgba(var(--ui-accent-rgb),0.16)] text-[var(--ui-accent-soft)]'
                        : 'text-zinc-200 hover:bg-white/[0.06]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {active && <span className="font-mono text-[10px]">active</span>}
                  </button>
                );
              })}

              <div className="pt-1 mt-1 border-t border-white/10 space-y-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleThinking();
                    setViewMenuOpen(false);
                  }}
                  className="w-full min-h-[38px] px-3 rounded-xl text-left text-xs text-zinc-200 hover:bg-white/[0.06] flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-[var(--ui-accent-soft)]" />
                    <span>Agent Trace</span>
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {showThinking ? 'on' : 'off'}
                  </span>
                </button>
                {onOpenStudio && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setViewMenuOpen(false);
                      onOpenStudio();
                    }}
                    className="w-full min-h-[38px] px-3 rounded-xl text-left text-xs text-zinc-200 hover:bg-white/[0.06] flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Settings className="w-3.5 h-3.5 text-[var(--ui-accent-soft)]" />
                      <span>Settings</span>
                    </span>
                    {updateAvailable && (
                      <span
                        aria-label="Update available"
                        className="w-2 h-2 rounded-full bg-amber-400"
                      />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onResetSession(activeChannel);
                    setViewMenuOpen(false);
                  }}
                  className="w-full min-h-[38px] px-3 rounded-xl text-left text-xs text-zinc-200 hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">
                    {hasChannel
                      ? `Reset ${dotLabel?.isOpaque ? dotLabel.promptTarget : `#${dotLabel?.promptTarget ?? activeChannel}`}`
                      : 'Reset session'}
                  </span>
                </button>
              </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 2: Overlapping Subagent / Parallel Braille Session Avatar Cluster (shown when dots exist) */}
      {canvasSessions.length > 0 && (
        <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#11141B]/88 border border-white/12 pl-1.5 pr-3 py-1 max-w-full overflow-hidden">
          <div className="flex items-center -space-x-2 shrink-0">
            {visibleSessions.map((session) => {
              const isActive = session.channelId === activeChannel;
              const isThinkingHere = Boolean(activityByChannel[session.channelId]?.hasActiveTask);
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelectChannel(session.channelId)}
                  aria-label={`Switch to session #${session.name}`}
                  title={`#${session.name} (${session.hermesSessionId})`}
                  className={`relative w-7 h-7 rounded-full overflow-hidden flex items-center justify-center border transition-transform cursor-pointer ${
                    isActive
                      ? 'z-20 scale-110 border-[var(--ui-accent)] bg-[#141822]'
                      : isThinkingHere
                      ? 'z-10 border-amber-300/75 bg-[#161922]'
                      : 'border-white/20 bg-[#12151D]'
                  }`}
                >
                  <span className="w-7 h-7 overflow-hidden flex items-center justify-center pointer-events-none">
                    <span className="scale-[0.28] origin-center shrink-0">
                      <BrailleShapeCanvas
                        shape={session.shape}
                        tint={session.tint}
                        mood={session.mood}
                        eyeStyle={session.eyeStyle}
                        variant="preview"
                        reducedMotionOverride
                      />
                    </span>
                  </span>
                </button>
              );
            })}
            {extraCount > 0 && (
              <button
                type="button"
                onClick={() => onChangePanelView('canvas')}
                aria-label={`View ${extraCount} more sessions on canvas`}
                className="relative z-20 w-7 h-7 rounded-full bg-[#1B202B] border border-white/25 text-[10px] font-mono font-semibold text-white flex items-center justify-center cursor-pointer"
              >
                +{extraCount}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onChangePanelView(panelView === 'canvas' ? 'voice' : 'canvas')}
            className="text-[11px] font-medium text-zinc-300 hover:text-white whitespace-nowrap cursor-pointer tabular-nums"
          >
            {canvasSessions.length} {canvasSessions.length === 1 ? 'session' : 'sessions'}
            {runningCount > 0 ? ` · ${runningCount} live` : ''}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onChangePanelView('canvas')}
          aria-label="Open parallel sessions canvas"
          className={`ui-tactile min-h-[34px] px-2.5 rounded-full border text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
            panelView === 'canvas'
              ? 'bg-[rgba(var(--ui-accent-rgb),0.16)] border-[rgba(var(--ui-accent-rgb),0.45)] text-[var(--ui-accent-soft)]'
              : 'bg-white/[0.045] border-white/12 text-zinc-300 hover:text-white'
          }`}
        >
          <LayoutGrid className="w-3 h-3" />
          <span>Canvas</span>
        </button>
        </div>
      )}
    </div>
  );
}
