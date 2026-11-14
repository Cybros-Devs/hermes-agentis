import { useEffect, useRef } from 'react';
import { ArrowLeft, Plus, SlidersHorizontal } from 'lucide-react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
  ExpressionMood,
} from '../types/hermes';
import type { CanvasSession } from '../utils/canvasSessions';
import { AsciiPortraitCanvas } from './AsciiPortraitCanvas';

interface SidebarWorkspaceProps {
  channels: Channel[];
  activeChannel: ChannelId;
  onSelectChannel: (id: ChannelId) => void;
  canvasSessions?: CanvasSession[];
  thinkingByChannel?: Record<string, boolean>;
  onSelectSession?: (session: CanvasSession) => void;
  approvals: ApprovalCard[];
  brief: BriefDecision[];
  tasks: BackgroundTask[];
  lastSpokenLine: string;
  mood: ExpressionMood;
  frequencyBands: number[];
  isSpeaking: boolean;
  isListening: boolean;
  selectedItemId: string | null;
  onSelectTask: (task: BackgroundTask) => void;
  onSelectApproval: (card: ApprovalCard) => void;
  onSelectBrief: (item: BriefDecision) => void;
  onNewTask: () => void;
  onOpenQueue: () => void;
  onCloseMobile?: () => void;
  workspaceTitle?: string;
  queueVisible?: boolean;
  channelsVisible?: boolean;
  sidebarPosition?: 'left' | 'right';
  onOpenStudio?: () => void;
}

