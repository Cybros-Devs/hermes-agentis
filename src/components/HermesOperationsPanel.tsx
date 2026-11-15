import { useState } from 'react';
import { Check, X, Hash, CheckCircle2, RefreshCw } from 'lucide-react';
import type {
  ApprovalCard,
  BriefDecision,
  Channel,
  ChannelId,
  HermesCronJob,
  HermesGatewayStatus,
  HermesMemoryItem,
  HermesSkill,
} from '../types/hermes';
import {
  INITIAL_HERMES_CRON,
  INITIAL_HERMES_MEMORY,
  INITIAL_HERMES_SKILLS,
} from '../utils/cliEngine';
import { EmptyState, MorphTabs, StaggerItem, StatusPulse, type MorphTabItem } from './ui';

interface HermesOperationsPanelProps {
  channels: Channel[];
  activeChannel: ChannelId;
  onSelectChannel: (id: ChannelId) => void;
  approvals: ApprovalCard[];
  onApproveCard: (id: string, editedDraft: string) => void;
  onRejectCard: (id: string) => void;
  brief: BriefDecision[];
  onRunBriefCommand: (command: string, briefId: string) => void;
  gatewayStatus?: HermesGatewayStatus | null;
  onRefreshGateway?: () => void;
  skills?: HermesSkill[];
  memory?: HermesMemoryItem[];
  cronJobs?: HermesCronJob[];
}

type OpsTab = 'runtime' | 'approvals' | 'brief';

