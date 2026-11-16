import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
  ExpressionMood,
} from '../types/hermes';
import type { CanvasSession } from '../utils/canvasSessions';
import { summarizeChannelTaskActivity } from '../utils/taskInsights';
import { AsciiPortraitCanvas } from './AsciiPortraitCanvas';
import { StaggerItem, StatusPulse, getStaggerVars } from './ui';

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
  onSelectApproval: (card: ApprovalCard) => void;
  onSelectBrief: (item: BriefDecision) => void;
  onNewTask: () => void;
  onOpenQueue: () => void;
  onCloseMobile?: () => void;
  workspaceTitle?: string;
  homeSessionDraft?: boolean;
  queueVisible?: boolean;
  channelsVisible?: boolean;
  sidebarPosition?: 'left' | 'right';
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
  onSelectApproval,
  onSelectBrief,
  onNewTask,
  onOpenQueue,
  onCloseMobile,
  workspaceTitle = '> hermes',
  homeSessionDraft = false,
  queueVisible = true,
  channelsVisible = true,
}: SidebarWorkspaceProps) {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const openBrief = brief.filter((b) => !b.resolved).slice(0, 2);
  const activeChannelBtnRef = useRef<HTMLButtonElement | null>(null);
  const customSessions = canvasSessions
    .filter((s) => s.isCore === false && s.channelId !== 'daemon')
    .slice()
    .reverse();

  const customChannelIds = useMemo(
    () => new Set(customSessions.map((s) => s.channelId)),
    [customSessions]
  );

  // Keep footer strictly for core workspace channels so custom sessions above aren't duplicated
  const footerChannels = useMemo(
    () => channels.filter((ch) => !customChannelIds.has(ch.id)),
    [channels, customChannelIds]
  );

  const activityByChannel = useMemo(
    () => summarizeChannelTaskActivity(tasks, channels, thinkingByChannel),
    [tasks, channels, thinkingByChannel]
  );

  const activeChannelActivity = activityByChannel[activeChannel];

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

        <button
          type="button"
          onClick={onNewTask}
          className="ui-tactile flex items-center gap-1 text-xs font-medium text-emerald-50/75 hover:text-white transition-colors cursor-pointer whitespace-nowrap px-2 py-1 rounded-md hover:bg-white/6 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New</span>
        </button>
      </div>

      {/* Active Session Card */}
      <div className="px-3">
        <button
          type="button"
          onClick={onOpenQueue}
          className="ui-tactile w-full text-left rounded-xl border border-white/10 bg-white/[0.03] hover:border-[#34D399]/40 p-2.5 flex items-center gap-3 transition-colors cursor-pointer"
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
              <span className="text-[13px] font-semibold text-white shrink-0">Hermes Agent</span>
              <span
                data-testid="sidebar-active-lane"
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#6EE7B7] tabular-nums truncate min-w-0 text-right"
              >
                {!homeSessionDraft && activeChannelActivity?.hasActiveTask && (
                  <StatusPulse state="thinking" size="sm" />
                )}
                <span>{homeSessionDraft ? 'new session' : `#${activeChannel}`}</span>
              </span>
            </div>
            <p className="text-xs text-emerald-100/50 truncate mt-0.5">{lastSpokenLine}</p>
          </div>
        </button>
      </div>

      {/* Calm Scannable Sessions & Approval Gates */}
      <div className="flex-1 overflow-y-auto cyber-scroll px-3 py-3 space-y-1">
        {!queueVisible ? (
          <div className="px-2.5 py-6 text-center text-[11px] text-emerald-100/40">
            Queue hidden in UI layout
          </div>
        ) : (
          <>
            {customSessions.length > 0 && (
              <div className="px-2 pt-0.5 pb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-100/40 tabular-nums">
                <span>Sessions</span>
                <span>{customSessions.length}</span>
              </div>
            )}

            {customSessions.map((session, idx) => {
              const active =
                !homeSessionDraft &&
                (selectedItemId === session.id || activeChannel === session.channelId);
              const channelActivity = activityByChannel[session.channelId];
              const hasActiveWork = Boolean(channelActivity?.hasActiveTask);
              const runningCount = channelActivity?.runningCount ?? 0;
              return (
                <StaggerItem key={session.id} index={idx}>
                  <button
                    type="button"
                    data-testid={`sidebar-session-${session.channelId}`}
                    data-has-task={String(hasActiveWork)}
                    title={
                      hasActiveWork
                        ? `${session.topic} · ${session.hermesSessionId} (working)`
                        : `${session.topic} · ${session.hermesSessionId}`
                    }
                    onClick={() =>
                      onSelectSession
                        ? onSelectSession(session)
                        : onSelectChannel(session.channelId)
                    }
                    className={`ui-tactile w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors duration-150 cursor-pointer ${
                      active
                        ? 'bg-[#34D399]/[0.08] border-[#34D399]/35'
                        : 'border-transparent hover:bg-white/[0.04]'
                    }`}
                  >
                    <StatusPulse
                      state={hasActiveWork ? 'thinking' : active ? 'live' : 'idle'}
                      size="sm"
                    />
                    <span
                      className={`text-[13px] font-medium truncate flex-1 min-w-0 ${
                        active ? 'text-white' : 'text-emerald-50/85'
                      }`}
                    >
                      {session.topic}
                    </span>
                    <span
                      className={`font-mono text-[10px] tabular-nums shrink-0 ${
                        hasActiveWork
                          ? 'text-amber-300/90 font-medium'
                          : active
                          ? 'text-[#6EE7B7]/85'
                          : 'text-emerald-100/35'
                      }`}
                    >
                      {hasActiveWork
                        ? runningCount > 1
                          ? `${runningCount} active`
                          : 'working'
                        : `#${session.channelId}`}
                    </span>
                  </button>
                </StaggerItem>
              );
            })}

            {(pendingApprovals.length > 0 || openBrief.length > 0) && (
              <div
                className={`px-2 pb-0.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-100/40 tabular-nums ${
                  customSessions.length > 0 ? 'mt-2.5 pt-2.5 border-t border-white/[0.06]' : 'pt-1.5'
                }`}
              >
                <span>Queue &amp; Lanes</span>
                <span>{pendingApprovals.length + openBrief.length}</span>
              </div>
            )}

            {pendingApprovals.map((card, idx) => {
              const active = selectedItemId === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  style={getStaggerVars(idx)}
                  onClick={() => onSelectApproval(card)}
                  className={`ui-stagger-enter ui-tactile w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-xl border transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'bg-white/[0.08] border-[#34D399]/35'
                      : 'border-transparent hover:bg-white/[0.04]'
                  }`}
                >
                  <StatusPulse state="live" className="mt-1.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-white truncate">{card.title}</div>
                    <div className="text-[11px] text-emerald-100/45 truncate mt-0.5">
                      Approval · #{card.channelId}
                    </div>
                  </div>
                </button>
              );
            })}

            {openBrief.map((item, idx) => {
              const active = selectedItemId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  style={getStaggerVars(idx + pendingApprovals.length)}
                  onClick={() => onSelectBrief(item)}
                  className={`ui-stagger-enter ui-tactile w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-xl border transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'bg-white/[0.08] border-[#34D399]/35'
                      : 'border-transparent hover:bg-white/[0.04]'
                  }`}
                >
                  <StatusPulse state="idle" className="mt-1.5" />
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

      {/* Single-Row Typographic Channel Switcher */}
      {channelsVisible && footerChannels.length > 0 && (
        <div className="py-2.5 px-3 border-t border-white/[0.07] flex items-center justify-between gap-1.5 font-mono text-[9.5px]">
          <div className="flex flex-nowrap items-center gap-x-1.5 min-w-0 overflow-x-auto cyber-scroll">
            {footerChannels.map((ch) => {
              const active = !homeSessionDraft && ch.id === activeChannel;
              const label = ch.name.startsWith('#') ? ch.name : `#${ch.name}`;
              const channelActivity = activityByChannel[ch.id];
              const hasActiveWork = Boolean(channelActivity?.hasActiveTask);
              const runningCount = channelActivity?.runningCount ?? 0;
              return (
                <button
                  key={ch.id}
                  ref={active ? activeChannelBtnRef : undefined}
                  type="button"
                  data-testid={`sidebar-channel-${ch.id}`}
                  data-has-task={String(hasActiveWork)}
                  aria-label={
                    hasActiveWork
                      ? `${label} (${runningCount || 1} task running)`
                      : label
                  }
                  title={
                    hasActiveWork
                      ? `Task running in ${label}${
                          channelActivity?.primaryTitle
                            ? `: ${channelActivity.primaryTitle}`
                            : ''
                        }`
                      : ch.description || label
                  }
                  onClick={() => onSelectChannel(ch.id)}
                  className={`ui-tactile transition-colors cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1 py-0.5 ${
                    active
                      ? 'text-[#6EE7B7] font-semibold'
                      : hasActiveWork
                      ? 'text-amber-200/90 hover:text-amber-100 font-medium'
                      : 'text-emerald-100/45 hover:text-white'
                  }`}
                >
                  {hasActiveWork ? (
                    <StatusPulse state="thinking" size="sm" />
                  ) : (
                    active && (
                      <span aria-hidden="true" className="w-1 h-1 rounded-full bg-[#4ADE80]" />
                    )
                  )}
                  <span>{label}</span>
                  {hasActiveWork && runningCount > 1 && (
                    <span className="text-[9.5px] text-amber-300/90 tabular-nums">
                      ·{runningCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {(isSpeaking || isListening) && (
            <div className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
              {frequencyBands.slice(0, 5).map((band, idx) => (
                <span
                  key={idx}
                  className="w-0.5 h-full origin-bottom rounded-[1px] bg-[#4ADE80] transition-transform duration-75"
                  style={{ transform: `scaleY(${Math.max(0.25, Math.min(1, band))})` }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
