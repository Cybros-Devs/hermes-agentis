import { useState } from 'react';
import { Check, X, Play, Pause, Hash, CheckCircle2 } from 'lucide-react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
  HermesGatewayStatus,
} from '../types/hermes';
import {
  INITIAL_HERMES_CRON,
  INITIAL_HERMES_MEMORY,
  INITIAL_HERMES_SKILLS,
} from '../utils/cliEngine';
import {
  formatElapsedDuration,
  getTaskStatusDisplay,
  resolveTaskStepBreakdown,
} from '../utils/taskInsights';
import { EmptyState, MorphTabs, StaggerItem, StatusPulse, type MorphTabItem } from './ui';

interface DuetOperationsPanelProps {
  channels: Channel[];
  activeChannel: ChannelId;
  onSelectChannel: (id: ChannelId) => void;
  approvals: ApprovalCard[];
  onApproveCard: (id: string, editedDraft: string) => void;
  onRejectCard: (id: string) => void;
  brief: BriefDecision[];
  onRunBriefCommand: (command: string, briefId: string) => void;
  tasks: BackgroundTask[];
  onToggleTaskStatus: (id: string) => void;
  gatewayStatus?: HermesGatewayStatus | null;
}

type OpsTab = 'approvals' | 'brief' | 'tasks' | 'runtime';

