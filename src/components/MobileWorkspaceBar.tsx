import { useState } from 'react';
import {
  Brain,
  ChevronDown,
  LayoutGrid,
  MoreHorizontal,
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
  MouthViseme,
} from '../types/hermes';
import type { CanvasSession } from '../utils/canvasSessions';
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
  isMuted: boolean;
  panelView: WorkspacePanelView;
  pendingCount: number;
  showThinking: boolean;
  canvasSessions: CanvasSession[];
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
  isMuted,
  panelView,
  pendingCount,
  showThinking,
  canvasSessions,
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
}: MobileWorkspaceBarProps) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
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
  const isHomeNewDraft = panelView === 'home' && homeSessionDraft;

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
        <div className="flex-1 min-w-0 flex items-center gap-1.5 rounded-full bg-[#0B1714]/90 border border-white/14 px-1 py-1 shadow-[0_6px_20px_rgba(0,0,0,0.35)]">
          <button
            type="button"
            onClick={onCycleMood}
            aria-label={`Cycle Hermes mood (current: ${mood})`}
            className="w-8 h-8 rounded-full overflow-hidden border border-[#34D399]/40 bg-black/50 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <div className="scale-[0.76] origin-center">
              <AsciiPortraitCanvas
                variant="thumb"
                mood={mood}
                viseme={viseme}
                eyeState="open"
                energy={isSpeaking ? 0.65 : isListening ? 0.35 : 0.1}
                isSpeaking={isSpeaking}
                isListening={isListening}
              />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChangePanelView(panelView === 'home' ? 'voice' : 'home')}
            className="flex-1 min-w-0 text-left cursor-pointer"
          >
            <div className="text-[12px] font-semibold text-white leading-tight truncate">
              {isHomeNewDraft ? 'new session' : `#${activeChannel}`}
            </div>
            <div className="font-mono text-[10px] tracking-tight text-emerald-100/60 tabular-nums leading-tight mt-0.5 flex items-center gap-1 whitespace-nowrap">
              {isHomeNewDraft ? (
                <span>ready for prompt</span>
              ) : (
                <>
                  <span>{activeSessionId}</span>
                  <span aria-hidden="true">·</span>
                  <span>{turnCount}t</span>
                </>
              )}
            </div>
          </button>

          {onOpenMobileSidebar && (
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              aria-label="Open tasks and lanes"
              title="Tasks & lanes"
              className="ui-tactile w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 text-emerald-100/80 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Pill: View Switcher + Mute + Actions Menu */}
        <div className="relative flex items-center gap-1 rounded-full bg-[#0B1714]/90 border border-white/14 px-1.5 py-1 shadow-[0_6px_20px_rgba(0,0,0,0.35)] shrink-0">
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
                  : runningCount > 0
                  ? 'live'
                  : 'idle'
              }
            />
            <div className="leading-tight">
              <div className="text-[11.5px] font-semibold text-white">{VIEW_LABELS[panelView]}</div>
              <div className="font-mono text-[9.5px] text-emerald-100/55">
                {pendingCount > 0 ? `${pendingCount} gate${pendingCount === 1 ? '' : 's'}` : 'view'}
              </div>
            </div>
            <ChevronDown className={`w-3 h-3 text-emerald-100/60 transition-transform duration-150 ${viewMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute Hermes audio' : 'Mute Hermes audio'}
            className={`ui-tactile w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isMuted
                ? 'bg-rose-500/20 text-rose-200'
                : 'bg-white/[0.05] text-emerald-100/75 hover:text-white'
            }`}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setViewMenuOpen((v) => !v)}
            aria-label="Open view options"
            className="ui-tactile w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 text-emerald-100/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {viewMenuOpen && (
            <div
              role="menu"
              aria-label="Workspace views"
              className="ui-menu-pop absolute right-0 top-[calc(100%+8px)] w-48 rounded-2xl bg-[#091512]/96 backdrop-blur-xl border border-white/15 shadow-[0_18px_40px_rgba(0,0,0,0.65)] p-1.5 space-y-1 z-50"
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
                        ? 'bg-[#34D399]/16 text-[#6EE7B7]'
                        : 'text-emerald-50/85 hover:bg-white/[0.06]'
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
                  className="w-full min-h-[38px] px-3 rounded-xl text-left text-xs text-emerald-100/80 hover:bg-white/[0.06] flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-[#6EE7B7]" />
                    <span>Agent Trace</span>
                  </span>
                  <span className="font-mono text-[10px] text-emerald-100/55">
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
                    className="w-full min-h-[38px] px-3 rounded-xl text-left text-xs text-emerald-100/85 hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#6EE7B7]" />
                    <span>Settings</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onResetSession(activeChannel);
                    setViewMenuOpen(false);
                  }}
                  className="w-full min-h-[38px] px-3 rounded-xl text-left text-xs text-emerald-100/80 hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-100/65" />
                  <span>Reset #{activeChannel}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Overlapping Subagent / Parallel Braille Session Avatar Cluster */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#0B1714]/86 border border-white/12 pl-1.5 pr-3 py-1 max-w-full overflow-hidden">
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
                      ? 'z-20 scale-110 border-[#34D399] bg-[#071410]'
                      : isThinkingHere
                      ? 'z-10 border-amber-300/75 bg-[#091512]'
                      : 'border-white/20 bg-[#08120F]'
                  }`}
                >
                  <div className="scale-[0.28] origin-center pointer-events-none">
                    <BrailleShapeCanvas
                      shape={session.shape}
                      tint={session.tint}
                      mood={session.mood}
                      eyeStyle={session.eyeStyle}
                      variant="preview"
                    />
                  </div>
                </button>
              );
            })}
            {extraCount > 0 && (
              <button
                type="button"
                onClick={() => onChangePanelView('canvas')}
                aria-label={`View ${extraCount} more sessions on canvas`}
                className="relative z-20 w-7 h-7 rounded-full bg-[#132620] border border-white/25 text-[10px] font-mono font-semibold text-white flex items-center justify-center cursor-pointer"
              >
                +{extraCount}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onChangePanelView(panelView === 'canvas' ? 'voice' : 'canvas')}
            className="text-[11px] font-medium text-emerald-100/75 hover:text-white whitespace-nowrap cursor-pointer tabular-nums"
          >
            {canvasSessions.length} sessions
            {runningCount > 0 ? ` · ${runningCount} live` : ''}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onChangePanelView('canvas')}
          aria-label="Open parallel sessions canvas"
          className={`ui-tactile min-h-[34px] px-2.5 rounded-full border text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
            panelView === 'canvas'
              ? 'bg-[#34D399]/16 border-[#34D399]/50 text-[#6EE7B7]'
              : 'bg-white/[0.045] border-white/12 text-emerald-100/75 hover:text-white'
          }`}
        >
          <LayoutGrid className="w-3 h-3" />
          <span>Canvas</span>
        </button>
      </div>
    </div>
  );
}
