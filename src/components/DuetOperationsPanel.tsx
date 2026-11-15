import { useState } from 'react';
import { Check, X, Play, Pause, Hash } from 'lucide-react';
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

  return (
    <section
      aria-label="Hermes Duet Operations"
      data-testid="duet-operations-panel"
      className="flex flex-col rounded-xl bg-[#0B1714]/90 border border-white/12 overflow-hidden shadow-[0_12px_36px_rgba(0,0,0,0.35)]"
    >
      {/* Channel & Session Lane Strip */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/8 bg-black/20 overflow-x-auto">
        <div className="flex items-center gap-1.5">
          {channels.map((ch) => {
            const active = ch.id === activeChannel;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectChannel(ch.id)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-2 border-b border-white/8 bg-black/15 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('approvals')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'approvals'
              ? 'bg-[#34D399]/15 text-[#6EE7B7] border border-[#34D399]/35'
              : 'text-emerald-100/55 hover:text-white'
          }`}
        >
          MCP Gates ({pendingApprovals})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('brief')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'brief'
              ? 'bg-[#34D399]/15 text-[#6EE7B7] border border-[#34D399]/35'
              : 'text-emerald-100/55 hover:text-white'
          }`}
        >
          post_brief ({openBriefCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'tasks'
              ? 'bg-[#34D399]/15 text-[#6EE7B7] border border-[#34D399]/35'
              : 'text-emerald-100/55 hover:text-white'
          }`}
        >
          Runs ({runningTasksCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('runtime')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'runtime'
              ? 'bg-[#34D399]/15 text-[#6EE7B7] border border-[#34D399]/35'
              : 'text-emerald-100/55 hover:text-white'
          }`}
        >
          Hermes Agent
        </button>
      </div>

      {/* Tab Content */}
      <div
        key={activeTab}
        className="ui-card-enter p-3 sm:p-3.5 space-y-2 lg:max-h-[min(56vh,520px)] overflow-y-auto cyber-scroll"
      >
        {activeTab === 'approvals' &&
          approvals.map((card) => {
            const currentDraft = draftEdits[card.id] ?? card.draft;
            const isPending = card.status === 'pending';
            return (
              <div
                key={card.id}
                data-testid={`approval-card-${card.id}`}
                className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2"
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
                    className={`font-mono text-[11px] uppercase font-semibold ${
                      card.status === 'approved'
                        ? 'text-emerald-400'
                        : card.status === 'rejected'
                        ? 'text-rose-400'
                        : 'text-[#6EE7B7]'
                    }`}
                  >
                    {card.status}
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
            );
          })}

        {activeTab === 'brief' &&
          brief.map((item) => (
            <div
              key={item.id}
              className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 flex items-start justify-between gap-3"
            >
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
                className={`min-h-[38px] px-3 rounded-lg font-mono text-xs whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  item.resolved
                    ? 'bg-black/25 text-emerald-100/35 cursor-not-allowed'
                    : 'bg-black/30 text-[#6EE7B7] border border-[#34D399]/35 hover:bg-[#34D399] hover:text-[#05140E]'
                }`}
              >
                {item.resolved ? 'Done' : item.suggestedCommand}
              </button>
            </div>
          ))}

        {activeTab === 'tasks' &&
          tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-100/55">
                    <span>{task.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{task.sessionId ?? `duet-${task.channelId}`}</span>
                    <span aria-hidden="true">·</span>
                    <span>{task.updatedAt}</span>
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
                    className="min-h-[36px] min-w-[36px] rounded-lg bg-black/30 border border-white/10 flex items-center justify-center text-emerald-50 hover:border-[#34D399]/50 hover:text-[#6EE7B7] cursor-pointer"
                  >
                    {task.status === 'running' ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              <p className="text-xs text-emerald-100/60">{task.lastStep}</p>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-black/45 overflow-hidden">
                  <div
                    className={`h-full w-full origin-left transition-transform duration-300 ease-out ${
                      task.status === 'completed'
                        ? 'bg-emerald-400'
                        : task.status === 'paused'
                        ? 'bg-emerald-100/35'
                        : 'bg-[#34D399]'
                    }`}
                    style={{ transform: `scaleX(${Math.max(0, Math.min(1, task.progress / 100))})` }}
                  />
                </div>
                <span className="font-mono text-[11px] tabular-nums text-emerald-50/80">
                  {task.progress}%
                </span>
              </div>
            </div>
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