export function HermesOperationsPanel({
  channels,
  activeChannel,
  onSelectChannel,
  approvals,
  onApproveCard,
  onRejectCard,
  brief,
  onRunBriefCommand,
  gatewayStatus,
  onRefreshGateway,
  skills = INITIAL_HERMES_SKILLS,
  memory = INITIAL_HERMES_MEMORY,
  cronJobs = INITIAL_HERMES_CRON,
}: HermesOperationsPanelProps) {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending').length;
  const openBriefCount = brief.filter((b) => !b.resolved).length;

  const [activeTab, setActiveTab] = useState<OpsTab>(pendingApprovals > 0 ? 'approvals' : 'runtime');
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const opsTabs: MorphTabItem<OpsTab>[] = [
    { id: 'runtime', label: 'Hermes Gateway' },
    { id: 'approvals', label: `Actions (${pendingApprovals})` },
    { id: 'brief', label: `Brief (${openBriefCount})` },
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

  return (
    <section
      aria-label="Hermes Agent Operations"
      data-testid="hermes-operations-panel"
      className="flex flex-col rounded-xl bg-[#0B1714]/90 border border-white/12 overflow-hidden shadow-[0_12px_36px_rgba(0,0,0,0.35)]"
    >
      {/* Channel & Session Lane Strip */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/8 bg-black/20 overflow-x-auto cyber-scroll">
        <div className="flex items-center gap-1.5">
          {channels.map((ch) => {
            const active = ch.id === activeChannel;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectChannel(ch.id)}
                className={`ui-tactile px-3 py-1.5 rounded-lg font-mono text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#34D399] text-[#05140E] font-semibold'
                    : 'bg-white/[0.05] text-emerald-50/75 hover:text-white border border-white/10'
                }`}
              >
                <Hash className="w-3 h-3" />
                <span>{ch.name.replace(/^#/, '')}</span>
              </button>
            );
          })}
        </div>
        <span className="font-mono text-[11px] text-emerald-100/50 whitespace-nowrap shrink-0">
          key: hermes-{activeChannel}
        </span>
      </div>

      {/* Gliding Pill Tab Navigation */}
      <div className="p-2 border-b border-white/8 bg-black/15 overflow-x-auto cyber-scroll">
        <MorphTabs
          items={opsTabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Hermes Agent sections"
          variant="pill"
          fullWidth
        />
      </div>

      {/* Tab Content */}
      <div
        key={activeTab}
        className="ui-card-enter p-3 sm:p-3.5 space-y-2.5 lg:max-h-[min(56vh,520px)] overflow-y-auto cyber-scroll"
      >
        {activeTab === 'approvals' &&
          (approvals.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-4 h-4" />}
              title="All action gates clear"
              description="Pending outbound tool confirmations from your Hermes Agent sessions will appear here."
            />
          ) : (
            approvals.map((card, idx) => {
              const currentDraft = draftEdits[card.id] ?? card.draft;
              const isPending = card.status === 'pending';
              return (
                <StaggerItem key={card.id} index={idx}>
                  <div
                    data-testid={`approval-card-${card.id}`}
                    className="rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition-colors p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-emerald-100/55">
                          <span>{card.id}</span>
                          <span aria-hidden="true">·</span>
                          <span>#{card.channelId}</span>
                          {card.mcpTool && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#6EE7B7]/85">{card.mcpTool}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{card.createdAt}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-white mt-0.5">{card.title}</h3>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase font-semibold ${
                          card.status === 'approved'
                            ? 'text-emerald-400'
                            : card.status === 'rejected'
                            ? 'text-rose-400'
                            : 'text-[#6EE7B7]'
                        }`}
                      >
                        {isPending && <StatusPulse state="live" size="sm" />}
                        <span>{card.status}</span>
                      </span>
                    </div>

                    <p className="text-xs text-emerald-50/80">{card.summary}</p>
                    <p className="font-mono text-[11px] text-[#6EE7B7] truncate">
                      Target: {card.destination}
                    </p>

                    {isPending ? (
                      <>
                        <label htmlFor={`draft-${card.id}`} className="sr-only">
                          Editable draft for {card.title}
                        </label>
                        <textarea
                          id={`draft-${card.id}`}
                          rows={2}
                          value={currentDraft}
                          onChange={(e) =>
                            setDraftEdits((prev) => ({ ...prev, [card.id]: e.target.value }))
                          }
                          className="w-full rounded-lg bg-black/35 border border-white/12 p-2 font-mono text-xs text-emerald-50 focus:outline-none focus:border-[#34D399]/60"
                        />
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onApproveCard(card.id, currentDraft)}
                            className="flex-1 min-h-[40px] rounded-lg bg-[#34D399] text-[#05140E] font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#6EE7B7] transition-colors cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                            <span>Approve &amp; Dispatch</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRejectCard(card.id)}
                            className="min-h-[40px] px-4 rounded-lg bg-white/[0.05] text-emerald-50/80 border border-white/10 text-xs flex items-center justify-center gap-1.5 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                            <span>Hold</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="font-mono text-xs text-emerald-100/55">
                        Draft: &ldquo;{currentDraft}&rdquo;
                      </p>
                    )}
                  </div>
                </StaggerItem>
              );
            })
          ))}

        {activeTab === 'brief' &&
          (brief.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-4 h-4" />}
              title="Morning brief clear"
              description="Open decisions from scheduled Hermes Agent briefs will appear here."
            />
          ) : (
            brief.map((item, idx) => (
              <StaggerItem key={item.id} index={idx}>
                <div className="rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition-colors p-3.5 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-100/55">
                      <span
                        className={
                          item.priority === 'high'
                            ? 'text-rose-400 font-semibold'
                            : item.priority === 'medium'
                            ? 'text-[#6EE7B7] font-semibold'
                            : 'text-emerald-100/50'
                        }
                      >
                        {item.priority.toUpperCase()}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.resolved ? 'Resolved' : 'Pending'}</span>
                    </div>
                    <h3 className="text-sm font-medium text-white">{item.title}</h3>
                    <p className="text-xs text-emerald-100/60">{item.detail}</p>
                  </div>

                  <button
                    type="button"
                    disabled={item.resolved}
                    onClick={() => onRunBriefCommand(item.suggestedCommand, item.id)}
                    className={`ui-tactile min-h-[38px] px-3 rounded-lg font-mono text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                      item.resolved
                        ? 'bg-black/25 text-emerald-100/35 cursor-not-allowed'
                        : 'bg-black/30 text-[#6EE7B7] border border-[#34D399]/35 hover:bg-[#34D399] hover:text-[#05140E]'
                    }`}
                  >
                    {item.resolved ? 'Done' : item.suggestedCommand}
                  </button>
                </div>
              </StaggerItem>
            ))
          ))}

        {activeTab === 'runtime' && (
          <div className="space-y-3">
            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <StatusPulse state={gatewayStatus?.connected ? 'live' : 'idle'} size="sm" />
                  <span className="text-white font-semibold">Hermes Agent API Server</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={gatewayStatus?.connected ? 'text-[#4ADE80]' : 'text-[#6EE7B7]'}>
                    {gatewayStatus?.connected ? 'CONNECTED' : 'LOCAL STANDBY'}
                  </span>
                  {onRefreshGateway && (
                    <button
                      type="button"
                      onClick={() => void handleRefresh()}
                      aria-label="Probe Hermes Gateway"
                      title="Probe Hermes Gateway"
                      className="ui-tactile w-6 h-6 rounded-md bg-white/[0.06] border border-white/10 text-emerald-100/75 hover:text-white flex items-center justify-center cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${refreshing ? 'motion-safe:animate-spin motion-safe-only' : ''}`}
                      />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] bg-black/30 border border-white/8 rounded-lg p-2.5">
                <div>
                  <span className="text-emerald-100/45">Endpoint: </span>
                  <span className="text-emerald-50/90">
                    {gatewayStatus?.gatewayUrl || 'http://127.0.0.1:8642'}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-100/45">Model: </span>
                  <span className="text-[#6EE7B7]">{gatewayStatus?.activeModel || 'hermes-agent'}</span>
                </div>
                <div>
                  <span className="text-emerald-100/45">Session Header: </span>
                  <span className="text-emerald-50/90">X-Hermes-Session-Key</span>
                </div>
                <div>
                  <span className="text-emerald-100/45">Stream Events: </span>
                  <span className="text-emerald-50/90">SSE + hermes.tool.progress</span>
                </div>
              </div>

              <p className="text-xs text-emerald-100/65 leading-relaxed">
                Enable the native API Server in{' '}
                <code className="font-mono text-white/85">~/.hermes/.env</code> and run{' '}
                <code className="font-mono text-[#6EE7B7]">hermes gateway</code>. Every session
                binds directly via{' '}
                <code className="font-mono text-[#6EE7B7]">/v1/chat/completions</code> with live
                tool-progress streaming.
              </p>
              <pre className="rounded-lg bg-black/40 border border-white/10 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-50/85 overflow-x-auto">
{`# ~/.hermes/.env
API_SERVER_ENABLED=true
API_SERVER_KEY=change-me-local-dev

# Start native Hermes Agent gateway
hermes gateway`}
              </pre>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-xs font-semibold text-white">
                  Loaded Skills (~/.hermes/skills/)
                </h3>
                <span className="font-mono text-[10px] text-emerald-100/50">
                  {skills.length} active
                </span>
              </div>
              <div className="space-y-1.5">
                {skills.map((skill) => (
                  <div
                    key={skill.name}
                    className="text-xs border-b border-white/6 last:border-0 pb-1.5 last:pb-0"
                  >
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#6EE7B7] font-semibold">{skill.name}</span>
                      <span className="text-emerald-100/45 truncate max-w-[55%]">
                        {skill.source}
                      </span>
                    </div>
                    <p className="text-emerald-100/65 mt-0.5">{skill.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 space-y-2">
              <h3 className="font-mono text-xs font-semibold text-white">
                Cron Routines (cronjob_manage) &amp; MEMORY.md
              </h3>
              <div className="space-y-1.5 font-mono text-[11px] text-emerald-50/80">
                {cronJobs.map((job) => (
                  <div key={job.id} className="flex items-start justify-between gap-2">
                    <span className="text-[#6EE7B7] shrink-0">{job.schedule}</span>
                    <span className="text-emerald-100/70 text-right">{job.summary}</span>
                  </div>
                ))}
                {memory.map((mem) => (
                  <div key={mem.key} className="pt-1 border-t border-white/6 text-emerald-100/60">
                    <span className="text-white/80">{mem.key}:</span> {mem.value}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
