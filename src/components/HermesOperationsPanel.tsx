import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Cpu,
  Hash,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import type {
  ApprovalCard,
  BriefDecision,
  Channel,
  ChannelId,
  HermesCronJob,
  HermesGatewayStatus,
  HermesSkill,
  HermesToolset,
  HermesTransportMode,
} from '../types/hermes';
import { EmptyState, MorphTabs, StaggerItem, StatusPulse, type MorphTabItem } from './ui';

interface HermesOperationsPanelProps {
  channels: Channel[];
  activeChannel: ChannelId;
  onSelectChannel: (id: ChannelId) => void;
  approvals: ApprovalCard[];
  onApproveCard: (id: string, choice?: 'once' | 'always' | 'deny') => void;
  onRejectCard: (id: string) => void;
  onClarifyCard?: (id: string, answer: string) => void;
  brief: BriefDecision[];
  onRunBriefCommand: (command: string, briefId: string) => void;
  gatewayStatus?: HermesGatewayStatus | null;
  onRefreshGateway?: () => Promise<unknown> | void;
  skills?: HermesSkill[];
  toolsets?: HermesToolset[];
  cronJobs?: HermesCronJob[];
  transportMode?: HermesTransportMode;
  onChangeTransportMode?: (mode: HermesTransportMode) => void;
  onCreateJob?: (payload: { prompt: string; schedule: string; name?: string }) => Promise<unknown>;
  onPauseJob?: (jobId: string) => Promise<void>;
  onResumeJob?: (jobId: string) => Promise<void>;
  onRunJob?: (jobId: string) => Promise<void>;
  onDeleteJob?: (jobId: string) => Promise<void>;
}

type OpsTab = 'runtime' | 'approvals' | 'jobs';

