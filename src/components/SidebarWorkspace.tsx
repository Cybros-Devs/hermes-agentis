import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pin, Plus, Search, X } from 'lucide-react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
  ExpressionMood,
  HermesAgentSession,
  HermesGatewayStatus,
} from '../types/hermes';
import type { CanvasSession } from '../utils/canvasSessions';
import {
  buildSidebarSessionEntries,
  filterSidebarSessionEntries,
  type SidebarScopeTab,
} from '../utils/sidebarSessions';
import { summarizeChannelTaskActivity } from '../utils/taskInsights';
import { AsciiPortraitCanvas } from './AsciiPortraitCanvas';
import { StaggerItem, StatusPulse, getStaggerVars } from './ui';

interface SidebarWorkspaceProps {
  channels: Channel[];
  activeChannel: ChannelId;
  onSelectChannel: (id: ChannelId) => void;
  canvasSessions?: CanvasSession[];
  hermesSessions?: HermesAgentSession[];
  thinkingByChannel?: Record<string, boolean>;
  onSelectSession?: (session: CanvasSession) => void;
  onPinToCanvas?: (session: CanvasSession) => void;
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
  gatewayStatus?: HermesGatewayStatus | null;
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
  hermesSessions = [],
  thinkingByChannel = {},
  onSelectSession,
  onPinToCanvas,
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
  workspaceTitle = 'Hermes',
  gatewayStatus,
  homeSessionDraft = false,
  queueVisible = true,
  channelsVisible = true,
}: SidebarWorkspaceProps) {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const openBrief = brief.filter((b) => !b.resolved).slice(0, 2);
  const activeChannelBtnRef = useRef<HTMLButtonElement | null>(null);

  const [scopeTab, setScopeTab] = useState<SidebarScopeTab>('workspace');
  const [searchQuery, setSearchQuery] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const activityByChannel = useMemo(
    () => summarizeChannelTaskActivity(tasks, channels, thinkingByChannel),
    [tasks, channels, thinkingByChannel]
  );

  const sidebarEntries = useMemo(
    () =>
      buildSidebarSessionEntries({
        canvasSessions,
        hermesSessions,
        activityByChannel,
        nowMs,
      }),
    [canvasSessions, hermesSessions, activityByChannel, nowMs]
  );

  const allCounts = useMemo(
    () =>
      filterSidebarSessionEntries(sidebarEntries, {
        tab: 'all',
        query: '',
      }),
    [sidebarEntries]
  );

  const effectiveScopeTab: SidebarScopeTab =
    scopeTab === 'external' && allCounts.externalCount === 0 ? 'workspace' : scopeTab;

  const {
    visible: visibleSessions,
    workspaceCount,
    externalCount,
    totalCount: scopedCount,
  } = useMemo(
    () =>
      filterSidebarSessionEntries(sidebarEntries, {
        tab: 'all',
        query: searchQuery,
        originFilter: effectiveScopeTab,
      }),
    [sidebarEntries, effectiveScopeTab, searchQuery]
  );

  const activeChannelActivity = activityByChannel[activeChannel];
  const isGatewayConnected = Boolean(gatewayStatus?.connected);
  const gatewaySubline = gatewayStatus
    ? isGatewayConnected
      ? `${gatewayStatus.activeModel || 'hermes-agent'} · ${gatewayStatus.profile || 'default'}`
      : 'Gateway offline · Open Ops'
    : lastSpokenLine;

  useEffect(() => {
    activeChannelBtnRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeChannel, channels.length]);

  const showScopeTabs = externalCount > 0;
  const showSearchBar = scopedCount >= 5 || searchQuery.trim().length > 0;

  return (
    <aside
      aria-label="Hermes Sessions and Status"
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
          className="ui-tactile flex items-center gap-1 text-xs font-medium text-emerald-50/80 hover:text-white transition-colors cursor-pointer whitespace-nowrap px-2 py-1 rounded-md hover:bg-white/[0.06] shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New</span>
        </button>
      </div>

      {/* Agent & Gateway Status Card (opens Operations / Queue) */}
      <div className="px-3">
        <button
          type="button"
          onClick={onOpenQueue}
          title="Open Hermes Agent Operations"
          className="ui-tactile w-full text-left rounded-xl border border-white/10 bg-white/[0.03] hover:border-[#34D399]/40 hover:bg-white/[0.045] p-2.5 flex items-center gap-3 transition-colors cursor-pointer"
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
                className={`inline-flex items-center gap-1.5 font-mono text-[10.5px] tabular-nums truncate min-w-0 text-right ${
                  !homeSessionDraft && activeChannelActivity?.hasActiveTask
                    ? 'text-amber-300'
                    : gatewayStatus && !isGatewayConnected
                    ? 'text-rose-300/90'
                    : 'text-[#6EE7B7]'
                }`}
              >
                {!homeSessionDraft && activeChannelActivity?.hasActiveTask ? (
                  <>
                    <StatusPulse state="thinking" size="sm" />
                    <span className="truncate">working</span>
                  </>
                ) : gatewayStatus ? (
                  <>
                    <StatusPulse state={isGatewayConnected ? 'live' : 'error'} size="sm" />
                    <span>{isGatewayConnected ? 'online' : 'offline'}</span>
                  </>
                ) : (
                  <span>{homeSessionDraft || !activeChannel ? 'new session' : `#${activeChannel}`}</span>
                )}
              </span>
            </div>
            <p className="text-[11.5px] text-emerald-100/55 truncate mt-0.5">{gatewaySubline}</p>
          </div>
        </button>
      </div>

      {/* Needs Attention (Pinned above sessions so approval gates are never buried) */}
      {queueVisible && (pendingApprovals.length > 0 || openBrief.length > 0) && (
        <div className="px-3 pt-3 pb-1 space-y-1 border-b border-white/[0.06]">
          <div className="px-2 pb-0.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200/75 tabular-nums">
            <span>Needs attention</span>
            <span>{pendingApprovals.length + openBrief.length}</span>
          </div>

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
                <StatusPulse state="waiting" className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-white truncate">{card.title}</div>
                  <div className="text-[10.5px] font-mono text-amber-200/75 truncate mt-0.5">
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
                  <div className="text-[12.5px] text-emerald-50/85 truncate">{item.title}</div>
                  <div className="text-[10.5px] font-mono text-emerald-100/45 truncate mt-0.5">Brief</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Sessions Header: Workspace Sessions vs optional Gateway History */}
      {queueVisible && (workspaceCount > 0 || externalCount > 0) && (
        <div className="px-3 pt-2.5 pb-1 space-y-2 shrink-0">
          {showScopeTabs ? (
            <div
              role="tablist"
              aria-label="Session scope"
              className="flex items-center justify-between gap-2 px-1 border-b border-white/[0.07]"
            >
              <div className="flex items-center gap-3">
                {(
                  [
                    { id: 'workspace', label: 'Sessions', count: workspaceCount },
                    { id: 'external', label: 'Gateway', count: externalCount },
                  ] as const
                ).map((tab) => {
                  const selected = effectiveScopeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      data-testid={`sidebar-tab-${tab.id}`}
                      onClick={() => {
                        setScopeTab(tab.id);
                        setSearchQuery('');
                      }}
                      className={`pb-1.5 text-[11px] font-medium transition-colors cursor-pointer inline-flex items-baseline gap-1 border-b-2 -mb-px ${
                        selected
                          ? 'text-white border-[#34D399]'
                          : 'text-emerald-100/45 border-transparent hover:text-emerald-100/80'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          selected ? 'text-[#6EE7B7]' : 'text-emerald-100/35'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="px-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-100/45 tabular-nums">
              <span>Sessions</span>
              <span>{workspaceCount}</span>
            </div>
          )}

          {showSearchBar && (
            <div className="relative">
              <Search
                aria-hidden="true"
                className="w-3.5 h-3.5 text-emerald-100/35 pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              />
              <input
                type="text"
                role="searchbox"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  effectiveScopeTab === 'external'
                    ? 'Search gateway history…'
                    : 'Filter sessions…'
                }
                aria-label="Filter sessions"
                data-testid="sidebar-session-search"
                className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-[#34D399]/45 focus:outline-none pl-8 pr-7 py-1.5 text-[11.5px] text-white/90 placeholder:text-emerald-100/45 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear session filter"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-emerald-100/45 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Scannable Session List */}
      <div className="flex-1 overflow-y-auto cyber-scroll px-3 py-1.5 space-y-1">
        {!queueVisible ? (
          <div className="px-2.5 py-6 text-center text-[11px] text-emerald-100/40">
            Queue hidden in UI layout
          </div>
        ) : effectiveScopeTab === 'workspace' && workspaceCount === 0 && pendingApprovals.length === 0 && openBrief.length === 0 ? (
          <div className="px-2.5 py-5 text-left space-y-1.5">
            <p className="text-[12px] font-medium text-emerald-100/65">No sessions created yet</p>
            <p className="text-[11px] text-emerald-100/40 leading-relaxed">
              {externalCount > 0
                ? 'Start a fresh prompt on Home, or inspect external CLI & API runs in Gateway.'
                : 'Start a prompt on Home or add a Dot on Canvas to begin.'}
            </p>
            {externalCount > 0 && (
              <button
                type="button"
                onClick={() => setScopeTab('external')}
                className="text-[11px] font-mono text-[#6EE7B7] hover:text-white underline underline-offset-4 cursor-pointer"
              >
                Browse {externalCount} gateway {externalCount === 1 ? 'session' : 'sessions'}
              </button>
            )}
          </div>
        ) : visibleSessions.length === 0 ? (
          <div className="px-2.5 py-5 text-left space-y-2">
            <p className="text-[12px] font-medium text-emerald-100/60">
              {searchQuery.trim()
                ? 'No matching sessions'
                : 'No external gateway sessions'}
            </p>
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-[11px] font-mono text-emerald-100/60 hover:text-white underline underline-offset-4 cursor-pointer"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <>
            {effectiveScopeTab === 'external' && (
              <div className="px-2 pb-1 text-[10.5px] text-emerald-100/40">
                External CLI &amp; API history · click to read or pin to Canvas
              </div>
            )}
            {visibleSessions.map((entry, idx) => {
              const { session } = entry;
              const active =
                !homeSessionDraft &&
                (selectedItemId === session.id || activeChannel === session.channelId);

              const rowContent = (
                <div
                  className={`group/row flex items-center gap-1 rounded-xl border transition-colors duration-150 ${
                    active
                      ? 'bg-[#34D399]/[0.09] border-[#34D399]/35'
                      : 'border-transparent hover:bg-white/[0.04]'
                  }`}
                >
                  <button
                    type="button"
                    ref={active ? activeChannelBtnRef : undefined}
                    data-testid={`sidebar-session-${session.channelId}`}
                    data-has-task={String(entry.hasActiveWork)}
                    data-origin={entry.origin}
                    title={entry.tooltipTitle}
                    onClick={() =>
                      onSelectSession
                        ? onSelectSession(session)
                        : onSelectChannel(session.channelId)
                    }
                    className="ui-tactile flex-1 min-w-0 text-left flex items-start gap-2.5 px-2.5 py-2 cursor-pointer"
                  >
                    <StatusPulse
                      state={entry.hasActiveWork ? 'thinking' : active ? 'live' : 'idle'}
                      size="sm"
                      className="mt-1.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span
                          className={`text-[12.5px] font-medium truncate min-w-0 flex-1 ${
                            active
                              ? 'text-white'
                              : entry.isOpaqueId
                              ? 'text-emerald-50/75'
                              : 'text-emerald-50/90'
                          }`}
                        >
                          {entry.displayTitle}
                        </span>
                        {(entry.hasActiveWork || entry.relativeTime) && (
                          <span
                            className={`font-mono text-[10px] tabular-nums shrink-0 ${
                              entry.hasActiveWork
                                ? 'text-amber-300/90 font-medium'
                                : active
                                ? 'text-[#6EE7B7]/90'
                                : 'text-emerald-100/52'
                            }`}
                          >
                            {entry.hasActiveWork
                              ? entry.runningCount > 1
                                ? `${entry.runningCount} active`
                                : 'working'
                              : entry.relativeTime}
                          </span>
                        )}
                      </div>
                      <div
                        className={`font-mono text-[10.5px] truncate mt-0.5 ${
                          entry.hasActiveWork
                            ? 'text-amber-200/75'
                            : active
                            ? 'text-emerald-100/68'
                            : 'text-emerald-100/52'
                        }`}
                      >
                        {entry.metadataLine}
                      </div>
                    </div>
                  </button>

                  {effectiveScopeTab === 'external' && !entry.onCanvas && onPinToCanvas && (
                    <button
                      type="button"
                      data-testid={`sidebar-pin-${session.channelId}`}
                      onClick={() => onPinToCanvas(session)}
                      aria-label={`Pin ${entry.displayTitle} to Canvas`}
                      title="Pin to Canvas"
                      className="mr-1.5 p-1.5 rounded-lg text-emerald-100/45 hover:text-[#6EE7B7] hover:bg-white/[0.08] opacity-70 sm:opacity-0 sm:group-hover/row:opacity-100 focus:opacity-100 transition-opacity cursor-pointer shrink-0"
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );

              if (idx < 10) {
                return (
                  <StaggerItem key={session.id} index={idx}>
                    {rowContent}
                  </StaggerItem>
                );
              }
              return <div key={session.id}>{rowContent}</div>;
            })}
          </>
        )}
      </div>

      {/* Minimal Live Voice Band Footer (only when audio active) */}
      {channelsVisible && (isSpeaking || isListening) && (
        <div className="py-2.5 px-3.5 border-t border-white/[0.07] flex items-center justify-between gap-2 font-mono text-[10.5px]">
          <span className="text-[#6EE7B7] truncate">
            {isListening ? 'Listening…' : 'Voice active'}
          </span>
          <div className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
            {frequencyBands.slice(0, 5).map((band, idx) => (
              <span
                key={idx}
                className="w-0.5 h-full origin-bottom rounded-[1px] bg-[#4ADE80] transition-transform duration-75"
                style={{ transform: `scaleY(${Math.max(0.25, Math.min(1, band))})` }}
              />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