export function SidebarWorkspace({
  channels,
  activeChannel,
  onSelectChannel,
  canvasSessions = [],
  thinkingByChannel = {},
  onSelectSession,
  approvals,
  brief,
  tasks,
  lastSpokenLine,
  mood,
  frequencyBands,
  isSpeaking,
  isListening,
  selectedItemId,
  onSelectTask,
  onSelectApproval,
  onSelectBrief,
  onNewTask,
  onOpenQueue,
  onCloseMobile,
  workspaceTitle = '> hermes',
  queueVisible = true,
  channelsVisible = true,
  sidebarPosition = 'left',
  onOpenStudio,
}: SidebarWorkspaceProps) {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const activeChannelBtnRef = useRef<HTMLButtonElement | null>(null);
  const customSessions = canvasSessions
    .filter((s) => s.isCore === false && s.channelId !== 'daemon')
    .slice()
    .reverse();

  useEffect(() => {
    activeChannelBtnRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeChannel, channels.length]);

  return (
    <aside
      aria-label="Hermes Tasks and Lanes"
      data-testid="sidebar-workspace"
      className="ui-sidebar-shell flex flex-col h-full rounded-2xl border overflow-hidden select-none"
    >
      {/* Clean Minimal Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Back to workspace"
              className="lg:hidden min-w-[36px] min-h-[36px] flex items-center justify-center -ml-1 rounded-lg text-emerald-100/75 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span
            data-testid="sidebar-workspace-title"
            className="font-mono text-xs font-semibold tracking-tight text-white/90 truncate"
          >
            {workspaceTitle}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onOpenStudio && (
            <button
              type="button"
              onClick={onOpenStudio}
              aria-label="Customize UI studio"
              title="Customize UI"
              className="w-7 h-7 flex items-center justify-center rounded-md text-emerald-100/60 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onNewTask}
            className="flex items-center gap-1 text-xs font-medium text-emerald-50/75 hover:text-white transition-colors cursor-pointer whitespace-nowrap px-2 py-1 rounded-md hover:bg-white/6"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Active Session Card */}
      <div className="px-3">
        <button
          type="button"
          onClick={onOpenQueue}
          className="w-full text-left rounded-xl border border-white/12 bg-white/[0.035] hover:border-[#34D399]/50 p-2.5 flex items-center gap-3 transition-colors cursor-pointer"
        >
          <AsciiPortraitCanvas
            variant="thumb"
            mood={mood}
            viseme="closed"
            eyeState="open"
            energy={0.1}
            isSpeaking={false}
            isListening={false}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-white truncate">Hermes Duet</span>
              <span className="font-mono text-[11px] text-[#6EE7B7] tabular-nums shrink-0">
                #{activeChannel}
              </span>
            </div>
            <p className="text-xs text-emerald-100/50 truncate mt-0.5">{lastSpokenLine}</p>
          </div>
        </button>
      </div>

      {/* Calm Scannable Queue */}
      <div className="flex-1 overflow-y-auto cyber-scroll px-3 py-3 space-y-1.5">
        {!queueVisible ? (
          <div className="px-2.5 py-6 text-center text-[11px] text-emerald-100/40">
            Queue hidden in UI layout
          </div>
        ) : (
          <>
            {customSessions.map((session) => {
              const active =
                selectedItemId === session.id || activeChannel === session.channelId;
              const isThinking = Boolean(thinkingByChannel[session.channelId]);
              return (
                <button
                  key={session.id}
                  type="button"
                  data-testid={`sidebar-session-${session.channelId}`}
                  onClick={() =>
                    onSelectSession
                      ? onSelectSession(session)
                      : onSelectChannel(session.channelId)
                  }
                  className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    active ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                      isThinking
                        ? 'bg-amber-400 animate-pulse'
                        : active
                        ? 'bg-[#4ADE80]'
                        : 'bg-[#6EE7B7]/65'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium text-white truncate">
                        {session.topic}
                      </span>
                      <span className="font-mono text-[10px] text-[#6EE7B7]/75 shrink-0">
                        {isThinking ? 'live' : `#${session.channelId}`}
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-100/45 truncate mt-0.5">
                      {session.hermesSessionId}
                    </div>
                  </div>
                </button>
              );
            })}

            {pendingApprovals.map((card) => {
              const active = selectedItemId === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onSelectApproval(card)}
                  className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    active ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] shrink-0 mt-1.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-white truncate">{card.title}</div>
                    <div className="text-[11px] text-emerald-100/45 truncate mt-0.5">
                      Approval · #{card.channelId}
                    </div>
                  </div>
                </button>
              );
            })}

            {tasks.map((task) => {
              const active = selectedItemId === task.id;
              const isRunning = task.status === 'running';
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelectTask(task)}
                  className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    active ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`text-xs leading-4 shrink-0 mt-0.5 ${
                      isRunning ? 'text-[#6EE7B7]' : 'text-emerald-100/40'
                    }`}
                  >
                    {isRunning ? '❖' : '○'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] text-emerald-50/85 truncate">{task.title}</span>
                      <span className="font-mono text-[11px] text-emerald-100/40 tabular-nums shrink-0">
                        {task.progress}%
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-100/45 truncate mt-0.5">
                      #{task.channelId}
                    </div>
                  </div>
                </button>
              );
            })}

            {brief
              .filter((b) => !b.resolved)
              .slice(0, 2)
              .map((item) => {
                const active = selectedItemId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectBrief(item)}
                    className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors cursor-pointer ${
                      active ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="text-xs leading-4 text-emerald-100/40 shrink-0 mt-0.5"
                    >
                      ○
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-emerald-50/80 truncate">{item.title}</div>
                      <div className="text-[11px] text-emerald-100/45 truncate mt-0.5">Brief</div>
                    </div>
                  </button>
                );
              })}
          </>
        )}
      </div>

      {/* Minimal Channel / Session Switcher Footer */}
      {channelsVisible && (
        <div
          className={`py-2.5 pl-3.5 border-t border-white/8 flex items-end justify-between gap-2 font-mono text-[11px] ${
            sidebarPosition === 'right' ? 'pr-12' : 'pr-3.5'
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 min-w-0 max-h-[104px] overflow-y-auto cyber-scroll">
            {channels.map((ch) => {
              const active = ch.id === activeChannel;
              const label = ch.name.startsWith('#') ? ch.name : `#${ch.name}`;
              return (
                <button
                  key={ch.id}
                  ref={active ? activeChannelBtnRef : undefined}
                  type="button"
                  data-testid={`sidebar-channel-${ch.id}`}
                  onClick={() => onSelectChannel(ch.id)}
                  className={`transition-colors cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1 ${
                    active ? 'text-[#4ADE80] font-semibold' : 'text-emerald-100/50 hover:text-white'
                  }`}
                >
                  {active && <span aria-hidden="true" className="w-1 h-1 rounded-full bg-[#4ADE80]" />}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {(isSpeaking || isListening) && (
            <div className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
              {frequencyBands.slice(0, 5).map((band, idx) => (
                <span
                  key={idx}
                  className="w-0.5 rounded-[1px] bg-[#4ADE80] transition-all duration-75"
                  style={{ height: `${Math.max(25, Math.round(band * 100))}%` }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
