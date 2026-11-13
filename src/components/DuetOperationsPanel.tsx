import { useState } from 'react';
import { Check, X, Play, Pause, Hash } from 'lucide-react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
} from '../types/hermes';

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
}

type OpsTab = 'approvals' | 'brief' | 'tasks';

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
}: DuetOperationsPanelProps) {
  const [activeTab, setActiveTab] = useState<OpsTab>('approvals');
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});

  const pendingApprovals = approvals.filter((a) => a.status === 'pending').length;
  const openBriefCount = brief.filter((b) => !b.resolved).length;
  const runningTasksCount = tasks.filter((t) => t.status === 'running').length;

  return (
    <section
      aria-label="Hermes Duet Operations"
      className="flex flex-col rounded-xl bg-[#0B1714]/80 border border-white/10 overflow-hidden"
    >
      {/* Channel Strip */}
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
                <span>{ch.id}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-2 border-b border-white/8 bg-black/15">
        <button
          type="button"
          onClick={() => setActiveTab('approvals')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'approvals'
              ? 'bg-[#34D399]/15 text-[#6EE7B7] border border-[#34D399]/35'
              : 'text-emerald-100/55 hover:text-white'
          }`}
        >
          Approvals ({pendingApprovals})
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
          Morning Brief ({openBriefCount})
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
          Tasks ({runningTasksCount})
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-3.5 space-y-2.5 max-h-[380px] overflow-y-auto cyber-scroll">
        {activeTab === 'approvals' &&
          approvals.map((card) => {
            const currentDraft = draftEdits[card.id] ?? card.draft;
            const isPending = card.status === 'pending';
            return (
              <div
                key={card.id}
                data-testid={`approval-card-${card.id}`}
                className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-100/55">
                      <span>{card.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>#{card.channelId}</span>
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
                        <span>Approve</span>
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
                    <span>#{task.channelId}</span>
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
                <div className="flex-1 h-1.5 rounded-full bg-black/40 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      task.status === 'completed'
                        ? 'bg-emerald-400'
                        : task.status === 'paused'
                        ? 'bg-emerald-100/35'
                        : 'bg-[#34D399]'
                    }`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] tabular-nums text-emerald-50/80">
                  {task.progress}%
                </span>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
