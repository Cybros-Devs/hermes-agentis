import { Plus, MoreHorizontal } from 'lucide-react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
  ExpressionMood,
} from '../types/hermes';
import type { DitherStyle } from '../utils/asciiPortraitEngine';
import { AsciiPortraitCanvas } from './AsciiPortraitCanvas';

interface SidebarWorkspaceProps {
  channels: Channel[];
  activeChannel: ChannelId;
  onSelectChannel: (id: ChannelId) => void;
  approvals: ApprovalCard[];
  brief: BriefDecision[];
  tasks: BackgroundTask[];
  lastSpokenLine: string;
  mood: ExpressionMood;
  ditherStyle: DitherStyle;
  frequencyBands: number[];
  isSpeaking: boolean;
  isListening: boolean;
  selectedItemId: string | null;
  onSelectTask: (task: BackgroundTask) => void;
  onSelectApproval: (card: ApprovalCard) => void;
  onSelectBrief: (item: BriefDecision) => void;
  onNewTask: () => void;
  onCycleDitherStyle: () => void;
  onOpenQueue: () => void;
}

export function SidebarWorkspace({
  channels,
  activeChannel,
  onSelectChannel,
  approvals,
  brief,
  tasks,
  lastSpokenLine,
  mood,
  ditherStyle,
  frequencyBands,
  isSpeaking,
  isListening,
  selectedItemId,
  onSelectTask,
  onSelectApproval,
  onSelectBrief,
  onNewTask,
  onCycleDitherStyle,
  onOpenQueue,
}: SidebarWorkspaceProps) {
  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  return (
    <aside
      aria-label="Hermes Tasks and Lanes"
      className="flex flex-col h-full rounded-2xl bg-[#0A1613]/72 backdrop-blur-2xl border border-white/12 overflow-hidden select-none shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
    >
      {/* Window Chrome + New Task */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
          <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
          <span className="w-3 h-3 rounded-full bg-[#27C93F]" />
        </div>

        <button
          type="button"
          onClick={onNewTask}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-50/75 hover:text-white transition-colors cursor-pointer whitespace-nowrap px-2 py-1 rounded-md hover:bg-white/6"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New task</span>
        </button>
      </div>

      {/* Active Hermes Duet Frosted Card with Monochrome Halftone Thumbnail */}
      <div className="px-3">
        <button
          type="button"
          onClick={onOpenQueue}
          className="w-full text-left rounded-xl border border-white/20 bg-white/[0.06] hover:border-[#34D399]/60 p-2.5 flex items-center gap-3 transition-colors cursor-pointer"
        >
          <AsciiPortraitCanvas
            variant="thumb"
            mood={mood}
            viseme="closed"
            eyeState="open"
            energy={0.1}
            isSpeaking={false}
            isListening={false}
            ditherStyle={ditherStyle}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-semibold text-white truncate">Hermes Duet</span>
              <span className="font-mono text-[11px] text-[#6EE7B7] tabular-nums shrink-0">
                {pendingApprovals.length > 0 ? `${pendingApprovals.length} open` : `#${activeChannel}`}
              </span>
            </div>
            <p className="text-xs text-emerald-100/55 truncate mt-0.5">{lastSpokenLine}</p>
          </div>
        </button>
      </div>

      {/* Scrollable Queue matching reference minimal list rhythm */}
      <div className="flex-1 overflow-y-auto cyber-scroll px-3 py-4 space-y-4">
        <div className="space-y-3">
          {pendingApprovals.map((card) => {
            const active = selectedItemId === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelectApproval(card)}
                className={`w-full text-left flex items-start gap-2.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  active ? 'bg-white/10' : 'hover:bg-white/6'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="text-xs leading-5 text-white shrink-0 mt-0.5"
                >
                  ●
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-white truncate">
                      {card.title}
                    </span>
                    <span className="font-mono text-[11px] text-emerald-100/45 tabular-nums shrink-0">
                      {card.createdAt}
                    </span>
                  </div>
                  <div className="text-xs text-emerald-100/50 truncate mt-0.5">
                    Approval · {card.destination}
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
                className={`w-full text-left flex items-start gap-2.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  active ? 'bg-white/10' : 'hover:bg-white/6'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`text-sm leading-5 shrink-0 mt-0.5 ${
                    isRunning ? 'text-[#6EE7B7]' : 'text-emerald-100/45'
                  }`}
                >
                  {isRunning ? '❖' : '○'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-emerald-50/90 truncate">
                      {task.title}
                    </span>
                    <span className="font-mono text-[11px] text-emerald-100/45 tabular-nums shrink-0">
                      {task.progress}%
                    </span>
                  </div>
                  <div className="text-xs text-emerald-100/45 truncate mt-0.5">
                    #{task.channelId} · {task.lastStep}
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
                  className={`w-full text-left flex items-start gap-2.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    active ? 'bg-white/10' : 'hover:bg-white/6'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="text-sm leading-5 text-emerald-100/45 shrink-0 mt-0.5"
                  >
                    ○
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-emerald-50/80 truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-emerald-100/45 truncate mt-0.5">
                      Brief · {item.priority} priority
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* Bottom Lane Switcher & Brand Footer matching reference */}
      <div className="px-4 pt-2.5 pb-3.5 border-t border-white/8 space-y-2.5">
        <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
          <div className="flex items-center gap-2.5 overflow-x-auto">
            {channels.map((ch) => {
              const active = ch.id === activeChannel;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onSelectChannel(ch.id)}
                  className={`transition-colors cursor-pointer whitespace-nowrap ${
                    active ? 'text-[#4ADE80] font-semibold' : 'text-emerald-100/45 hover:text-white'
                  }`}
                >
                  #{ch.id}
                </button>
              );
            })}
          </div>
          <span className="tabular-nums text-emerald-100/45 shrink-0">
            {pendingApprovals.length} open
          </span>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-bold tracking-tight text-white">
              &gt;hermes
            </span>
            <div className="flex items-end gap-0.5 h-3" aria-hidden="true">
              {frequencyBands.slice(0, 7).map((band, idx) => {
                const active = isSpeaking || isListening;
                const h = active ? Math.max(25, Math.round(band * 100)) : 32 + (idx % 3) * 18;
                return (
                  <span
                    key={idx}
                    className={`w-1 rounded-[1px] transition-all duration-75 ${
                      active ? 'bg-[#4ADE80]' : 'bg-emerald-100/30'
                    }`}
                    style={{ height: `${h}%` }}
                  />
                );
              })}
            </div>
            <span className="font-mono text-[11px] text-emerald-100/50">{ditherStyle}</span>
          </div>

          <button
            type="button"
            onClick={onCycleDitherStyle}
            aria-label="Cycle halftone ASCII dither style"
            title="Cycle halftone dither style (Braille / Floyd / Bayer)"
            className="p-1.5 rounded-md text-emerald-100/60 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