export function DuetOperationsPanel({
  channels,
  activeChannel,
  onSelectChannel,
  approvals,
  onApproveCard,
  onRejectCard,
  brief,
  onRunBriefCommand,
  tasks,
  onToggleTaskStatus,
  gatewayStatus,
}: DuetOperationsPanelProps) {
  const [activeTab, setActiveTab] = useState<OpsTab>('approvals');
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});

  const pendingApprovals = approvals.filter((a) => a.status === 'pending').length;
  const openBriefCount = brief.filter((b) => !b.resolved).length;
  const runningTasksCount = tasks.filter((t) => t.status === 'running').length;

  const opsTabs: MorphTabItem<OpsTab>[] = [
    { id: 'approvals', label: `MCP Gates (${pendingApprovals})` },
    { id: 'brief', label: `post_brief (${openBriefCount})` },
    { id: 'tasks', label: `Runs (${runningTasksCount})` },
    { id: 'runtime', label: 'Hermes Agent' },
  ];

  return (
    <section
      aria-label="Hermes Duet Operations"
      data-testid="duet-operations-panel"
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
                <span>{ch.name}</span>
              </button>
            );
          })}
        </div>
        <span className="font-mono text-[11px] text-emerald-100/45 whitespace-nowrap shrink-0">
          session: duet-{activeChannel}
        </span>
      </div>

      {/* Gliding Pill Tab Navigation */}
      <div className="p-2 border-b border-white/8 bg-black/15 overflow-x-auto cyber-scroll">
        <MorphTabs
          items={opsTabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Operations sections"
          variant="pill"
          fullWidth
        />
      </div>

      {/* Tab Content */}
      <div
        key={activeTab}
        className="ui-card-enter p-3 sm:p-3.5 space-y-2 lg:max-h-[min(56vh,520px)] overflow-y-auto cyber-scroll"
      >
        {activeTab === 'approvals' &&
          (approvals.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-4 h-4" />}
              title="All MCP gates clear"
              description="Tool authorization requests from your parallel Hermes sessions will appear here."
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
                  {typeof card.amountCents === 'number'
                    ? ` · Cap $${(card.amountCents / 100).toFixed(2)}`
                    : ''}
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
                        <span>Approve &amp; Resume Run</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectCard(card.id)}
                        className="min-h-[40px] px-4 rounded-lg bg-white/[0.05] text-emerald-50/80 border border-white/10 text-xs flex items-center justify-center gap-1.5 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>Not now</span>
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
          ))}

        {activeTab === 'tasks' &&
          (tasks.length === 0 ? (
            <EmptyState
              title="No active background runs"
              description="Subagent runs and cron jobs will stream progress here."
            />
          ) : (
            tasks.map((task, idx) => {
              const breakdown = resolveTaskStepBreakdown(task);
              const statusDisplay = getTaskStatusDisplay(task);
              const elapsed = formatElapsedDuration(
                task.createdAtMs,
                task.status === 'running' ? Date.now() : (task.updatedAtMs ?? Date.now())
              );
              return (
                <StaggerItem key={task.id} index={idx}>
                  <div className="rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition-colors p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-emerald-100/55 tabular-nums">
                          <StatusPulse state={statusDisplay.pulseState} size="sm" />
                          <span className={statusDisplay.tone === 'amber' ? 'text-amber-300 font-semibold' : 'text-[#6EE7B7]'}>
                            {statusDisplay.label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>#{task.channelId}</span>
                          <span aria-hidden="true">·</span>
                          <span>{breakdown.ratioLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span>up {elapsed}</span>
                        </div>
                        <h3 className="text-sm font-medium text-white mt-0.5">{task.title}</h3>
                      </div>
                      {task.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => onToggleTaskStatus(task.id)}
                          aria-label={
                            task.status === 'running'
                              ? `Pause ${task.title}`
                              : `Resume ${task.title}`
                          }
                          className="ui-tactile min-h-[36px] min-w-[36px] rounded-lg bg-black/30 border border-white/10 flex items-center justify-center text-emerald-50 hover:border-[#34D399]/50 hover:text-[#6EE7B7] cursor-pointer"
                        >
                          {task.status === 'running' ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-emerald-100/65">{breakdown.activeStepText}</p>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-black/45 overflow-hidden">
                        <div
                          className={`h-full w-full origin-left transition-transform duration-300 ease-out ${
                            task.status === 'completed'
                              ? 'bg-emerald-400'
                              : task.status === 'paused'
                              ? 'bg-emerald-100/35'
                              : 'bg-amber-400'
                          }`}
                          style={{ transform: `scaleX(${Math.max(0, Math.min(1, task.progress / 100))})` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] tabular-nums text-emerald-50/80">
                        {task.progress}%
                      </span>
                    </div>
                  </div>
                </StaggerItem>
              );
            })
          ))}

        {activeTab === 'runtime' && (
          <div className="space-y-3">
            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2 font-mono text-xs">
                <span className="text-white font-semibold">Hermes Agent Gateway</span>
                <span className={gatewayStatus?.connected ? 'text-[#4ADE80]' : 'text-[#6EE7B7]'}>
                  {gatewayStatus?.connected ? 'CONNECTED (:8642)' : 'STANDALONE DUET MODE'}
                </span>
              </div>
              <p className="text-xs text-emerald-100/65 leading-relaxed">
                Start <code className="font-mono text-[#6EE7B7]">hermes gateway</code> with{' '}
                <code className="font-mono text-[#6EE7B7]">API_SERVER_ENABLED=true</code> in{' '}
                <code className="font-mono text-white/80">~/.hermes/.env</code> and register{' '}
                <code className="font-mono text-[#6EE7B7]">mcp_servers.duet</code> in{' '}
                <code className="font-mono text-white/80">~/.hermes/config.yaml</code>.
              </p>
              <pre className="rounded-lg bg-black/40 border border-white/10 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-50/85 overflow-x-auto">
{`mcp_servers:
  duet:
    command: /usr/local/bin/bun
    args: ["/path/to/hermes-duet/server/mcp-shim.ts"]
    tools: {}`}
              </pre>
            </div>

            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 space-y-2">
              <h3 className="font-mono text-xs font-semibold text-white">
                Loaded Skills (~/.hermes/skills/)
              </h3>
              <div className="space-y-1.5">
                {INITIAL_HERMES_SKILLS.map((skill) => (
                  <div key={skill.name} className="text-xs border-b border-white/6 last:border-0 pb-1.5 last:pb-0">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#6EE7B7] font-semibold">{skill.name}</span>
                      <span className="text-emerald-100/45">{skill.source}</span>
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
                {INITIAL_HERMES_CRON.map((job) => (
                  <div key={job.id} className="flex items-start justify-between gap-2">
                    <span className="text-[#6EE7B7] shrink-0">{job.schedule}</span>
                    <span className="text-emerald-100/70 text-right">{job.summary}</span>
                  </div>
                ))}
                {INITIAL_HERMES_MEMORY.map((mem) => (
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