export function HermesOperationsPanel({
  channels,
  activeChannel,
  onSelectChannel,
  approvals,
  onApproveCard,
  onRejectCard,
  onClarifyCard,
  gatewayStatus,
  onRefreshGateway,
  skills = [],
  toolsets = [],
  cronJobs = [],
  transportMode = 'auto',
  onChangeTransportMode,
  onCreateJob,
  onPauseJob,
  onResumeJob,
  onRunJob,
  onDeleteJob,
}: HermesOperationsPanelProps) {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending').length;

  const [activeTab, setActiveTab] = useState<OpsTab>(
    pendingApprovals > 0 ? 'approvals' : 'runtime'
  );
  const [clarifyInputs, setClarifyInputs] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [expandedToolset, setExpandedToolset] = useState<string | null>(null);
  const [showNewJobForm, setShowNewJobForm] = useState(false);
  const [newJobSchedule, setNewJobSchedule] = useState('0 9 * * *');
  const [newJobPrompt, setNewJobPrompt] = useState('');
  const [newJobName, setNewJobName] = useState('');
  const [jobBusyId, setJobBusyId] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  const opsTabs: MorphTabItem<OpsTab>[] = [
    { id: 'runtime', label: 'Gateway & Tools' },
    { id: 'approvals', label: `Approvals (${pendingApprovals})` },
    { id: 'jobs', label: `Jobs (${cronJobs.length})` },
  ];

  const handleRefresh = async () => {
    if (!onRefreshGateway) return;
    setRefreshing(true);
    try {
      await onRefreshGateway();
    } finally {
      window.setTimeout(() => setRefreshing(false), 260);
    }
  };

  const handleCreateJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateJob || !newJobPrompt.trim() || !newJobSchedule.trim()) return;
    setJobError(null);
    setJobBusyId('create');
    try {
      await onCreateJob({
        prompt: newJobPrompt.trim(),
        schedule: newJobSchedule.trim(),
        name: newJobName.trim() || undefined,
      });
      setNewJobPrompt('');
      setNewJobName('');
      setShowNewJobForm(false);
    } catch (err) {
      setJobError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setJobBusyId(null);
    }
  };

  const runJobAction = async (jobId: string, fn?: (id: string) => Promise<void>) => {
    if (!fn) return;
    setJobError(null);
    setJobBusyId(jobId);
    try {
      await fn(jobId);
    } catch (err) {
      setJobError(err instanceof Error ? err.message : 'Job action failed');
    } finally {
      setJobBusyId(null);
    }
  };

  const isConnected = Boolean(gatewayStatus?.connected);
  const capabilities = gatewayStatus?.capabilities;
  const routeDisplay = `${gatewayStatus?.gatewayUrl || 'http://127.0.0.1:8642'}${gatewayStatus?.routePrefix || ''}`;

  return (
    <section
      aria-label="Hermes Agent Operations"
      data-testid="hermes-operations-panel"
      className="flex flex-col rounded-xl bg-white/[0.025] border border-white/10 overflow-hidden"
    >
      {/* Session Lane Strip */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.07] bg-black/20 overflow-x-auto cyber-scroll">
        <div className="flex items-center gap-1.5 min-w-0">
          {channels.length === 0 ? (
            <span className="font-mono text-xs text-emerald-100/50">
              No active sessions synced from gateway
            </span>
          ) : (
            channels.map((ch) => {
              const active = ch.id === activeChannel;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onSelectChannel(ch.id)}
                  className={`ui-tactile px-2.5 py-1 rounded-md font-mono text-xs flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                    active
                      ? 'bg-[#34D399]/14 border-[#34D399]/45 text-[#6EE7B7] font-medium'
                      : 'bg-transparent border-transparent text-emerald-100/60 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <Hash className="w-3 h-3 opacity-75" />
                  <span>{ch.name.replace(/^#/, '')}</span>
                </button>
              );
            })
          )}
        </div>
        <span className="font-mono text-[11px] text-emerald-100/45 whitespace-nowrap shrink-0">
          {gatewayStatus?.sessionKeyHeader || 'X-Hermes-Session-Key'}
        </span>
      </div>

      {/* Gliding Pill Tab Navigation */}
      <div className="px-3 py-2 border-b border-white/[0.07] bg-black/10 overflow-x-auto cyber-scroll">
        <MorphTabs
          items={opsTabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Hermes Agent sections"
          variant="pill"
          fullWidth
        />
      </div>

      {/* Tab Content — flows cleanly within parent scroll viewport */}
      <div
        key={activeTab}
        className="ui-card-enter p-3.5 space-y-3"
      >
        {activeTab === 'approvals' &&
          (approvals.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-4 h-4" />}
              title="No pending run approvals"
              description="Pending execution gates from /v1/runs/{id}/events and pending_controls will appear here when a run requests confirmation."
            />
          ) : (
            approvals.map((card, idx) => {
              const isPending = card.status === 'pending';
              const isClarify = card.kind === 'clarify';
              const clarifyVal = clarifyInputs[card.id] ?? '';
              return (
                <StaggerItem key={card.id} index={idx}>
                  <div
                    data-testid={`approval-card-${card.id}`}
                    className="rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition-colors p-3 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-emerald-100/55">
                          <span>run:{card.runId || card.id}</span>
                          {card.requestId && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>req:{card.requestId}</span>
                            </>
                          )}
                          {typeof card.executionGeneration === 'number' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>gen:{card.executionGeneration}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>#{card.channelId}</span>
                          {card.mcpTool && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#6EE7B7]/85">{card.mcpTool}</span>
                            </>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-white mt-0.5">{card.title}</h3>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase font-semibold ${
                          card.status === 'approved'
                            ? 'text-emerald-400'
                            : card.status === 'rejected'
                            ? 'text-rose-400'
                            : 'text-amber-300'
                        }`}
                      >
                        {isPending && <StatusPulse state="live" size="sm" />}
                        <span>{card.status}</span>
                      </span>
                    </div>

                    {card.summary && (
                      <p className="text-xs text-emerald-50/80 whitespace-pre-wrap">{card.summary}</p>
                    )}

                    {(card.command || card.draft) && (
                      <pre className="rounded-lg bg-black/45 border border-white/10 p-2 font-mono text-[11px] text-[#6EE7B7] overflow-x-auto whitespace-pre-wrap">
                        {card.command || card.draft}
                      </pre>
                    )}

                    {isPending && isClarify && onClarifyCard ? (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={clarifyVal}
                          onChange={(e) =>
                            setClarifyInputs((prev) => ({ ...prev, [card.id]: e.target.value }))
                          }
                          placeholder="Enter clarification answer..."
                          className="flex-1 min-w-0 rounded-lg bg-black/35 border border-white/12 px-2.5 py-2 font-mono text-xs text-white focus:outline-none focus:border-[#34D399]/60"
                        />
                        <button
                          type="button"
                          onClick={() => onClarifyCard(card.id, clarifyVal)}
                          disabled={!clarifyVal.trim()}
                          className="min-h-[36px] px-3 rounded-lg bg-[#34D399] text-[#05140E] font-semibold text-xs inline-flex items-center gap-1.5 hover:bg-[#6EE7B7] disabled:opacity-45 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Reply</span>
                        </button>
                      </div>
                    ) : isPending ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          data-testid={`approve-once-${card.id}`}
                          onClick={() => onApproveCard(card.id, 'once')}
                          className="flex-1 min-h-[38px] px-3 rounded-lg bg-[#34D399] text-[#05140E] font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#6EE7B7] transition-colors cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Approve Once</span>
                        </button>
                        <button
                          type="button"
                          data-testid={`approve-always-${card.id}`}
                          onClick={() => onApproveCard(card.id, 'always')}
                          className="min-h-[38px] px-3 rounded-lg bg-[#34D399]/18 text-[#6EE7B7] border border-[#34D399]/40 font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#34D399]/28 transition-colors cursor-pointer"
                        >
                          <span>Always Allow</span>
                        </button>
                        <button
                          type="button"
                          data-testid={`approve-deny-${card.id}`}
                          onClick={() => onRejectCard(card.id)}
                          className="min-h-[38px] px-3.5 rounded-lg bg-rose-500/12 text-rose-200 border border-rose-400/30 text-xs flex items-center justify-center gap-1.5 hover:bg-rose-500/22 transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                          <span>Deny</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </StaggerItem>
              );
            })
          ))}

        {activeTab === 'jobs' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono text-xs text-white font-semibold">
                Scheduled Jobs (GET /api/jobs)
              </div>
              <div className="flex items-center gap-2">
                {onRefreshGateway && (
                  <button
                    type="button"
                    onClick={() => void handleRefresh()}
                    className="ui-tactile px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/10 text-[11px] font-mono text-emerald-100/75 hover:text-white cursor-pointer"
                  >
                    Refresh
                  </button>
                )}
                {onCreateJob && isConnected && (
                  <button
                    type="button"
                    onClick={() => setShowNewJobForm((v) => !v)}
                    className="ui-tactile px-2.5 py-1 rounded-md bg-[#34D399]/18 border border-[#34D399]/40 text-[11px] font-mono text-[#6EE7B7] hover:bg-[#34D399]/28 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Job</span>
                  </button>
                )}
              </div>
            </div>

            {jobError && (
              <div className="rounded-lg bg-rose-500/15 border border-rose-400/30 px-3 py-2 font-mono text-[11px] text-rose-200">
                {jobError}
              </div>
            )}

            {showNewJobForm && onCreateJob && (
              <form
                onSubmit={handleCreateJobSubmit}
                className="rounded-xl bg-black/35 border border-[#34D399]/30 p-3 space-y-2"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newJobName}
                    onChange={(e) => setNewJobName(e.target.value)}
                    placeholder="Name (optional)"
                    className="rounded-lg bg-black/45 border border-white/12 px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-[#34D399]/60"
                  />
                  <input
                    type="text"
                    value={newJobSchedule}
                    onChange={(e) => setNewJobSchedule(e.target.value)}
                    placeholder="Cron or schedule (e.g. 0 9 * * *)"
                    className="rounded-lg bg-black/45 border border-white/12 px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-[#34D399]/60"
                  />
                </div>
                <textarea
                  rows={2}
                  value={newJobPrompt}
                  onChange={(e) => setNewJobPrompt(e.target.value)}
                  placeholder="Job prompt to execute on gateway..."
                  className="w-full rounded-lg bg-black/45 border border-white/12 px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-[#34D399]/60"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewJobForm(false)}
                    className="px-3 py-1 rounded-md text-xs text-emerald-100/65 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={jobBusyId === 'create' || !newJobPrompt.trim()}
                    className="px-3 py-1 rounded-md bg-[#34D399] text-[#05140E] font-semibold text-xs hover:bg-[#6EE7B7] disabled:opacity-45 cursor-pointer"
                  >
                    Create Job
                  </button>
                </div>
              </form>
            )}

            {cronJobs.length === 0 ? (
              <EmptyState
                icon={<Cpu className="w-4 h-4" />}
                title={isConnected ? 'No scheduled jobs on gateway' : 'Gateway offline'}
                description={
                  isConnected
                    ? 'Create a job above or via cron tools; live jobs from GET /api/jobs will appear here.'
                    : 'Connect to the Hermes Agent API Server to inspect and manage /api/jobs.'
                }
              />
            ) : (
              cronJobs.map((job, idx) => {
                const isPaused = job.paused || job.status === 'paused';
                const busy = jobBusyId === job.id;
                return (
                  <StaggerItem key={job.id} index={idx}>
                    <div
                      data-testid={`cron-job-${job.id}`}
                      className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                            <span className="text-[#6EE7B7] font-semibold">{job.schedule}</span>
                            <span className="text-emerald-100/40">·</span>
                            <span className={isPaused ? 'text-amber-300' : 'text-emerald-300'}>
                              {job.status || (isPaused ? 'paused' : 'active')}
                            </span>
                            <span className="text-emerald-100/40">·</span>
                            <span className="text-emerald-100/50 truncate">{job.id}</span>
                          </div>
                          <p className="text-xs text-white mt-1">{job.summary}</p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {onRunJob && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void runJobAction(job.id, onRunJob)}
                              title="Trigger job now (POST /api/jobs/{id}/run)"
                              className="px-2 py-1 rounded-md bg-white/[0.06] border border-white/10 text-[11px] font-mono text-[#6EE7B7] hover:bg-white/12 cursor-pointer"
                            >
                              Run
                            </button>
                          )}
                          {isPaused
                            ? onResumeJob && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runJobAction(job.id, onResumeJob)}
                                  title="Resume job"
                                  className="p-1.5 rounded-md bg-white/[0.06] border border-white/10 text-emerald-200 hover:text-white cursor-pointer"
                                >
                                  <Play className="w-3 h-3" />
                                </button>
                              )
                            : onPauseJob && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void runJobAction(job.id, onPauseJob)}
                                  title="Pause job"
                                  className="p-1.5 rounded-md bg-white/[0.06] border border-white/10 text-amber-200 hover:text-white cursor-pointer"
                                >
                                  <Pause className="w-3 h-3" />
                                </button>
                              )}
                          {onDeleteJob && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void runJobAction(job.id, onDeleteJob)}
                              title="Delete job"
                              className="p-1.5 rounded-md bg-white/[0.06] border border-white/10 text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </StaggerItem>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'runtime' && (
          <div className="divide-y divide-white/[0.07]">
            {/* Gateway Status & Route */}
            <div className="pb-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <StatusPulse state={isConnected ? 'live' : 'error'} size="sm" />
                  <span className="text-white font-semibold">Hermes Agent API Server</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="ops-gateway-status"
                    className={isConnected ? 'text-[#4ADE80] font-semibold' : 'text-rose-300 font-semibold'}
                  >
                    {isConnected ? 'CONNECTED' : 'OFFLINE'}
                  </span>
                  {onRefreshGateway && (
                    <button
                      type="button"
                      onClick={() => void handleRefresh()}
                      aria-label="Probe Hermes Gateway"
                      title="Probe Hermes Gateway"
                      className="ui-tactile w-7 h-7 rounded-md bg-white/[0.05] border border-white/10 text-emerald-100/75 hover:text-white hover:border-white/20 flex items-center justify-center cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${refreshing ? 'motion-safe:animate-spin motion-safe-only' : ''}`}
                      />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11.5px] py-1">
                <div className="flex items-center justify-between gap-2 truncate">
                  <span className="text-emerald-100/45 shrink-0">Endpoint</span>
                  <span className="text-emerald-50/90 truncate" title={routeDisplay}>
                    {routeDisplay}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-emerald-100/45 shrink-0">Model</span>
                  <span className="text-[#6EE7B7] truncate">
                    {gatewayStatus?.activeModel || 'hermes-agent'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-emerald-100/45 shrink-0">Profile</span>
                  <span className="text-emerald-50/90 truncate">
                    {gatewayStatus?.profile || 'default'} ({gatewayStatus?.healthStatus || (isConnected ? 'ok' : 'unreachable')})
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-emerald-100/45 shrink-0">Transport</span>
                  <span className="text-emerald-50/90 truncate">
                    {gatewayStatus?.resolvedTransport || 'chat_completions'}
                  </span>
                </div>
              </div>

              {onChangeTransportMode && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <span className="font-mono text-[11px] text-emerald-100/55">
                    Turn Transport
                  </span>
                  <div className="inline-flex flex-wrap items-center gap-0.5 p-0.5 rounded-lg bg-black/35 border border-white/10">
                    {(
                      [
                        ['auto', 'Auto'],
                        ['runs', '/v1/runs'],
                        ['session_stream', '/sessions/stream'],
                        ['chat_completions', '/v1/chat/completions'],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onChangeTransportMode(mode)}
                        className={`px-2.5 py-1 rounded-md font-mono text-[10.5px] transition-colors cursor-pointer whitespace-nowrap ${
                          transportMode === mode
                            ? 'bg-[#34D399]/20 text-[#6EE7B7] font-medium'
                            : 'text-emerald-100/55 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {capabilities && (
                <div className="font-mono text-[10.5px] text-emerald-100/55 flex flex-wrap items-center gap-2 pt-0.5">
                  <span>/v1/capabilities:</span>
                  {capabilities.features?.run_submission && (
                    <span className="text-[#6EE7B7]">runs</span>
                  )}
                  {capabilities.features?.run_approval && (
                    <span className="text-[#6EE7B7]">approvals</span>
                  )}
                  {capabilities.features?.session_chat_stream && (
                    <span className="text-[#6EE7B7]">session_stream</span>
                  )}
                  {capabilities.features?.reasoning_streaming && (
                    <span className="text-[#6EE7B7]">reasoning</span>
                  )}
                  {capabilities.sessionKeyHeader && (
                    <span className="text-[#6EE7B7]">{capabilities.sessionKeyHeader}</span>
                  )}
                </div>
              )}

              {!isConnected && gatewayStatus?.error && (
                <p className="rounded-lg bg-rose-500/10 border border-rose-400/25 px-3 py-2 font-mono text-[11px] text-rose-200">
                  Probe error: {gatewayStatus.error}
                </p>
              )}
            </div>

            {/* Toolsets from GET /v1/toolsets */}
            <div className="py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-xs font-semibold text-white flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-[#6EE7B7]" />
                  <span>Toolsets (GET /v1/toolsets)</span>
                </h3>
                <span className="font-mono text-[10.5px] text-emerald-100/50 tabular-nums">
                  {toolsets.length} reported
                </span>
              </div>
              {toolsets.length === 0 ? (
                <p className="font-mono text-[11.5px] text-emerald-100/50">
                  {isConnected ? '0 toolsets returned by gateway.' : 'Offline — start hermes gateway to inspect toolsets.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {toolsets.map((ts) => {
                    const isOpen = expandedToolset === ts.name;
                    return (
                      <div
                        key={ts.name}
                        className="border-b border-white/[0.06] last:border-0 pb-1.5 last:pb-0 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedToolset(isOpen ? null : ts.name)}
                          className="w-full text-left flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer hover:text-white"
                        >
                          <span className={ts.enabled ? 'text-[#6EE7B7] font-semibold' : 'text-emerald-100/45'}>
                            {ts.label}
                          </span>
                          <span className="text-emerald-100/50">
                            {ts.enabled ? (ts.configured === false ? 'unconfigured' : 'enabled') : 'disabled'} · {ts.tools.length} tools
                          </span>
                        </button>
                        {ts.description && (
                          <p className="text-emerald-100/60 text-[11px] mt-0.5">{ts.description}</p>
                        )}
                        {isOpen && ts.tools.length > 0 && (
                          <div className="mt-1 font-mono text-[10.5px] text-emerald-100/75 bg-black/30 rounded p-2">
                            {ts.tools.join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Skills from GET /v1/skills */}
            <div className="py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-xs font-semibold text-white">
                  Skills (GET /v1/skills)
                </h3>
                <span className="font-mono text-[10.5px] text-emerald-100/50 tabular-nums">
                  {skills.length} loaded
                </span>
              </div>
              {skills.length === 0 ? (
                <p className="font-mono text-[11.5px] text-emerald-100/50">
                  {isConnected ? '0 skills returned by gateway.' : 'Offline — start hermes gateway to inspect /v1/skills.'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {skills.map((skill) => (
                    <div
                      key={skill.name}
                      className="text-xs border-b border-white/[0.06] last:border-0 pb-1.5 last:pb-0"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-[#6EE7B7] font-semibold">{skill.name}</span>
                        <span className="text-emerald-100/45 truncate max-w-[55%]">
                          {skill.source}
                        </span>
                      </div>
                      {skill.summary && (
                        <p className="text-emerald-100/65 mt-0.5">{skill.summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Honest Memory Scoping Summary */}
            <div className="pt-3 space-y-1">
              <h3 className="font-mono text-xs font-semibold text-white">
                Memory &amp; Session Continuity
              </h3>
              <p className="font-mono text-[11px] text-emerald-100/55 leading-relaxed">
                Transcript continuity uses <span className="text-[#6EE7B7]">X-Hermes-Session-Id</span>; isolated Honcho/long-term memory scoping sends{' '}
                <span className="text-[#6EE7B7]">{gatewayStatus?.sessionKeyHeader || 'X-Hermes-Session-Key'}</span> per lane. Hermes API Server does not expose a separate /v1/memory endpoint.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
