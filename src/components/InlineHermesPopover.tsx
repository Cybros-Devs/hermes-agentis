import { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Cpu,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import type {
  ApprovalCard,
  ChannelId,
  HermesCronJob,
  HermesGatewayStatus,
  HermesProfileSummary,
  HermesSkill,
  HermesToolset,
  HermesTransportMode,
} from '../types/hermes';
import { StatusPulse } from './ui';

type InspectorTab = 'runtime' | 'skills' | 'tools' | 'cron';

interface InlineHermesPopoverProps {
  open: boolean;
  onClose: () => void;
  activeChannel: ChannelId;
  activeSessionId: string;
  activeProfile: string;
  isHomeDraft: boolean;
  gatewayStatus?: HermesGatewayStatus | null;
  skills?: HermesSkill[];
  toolsets?: HermesToolset[];
  cronJobs?: HermesCronJob[];
  approvals?: ApprovalCard[];
  profiles?: HermesProfileSummary[];
  transportMode?: HermesTransportMode;
  onRefreshGateway?: () => Promise<unknown> | void;
  onChangeTransportMode?: (mode: HermesTransportMode) => void;
  onSelectProfile?: (profileId: string) => void;
  onApproveCard?: (id: string, choice?: 'once' | 'always' | 'deny') => void;
  onRejectCard?: (id: string) => void;
  onPauseJob?: (jobId: string) => Promise<void>;
  onResumeJob?: (jobId: string) => Promise<void>;
  onRunJob?: (jobId: string) => Promise<void>;
  onOpenOperations: () => void;
  onRunPromptOrCommand: (text: string) => void;
}

export function InlineHermesPopover({
  open,
  onClose,
  activeChannel,
  activeSessionId,
  activeProfile,
  isHomeDraft,
  gatewayStatus,
  skills = [],
  toolsets = [],
  cronJobs = [],
  approvals = [],
  profiles = [],
  transportMode = 'auto',
  onRefreshGateway,
  onChangeTransportMode,
  onSelectProfile,
  onApproveCard,
  onRejectCard,
  onPauseJob,
  onResumeJob,
  onRunJob,
  onOpenOperations,
  onRunPromptOrCommand,
}: InlineHermesPopoverProps) {
  const [tab, setTab] = useState<InspectorTab>('runtime');
  const [skillFilter, setSkillFilter] = useState('');
  const [probing, setProbing] = useState(false);
  const [jobBusyId, setJobBusyId] = useState<string | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isConnected = Boolean(gatewayStatus?.connected);
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const filteredSkills = skillFilter.trim()
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(skillFilter.trim().toLowerCase()) ||
          (s.summary ?? '').toLowerCase().includes(skillFilter.trim().toLowerCase())
      )
    : skills;
  const enabledToolsets = toolsets.filter((t) => t.enabled);

  const handleProbe = async () => {
    if (!onRefreshGateway) return;
    setProbing(true);
    try {
      await onRefreshGateway();
    } finally {
      window.setTimeout(() => setProbing(false), 260);
    }
  };

  const handleJobAction = async (jobId: string, fn?: (id: string) => Promise<void>) => {
    if (!fn) return;
    setJobBusyId(jobId);
    try {
      await fn(jobId);
    } finally {
      setJobBusyId(null);
    }
  };

  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'runtime', label: 'Runtime' },
    { id: 'skills', label: `Skills (${skills.length})` },
    { id: 'tools', label: `Toolsets (${enabledToolsets.length || toolsets.length})` },
    {
      id: 'cron',
      label:
        pendingApprovals.length > 0
          ? `Gates & Cron (${pendingApprovals.length + cronJobs.length})`
          : `Cron (${cronJobs.length})`,
    },
  ];

  return (
    <div
      role="dialog"
      aria-label="Hermes Agent inline runtime inspector"
      data-testid="inline-hermes-inspector"
      className="ui-menu-pop w-full max-w-[680px] mx-auto rounded-xl border border-white/14 bg-[#12151E]/96 backdrop-blur-xl shadow-[0_20px_54px_rgba(0,0,0,0.72)] overflow-hidden text-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-white/[0.08] bg-white/[0.02]">
        <div className="flex items-center gap-2 min-w-0">
          <StatusPulse state={isConnected ? 'live' : 'error'} size="sm" />
          <span className="text-xs font-semibold text-white truncate">
            Hermes Agent Inline Controls
          </span>
          {isHomeDraft ? (
            <span className="hidden sm:inline font-mono text-[10.5px] text-zinc-400 truncate">
              new draft
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                  void navigator.clipboard.writeText(activeSessionId).catch(() => {});
                }
                setCopiedSessionId(true);
                window.setTimeout(() => setCopiedSessionId(false), 1400);
              }}
              title="Copy Hermes session key"
              className="hidden sm:inline-flex items-center gap-1 font-mono text-[10.5px] text-zinc-400 hover:text-white truncate cursor-pointer"
            >
              <span className="truncate max-w-[180px]">{activeSessionId}</span>
              {copiedSessionId ? (
                <Check className="w-3 h-3 text-[var(--ui-accent-soft)] shrink-0" />
              ) : (
                <Copy className="w-2.5 h-2.5 opacity-70 shrink-0" />
              )}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onRefreshGateway && (
            <button
              type="button"
              onClick={() => void handleProbe()}
              aria-label="Probe Hermes Gateway"
              className="ui-tactile h-7 px-2 rounded-md border border-white/10 bg-white/[0.04] text-[11px] font-mono text-zinc-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw
                className={`w-3 h-3 ${probing ? 'motion-safe:animate-spin motion-safe-only' : ''}`}
              />
              <span>Probe</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenOperations();
            }}
            className="ui-tactile h-7 px-2 rounded-md border border-white/10 bg-white/[0.04] text-[11px] font-mono text-[var(--ui-accent-soft)] hover:text-white cursor-pointer"
          >
            Full Ops
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Hermes inspector"
            className="w-7 h-7 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 px-3.5 pt-1.5 border-b border-white/[0.07] overflow-x-auto cyber-scroll">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-2.5 pb-2 pt-1 text-[11.5px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors cursor-pointer ${
                active
                  ? 'border-[var(--ui-accent)] text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="max-h-[46dvh] sm:max-h-[320px] overflow-y-auto cyber-scroll p-3.5 space-y-3">
        {tab === 'runtime' && (
          <div className="space-y-3">
            {/* Gateway summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10.5px]">
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 min-w-0">
                <div className="text-[9.5px] text-zinc-500">Gateway</div>
                <div className={`mt-0.5 font-semibold truncate ${isConnected ? 'text-[var(--ui-accent-soft)]' : 'text-rose-300'}`}>
                  {isConnected ? 'CONNECTED' : 'OFFLINE'}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 min-w-0">
                <div className="text-[9.5px] text-zinc-500">Model</div>
                <div className="text-zinc-200 truncate mt-0.5">
                  {gatewayStatus?.activeModel || 'hermes-agent'}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 min-w-0">
                <div className="text-[9.5px] text-zinc-500">Endpoint</div>
                <div className="text-zinc-300 truncate mt-0.5" title={(gatewayStatus?.gatewayUrl || 'http://127.0.0.1:8642') + (gatewayStatus?.routePrefix || '')}>
                  {((gatewayStatus?.gatewayUrl || 'http://127.0.0.1:8642') + (gatewayStatus?.routePrefix || '')).replace(/^https?:\/\//, '')}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 min-w-0">
                <div className="text-[9.5px] text-zinc-500">Scope Header</div>
                <div className="text-zinc-300 text-[10px] truncate mt-0.5" title={gatewayStatus?.sessionKeyHeader || 'X-Hermes-Session-Key'}>
                  {gatewayStatus?.sessionKeyHeader || 'X-Hermes-Session-Key'}
                </div>
              </div>
            </div>

            {/* Active Profile Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-zinc-400">
                  {isHomeDraft
                    ? 'Launch profile for new session'
                    : `Profile for #${activeChannel}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenOperations();
                  }}
                  className="font-mono text-[10.5px] text-zinc-400 hover:text-white underline underline-offset-4 cursor-pointer"
                >
                  + Add custom profile
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(profiles.length > 0
                  ? profiles
                  : [
                      {
                        id: activeProfile || 'default',
                        label: activeProfile || 'default',
                        mode: 'multiplexed' as const,
                        source: 'primary' as const,
                        baseUrl: gatewayStatus?.gatewayUrl || 'http://127.0.0.1:8642',
                        routePrefix: gatewayStatus?.routePrefix || '',
                        hasApiKey: false,
                        connected: isConnected,
                      },
                    ]
                ).map((p) => {
                  const selected = p.id === activeProfile;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectProfile?.(p.id)}
                      className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[rgba(var(--ui-accent-rgb),0.16)] border-[rgba(var(--ui-accent-rgb),0.45)] text-white'
                          : 'bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white'
                      }`}
                    >
                      <StatusPulse state={p.connected ? 'live' : 'idle'} size="sm" />
                      <span>@{p.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Turn Transport Mode */}
            {onChangeTransportMode && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono text-zinc-400">Turn transport</span>
                  <span className="font-mono text-[10.5px] text-zinc-500">
                    resolved: {gatewayStatus?.resolvedTransport || 'chat_completions'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
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
                      className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] transition-colors cursor-pointer ${
                        transportMode === mode
                          ? 'bg-[rgba(var(--ui-accent-rgb),0.16)] border-[rgba(var(--ui-accent-rgb),0.45)] text-white'
                          : 'bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick inline commands */}
            <div className="pt-1 border-t border-white/[0.06] flex flex-wrap items-center gap-1.5">
              {['/doctor', '/sessions', '/brief', '/memory', '/skills', '/help'].map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => {
                    onClose();
                    onRunPromptOrCommand(cmd);
                  }}
                  className="px-2 py-1 rounded-md border border-white/[0.09] bg-white/[0.03] font-mono text-[10.5px] text-zinc-300 hover:text-white hover:border-white/20 cursor-pointer"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'skills' && (
          <div className="space-y-2.5">
            {skills.length >= 6 && (
              <input
                type="text"
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value)}
                placeholder="Filter skills…"
                className="w-full rounded-lg bg-black/35 border border-white/[0.1] px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--ui-accent)]"
              />
            )}
            {filteredSkills.length === 0 ? (
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 font-mono text-xs text-zinc-400 space-y-2">
                <p>
                  {isConnected
                    ? 'No matching skills loaded on gateway (/v1/skills).'
                    : 'Gateway offline — connect Hermes Gateway to inspect live /v1/skills.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRunPromptOrCommand('/skills');
                  }}
                  className="text-[11px] text-[var(--ui-accent-soft)] hover:text-white underline underline-offset-4 cursor-pointer"
                >
                  Run /skills diagnostic
                </button>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.08] bg-white/[0.02]">
                {filteredSkills.map((skill) => (
                  <div
                    key={skill.name}
                    className="px-3 py-2 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <Sparkles className="w-3 h-3 text-[var(--ui-accent-soft)] shrink-0" />
                        <span className="font-semibold text-white truncate">{skill.name}</span>
                        <span className="text-zinc-500 truncate">{skill.source}</span>
                      </div>
                      {skill.summary && (
                        <p className="text-[11.5px] text-zinc-400 mt-0.5 break-words">
                          {skill.summary}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onRunPromptOrCommand(`Use the ${skill.name} skill to help with this workspace.`);
                      }}
                      className="shrink-0 px-2 py-1 rounded-md border border-white/[0.1] bg-white/[0.04] font-mono text-[10.5px] text-zinc-300 hover:text-white cursor-pointer"
                    >
                      Use
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'tools' && (
          <div className="space-y-2">
            {toolsets.length === 0 ? (
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 font-mono text-xs text-zinc-400 space-y-2">
                <p>
                  {isConnected
                    ? '0 toolsets reported by gateway (/v1/toolsets).'
                    : 'Gateway offline — start hermes gateway to inspect /v1/toolsets.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRunPromptOrCommand('/toolsets');
                  }}
                  className="text-[11px] text-[var(--ui-accent-soft)] hover:text-white underline underline-offset-4 cursor-pointer"
                >
                  Run /toolsets diagnostic
                </button>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.08] bg-white/[0.02]">
                {toolsets.map((ts) => (
                  <div key={ts.name} className="px-3 py-2 space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Wrench className="w-3 h-3 text-[var(--ui-accent-soft)] shrink-0" />
                        <span className={ts.enabled ? 'text-white font-semibold truncate' : 'text-zinc-500 truncate'}>
                          {ts.label}
                        </span>
                      </div>
                      <span className="text-zinc-400 shrink-0">
                        {ts.enabled ? (ts.configured === false ? 'unconfigured' : 'enabled') : 'disabled'} · {ts.tools.length} tools
                      </span>
                    </div>
                    {ts.tools.length > 0 && (
                      <p className="font-mono text-[10.5px] text-zinc-400 break-words">
                        {ts.tools.slice(0, 8).join(', ')}
                        {ts.tools.length > 8 ? ` +${ts.tools.length - 8}` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'cron' && (
          <div className="space-y-3">
            {pendingApprovals.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-amber-200/80">
                  <ShieldAlert className="w-3 h-3" />
                  <span>Pending Approvals ({pendingApprovals.length})</span>
                </div>
                {pendingApprovals.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-lg border border-amber-400/25 bg-amber-500/[0.05] p-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-white truncate">{card.title}</span>
                      <span className="font-mono text-[10px] text-amber-200/80 shrink-0">
                        #{card.channelId}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {onApproveCard && (
                        <>
                          <button
                            type="button"
                            onClick={() => onApproveCard(card.id, 'once')}
                            className="ui-accent-btn h-7 px-2.5 rounded-md font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Once</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onApproveCard(card.id, 'always')}
                            className="h-7 px-2.5 rounded-md border border-white/14 bg-white/[0.05] text-zinc-200 text-[11px] font-medium cursor-pointer"
                          >
                            Always
                          </button>
                        </>
                      )}
                      {onRejectCard && (
                        <button
                          type="button"
                          onClick={() => onRejectCard(card.id)}
                          className="h-7 px-2.5 rounded-md border border-rose-400/30 bg-rose-500/12 text-rose-200 text-[11px] cursor-pointer"
                        >
                          Deny
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10.5px] text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  <span>Scheduled Jobs (/api/jobs)</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenOperations();
                  }}
                  className="text-[var(--ui-accent-soft)] hover:text-white underline underline-offset-4 cursor-pointer"
                >
                  Manage in Ops
                </button>
              </div>
              {cronJobs.length === 0 ? (
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 font-mono text-xs text-zinc-400 flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isConnected
                      ? 'No scheduled jobs on gateway.'
                      : 'Connect gateway to view & trigger /api/jobs.'}
                  </span>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.08] bg-white/[0.02]">
                  {cronJobs.map((job) => {
                    const isPaused = job.paused || job.status === 'paused';
                    const busy = jobBusyId === job.id;
                    return (
                      <div
                        key={job.id}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[10.5px] text-[var(--ui-accent-soft)]">
                            {job.schedule} · {job.status || (isPaused ? 'paused' : 'active')}
                          </div>
                          <p className="text-zinc-200 truncate mt-0.5">{job.summary}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {onRunJob && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleJobAction(job.id, onRunJob)}
                              className="px-2 py-1 rounded border border-white/10 bg-white/[0.04] font-mono text-[10.5px] text-zinc-200 hover:text-white cursor-pointer"
                            >
                              Run
                            </button>
                          )}
                          {isPaused
                            ? onResumeJob && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  aria-label={`Resume ${job.id}`}
                                  onClick={() => void handleJobAction(job.id, onResumeJob)}
                                  className="p-1.5 rounded border border-white/10 bg-white/[0.04] text-zinc-200 hover:text-white cursor-pointer"
                                >
                                  <Play className="w-3 h-3" />
                                </button>
                              )
                            : onPauseJob && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  aria-label={`Pause ${job.id}`}
                                  onClick={() => void handleJobAction(job.id, onPauseJob)}
                                  className="p-1.5 rounded border border-white/10 bg-white/[0.04] text-amber-200 hover:text-white cursor-pointer"
                                >
                                  <Pause className="w-3 h-3" />
                                </button>
                              )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
