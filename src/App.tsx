import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Shapes, Layers, ListTodo, Terminal as TerminalIcon } from 'lucide-react';
import { SidebarWorkspace } from './components/SidebarWorkspace';
import { VoiceWorkspacePane, type WorkspacePanelView } from './components/VoiceWorkspacePane';
import { useDuet, duetItemToEntry } from './hooks/useDuet';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  ChannelId,
  ExpressionMood,
  HermesGatewayStatus,
  TerminalEntry,
} from './types/hermes';
import type { BrailleShapeKind, BrailleShapeTint } from './utils/brailleShapesEngine';
import {
  autoArrangeSessions,
  createHermesSessionId,
  createSeedCanvasSessions,
  findOpenCanvasSpot,
  normalizeCanvasSessions,
  slugifySessionName,
  type CanvasSession,
} from './utils/canvasSessions';
import { INITIAL_CHANNELS, executeCliInput } from './utils/cliEngine';

const MOOD_CYCLE: ExpressionMood[] = ['neutral', 'happy', 'focused', 'thinking', 'alert'];

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildLocalFallbackReply(
  prompt: string,
  approvals: ApprovalCard[],
  tasks: BackgroundTask[],
  brief: BriefDecision[]
): { reply: string; mood: ExpressionMood } {
  const lower = prompt.toLowerCase();
  if (lower.includes('brief')) {
    const open = brief.filter((b) => !b.resolved);
    return {
      reply: `Your morning brief has ${open.length} open items. Top priority: ${
        open[0]?.title ?? 'all items resolved'
      }.`,
      mood: 'focused',
    };
  }
  if (lower.includes('task') || lower.includes('status')) {
    const running = tasks.filter((t) => t.status === 'running').length;
    return {
      reply: `Currently tracking ${tasks.length} background lanes, with ${running} actively running and zero faults.`,
      mood: 'focused',
    };
  }
  if (lower.includes('approve')) {
    const nextPending = approvals.find((a) => a.status === 'pending');
    if (nextPending) {
      return {
        reply: `${nextPending.title} is queued for your sign-off. Run /approve ${nextPending.id} or tap Approve to dispatch.`,
        mood: 'happy',
      };
    }
    return {
      reply: 'All approval gates in this lane are currently clear.',
      mood: 'happy',
    };
  }
  return {
    reply: `Hermes link active. Received: "${prompt}". Use /brief, /tasks, or /approve to drive your Duet lanes.`,
    mood: 'happy',
  };
}

const CANVAS_STORAGE_KEY = 'duet.canvasSessions.v1';

type MobileTab = 'home' | 'canvas' | 'voice' | 'tasks' | 'queue' | 'cli';

export default function App() {
  const [activeChannel, setActiveChannel] = useState<ChannelId>('general');
  const [approvals, setApprovals] = useState<ApprovalCard[]>([]);
  const [brief, setBrief] = useState<BriefDecision[]>([]);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [canvasSessions, setCanvasSessions] = useState<CanvasSession[]>(() => {
    try {
      const raw = localStorage.getItem(CANVAS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CanvasSession>[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = normalizeCanvasSessions(parsed);
          if (normalized.length > 0) return normalized;
        }
      }
    } catch {
      // fall back to seeded sessions
    }
    return createSeedCanvasSessions(INITIAL_CHANNELS);
  });
  const [mood, setMood] = useState<ExpressionMood>('happy');
  const [panelView, setPanelView] = useState<WorkspacePanelView>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.search.includes('view=canvas')) return 'canvas';
      if (window.location.search.includes('autostart=1')) return 'voice';
    }
    return 'home';
  });
  const [mobileTab, setMobileTab] = useState<MobileTab>(() =>
    typeof window !== 'undefined' && window.location.search.includes('view=canvas')
      ? 'canvas'
      : 'home'
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [animateSpeechLine, setAnimateSpeechLine] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<HermesGatewayStatus | null>(null);

  const [thinkingByChannel, setThinkingByChannel] = useState<Record<string, boolean>>({});
  const [speakingChannel, setSpeakingChannel] = useState<ChannelId | null>(null);
  const [lastSpokenByChannel, setLastSpokenByChannel] = useState<Record<string, string>>({});
  const [lastSpokenLine, setLastSpokenLineState] = useState<string>(
    'Linking to Hermes Duet…'
  );

  const [entries, setEntries] = useState<TerminalEntry[]>([]);

  const stateRef = useRef({
    activeChannel,
    approvals,
    tasks,
    brief,
    entries,
    canvasSessions,
  });
  stateRef.current = { activeChannel, approvals, tasks, brief, entries, canvasSessions };

  const chatAbortRef = useRef<AbortController | null>(null);

  const voiceRef = useRef<{
    isMuted: boolean;
    speakText: (text: string, mood: ExpressionMood) => Promise<void>;
    setThinking: (thinking: boolean) => void;
    toggleMute: () => void;
    stopSpeaking: () => void;
  } | null>(null);

  const updateSpokenLine = useCallback((line: string, channelId?: ChannelId) => {
    const ch = channelId ?? stateRef.current.activeChannel;
    setAnimateSpeechLine(true);
    setLastSpokenByChannel((prev) => ({ ...prev, [ch]: line }));
    if (ch === stateRef.current.activeChannel) {
      setLastSpokenLineState(line);
    }
  }, []);

  const upsertEntry = useCallback((entry: TerminalEntry) => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === entry.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = entry;
        return next;
      }
      if (entry.createdAtMs !== undefined) {
        const next = [...prev, entry];
        next.sort((a, b) => (a.createdAtMs ?? Infinity) - (b.createdAtMs ?? Infinity));
        return next;
      }
      return [...prev, entry];
    });
  }, []);

  const patchEntryText = useCallback((id: string, text: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
  }, []);

  const appendEntry = useCallback(
    (entry: Omit<TerminalEntry, 'id' | 'timestamp'>) => {
      setEntries((prev) => [
        ...prev,
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: nowTime(),
        },
      ]);
    },
    []
  );

  const setChannelThinking = useCallback((channelId: ChannelId, isThinking: boolean) => {
    setThinkingByChannel((prev) => {
      if (Boolean(prev[channelId]) === isThinking) return prev;
      return { ...prev, [channelId]: isThinking };
    });
    if (channelId === stateRef.current.activeChannel) {
      voiceRef.current?.setThinking(isThinking);
    }
  }, []);

  // The real engine: live Duet state, runs, approvals, and SSE updates.
  const duet = useDuet({
    upsertEntry,
    patchEntryText,
    onAssistantComplete: (text, channelId) => {
      setChannelThinking(channelId, false);
      updateSpokenLine(text, channelId);
      if (channelId === stateRef.current.activeChannel) {
        setMood('happy');
        setSpeakingChannel(channelId);
        void voiceRef.current?.speakText(text, 'happy');
      }
    },
    onSessionReset: (channelId) => {
      setChannelThinking(channelId, false);
      setEntries((prev) => prev.filter((e) => e.channelId !== channelId));
    },
  });
  const {
    connected: duetConnected,
    sendMessage: duetSendMessage,
    createHermesSession,
    resetHermesSession,
    deleteHermesSession,
    actOnCard: duetActOnCard,
  } = duet;

  // Persist Braille Canvas sessions locally
  useEffect(() => {
    try {
      localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(canvasSessions));
    } catch {
      // ignore storage quota errors
    }
  }, [canvasSessions]);

  // Sync any local custom canvas sessions to the server hermes-agent registry on link
  const syncedSessionsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!duetConnected) return;
    for (const cs of canvasSessions) {
      if (syncedSessionsRef.current.has(cs.channelId)) continue;
      syncedSessionsRef.current.add(cs.channelId);
      if (!duet.sessions.some((s) => s.channelId === cs.channelId)) {
        void createHermesSession({
          channelId: cs.channelId,
          name: cs.name,
          sessionId: cs.hermesSessionId,
          topic: cs.topic,
          persona: cs.agentPersona,
        }).catch(() => {});
      }
    }
  }, [duetConnected, canvasSessions, duet.sessions, createHermesSession]);

  // Mirror Duet state locally + merge custom canvas sessions so new Braille sessions act as real lanes.
  useEffect(() => {
    const baseChannels = duet.channels.length > 0 ? duet.channels : INITIAL_CHANNELS;
    const merged: Channel[] = [...baseChannels];
    for (const cs of canvasSessions) {
      if (!merged.some((c) => c.id === cs.channelId)) {
        merged.push({
          id: cs.channelId,
          name: cs.name,
          sessionId: cs.hermesSessionId,
          description: cs.topic,
          persona: cs.agentPersona,
          unreadCount: 0,
        });
      }
    }
    setChannels(merged);
    if (merged.length > 0) {
      setActiveChannel((prev) => (merged.some((c) => c.id === prev) ? prev : merged[0].id));
    }
  }, [duet.channels, canvasSessions]);
  useEffect(() => setApprovals(duet.approvals), [duet.approvals]);
  useEffect(() => setTasks(duet.tasks), [duet.tasks]);
  useEffect(() => setBrief(duet.brief), [duet.brief]);

  useEffect(() => {
    if (!duetConnected) return;
    upsertEntry({
      id: 'duet-link',
      channelId: 'general',
      role: 'system',
      source: 'ui',
      text: 'HERMES DUET LINK ACTIVE // isolated hermes-agent sessions & approval gates wired.',
      timestamp: nowTime(),
    });
  }, [duetConnected, upsertEntry]);

  useEffect(() => {
    const scopedLatest = [...entries]
      .reverse()
      .find((e) => e.channelId === activeChannel && e.role === 'hermes' && e.text.trim().length > 0);
    const cached = lastSpokenByChannel[activeChannel];
    if (cached) {
      setLastSpokenLineState(cached);
    } else if (scopedLatest) {
      setLastSpokenLineState(scopedLatest.text.slice(0, 140));
    } else {
      const cs = canvasSessions.find((s) => s.channelId === activeChannel);
      if (cs) {
        setLastSpokenLineState(`${cs.hermesSessionId} ready · ${cs.topic}`);
      }
    }
  }, [activeChannel, entries, lastSpokenByChannel, canvasSessions]);

  const [showThinking, setShowThinking] = useState<boolean>(() => {
    try {
      return localStorage.getItem('duet.showThinking') !== '0';
    } catch {
      return true;
    }
  });
  const handleToggleThinking = useCallback(() => {
    setShowThinking((v) => {
      try {
        localStorage.setItem('duet.showThinking', v ? '0' : '1');
      } catch {
        // ignore
      }
      return !v;
    });
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/hermes/gateway')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: HermesGatewayStatus | null) => {
        if (active && data) setGatewayStatus(data);
      })
      .catch(() => {
        // Standalone fallback remains active cleanly
      });
    return () => {
      active = false;
    };
  }, []);

  const handleApproveCard = useCallback(
    (id: string, editedDraft?: string) => {
      let approvedTitle = '';
      setApprovals((prev) =>
        prev.map((c) => {
          if (c.id === id) {
            approvedTitle = c.title;
            return {
              ...c,
              status: 'approved',
              draft: editedDraft ?? c.draft,
            };
          }
          return c;
        })
      );
      setBrief((prev) =>
        prev.map((b) =>
          b.suggestedCommand.includes(id) ? { ...b, resolved: true } : b
        )
      );
      if (approvedTitle) {
        void duetActOnCard(id, 'approve', editedDraft).catch(() => {});

        const msg = `Approved ${approvedTitle}. Resuming Hermes run with updated payload.`;
        setMood('happy');
        updateSpokenLine(msg);
        appendEntry({
          channelId: stateRef.current.activeChannel,
          role: 'hermes',
          source: 'ui',
          mood: 'happy',
          text: msg,
        });
        voiceRef.current?.speakText(msg, 'happy');
      }
    },
    [appendEntry, updateSpokenLine, duetActOnCard]
  );

  const handleRejectCard = useCallback(
    (id: string) => {
      let rejectedTitle = '';
      setApprovals((prev) =>
        prev.map((c) => {
          if (c.id === id) {
            rejectedTitle = c.title;
            return { ...c, status: 'rejected' };
          }
          return c;
        })
      );
      if (rejectedTitle) {
        void duetActOnCard(id, 'decline').catch(() => {});

        const msg = `Held ${rejectedTitle}. No outbound MCP action was sent.`;
        setMood('neutral');
        updateSpokenLine(msg);
        appendEntry({
          channelId: stateRef.current.activeChannel,
          role: 'hermes',
          source: 'ui',
          mood: 'neutral',
          text: msg,
        });
        voiceRef.current?.speakText(msg, 'neutral');
      }
    },
    [appendEntry, updateSpokenLine, duetActOnCard]
  );

  const processUserInput = useCallback(
    async (rawText: string, source: 'voice' | 'cli') => {
      const trimmed = rawText.trim();
      if (!trimmed) return;

      const { activeChannel: ch, approvals: appList, tasks: taskList, brief: briefList } =
        stateRef.current;

      const isCommandInput = trimmed.startsWith('/');
      if (!isCommandInput && duetConnected) {
        // No local echo on the Duet path: the real item (POST response or SSE)
        // is the single display copy, so transcript order stays chronological.
      } else {
        appendEntry({
          channelId: ch,
          role: isCommandInput ? 'command' : 'user',
          source,
          text: trimmed,
        });
      }

      const result = executeCliInput(trimmed, {
        activeChannel: ch,
        approvals: appList,
        tasks: taskList,
        brief: briefList,
        isMuted: voiceRef.current?.isMuted ?? false,
        gatewayConnected: gatewayStatus?.connected,
        gatewayUrl: gatewayStatus?.gatewayUrl,
      });

      if (result.type === 'handled') {
        if (result.clearTerminal) {
          setEntries([]);
          setMood('neutral');
          return;
        }
        if (result.switchChannel) {
          setActiveChannel(result.switchChannel);
        }
        if (result.approveCardId) {
          handleApproveCard(result.approveCardId);
          return;
        }
        if (result.rejectCardId) {
          handleRejectCard(result.rejectCardId);
          return;
        }
        if (result.toggleMute) {
          voiceRef.current?.toggleMute();
        }
        if (result.setMood) {
          setMood(result.setMood);
        } else {
          setMood(result.mood);
        }

        appendEntry({
          channelId: result.switchChannel ?? ch,
          role: 'system',
          source: 'cli',
          text: result.output,
        });

        if (result.spokenText) {
          updateSpokenLine(result.spokenText);
          appendEntry({
            channelId: result.switchChannel ?? ch,
            role: 'hermes',
            source: 'cli',
            mood: result.mood,
            text: result.spokenText,
          });
          voiceRef.current?.speakText(result.spokenText, result.mood);
        } else {
          updateSpokenLine(result.output);
        }
        return;
      }

      // Natural language prompt -> real Hermes Duet run inside this shape's isolated session.
      const activeShape = stateRef.current.canvasSessions.find((s) => s.channelId === ch);
      const activeHermesSessionId = activeShape?.hermesSessionId ?? createHermesSessionId(ch);
      const activePersona = activeShape?.agentPersona;

      setChannelThinking(ch, true);
      setMood('thinking');

      if (duetConnected) {
        try {
          const { item } = await duetSendMessage(result.prompt, ch, {
            sessionId: activeHermesSessionId,
            persona: activePersona,
          });
          if (item) {
            const entry = duetItemToEntry(item);
            if (entry) upsertEntry(entry);
          }
          return;
        } catch {
          // Duet bridge hiccup: echo late, then fall through to the offline path.
          appendEntry({
            channelId: ch,
            role: 'user',
            source,
            text: result.prompt,
          });
        }
      }

      // Offline fallback: direct gateway chat with a 6s timeout guard, strictly isolated by channelId.
      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 6000);

      setChannelThinking(ch, true);
      setMood('thinking');

      try {
        const res = await fetch('/api/hermes/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: result.prompt,
            channelId: ch,
            sessionId: activeHermesSessionId,
            persona: activePersona,
            history: stateRef.current.entries
              .filter(
                (e) =>
                  e.channelId === ch && (e.role === 'user' || e.role === 'hermes')
              )
              .slice(-6)
              .map((e) => ({ role: e.role, text: e.text })),
            pendingApprovals: appList
              .filter((a) => a.status === 'pending')
              .map((a) => ({ id: a.id, title: a.title, destination: a.destination, mcpTool: a.mcpTool })),
            tasks: taskList
              .filter((t) => t.channelId === ch)
              .map((t) => ({ id: t.id, title: t.title, status: t.status, progress: t.progress })),
          }),
        });

        window.clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          reply?: string;
          mood?: ExpressionMood;
          suggestedCommand?: string;
        };

        const reply = data.reply || 'Signal acknowledged.';
        const nextMood = data.mood || 'speaking';
        setChannelThinking(ch, false);
        updateSpokenLine(reply, ch);

        appendEntry({
          channelId: ch,
          role: 'hermes',
          source,
          mood: nextMood,
          text: data.suggestedCommand ? `${reply}\n[Suggested: ${data.suggestedCommand}]` : reply,
        });

        if (ch === stateRef.current.activeChannel) {
          setMood(nextMood);
          setSpeakingChannel(ch);
          await voiceRef.current?.speakText(reply, nextMood);
        }
      } catch (err) {
        window.clearTimeout(timeoutId);
        setChannelThinking(ch, false);
        // If user explicitly cancelled via Stop/New task while another controller replaced this one, skip fallback
        if (err instanceof DOMException && err.name === 'AbortError' && chatAbortRef.current !== controller) {
          return;
        }
        const fallback = buildLocalFallbackReply(result.prompt, appList, taskList, briefList);
        updateSpokenLine(fallback.reply, ch);
        appendEntry({
          channelId: ch,
          role: 'hermes',
          source,
          mood: fallback.mood,
          text: fallback.reply,
        });
        if (ch === stateRef.current.activeChannel) {
          setMood(fallback.mood);
          setSpeakingChannel(ch);
          await voiceRef.current?.speakText(fallback.reply, fallback.mood);
        }
      } finally {
        if (chatAbortRef.current === controller) {
          chatAbortRef.current = null;
        }
      }
    },
    [
      appendEntry,
      handleApproveCard,
      handleRejectCard,
      updateSpokenLine,
      duetConnected,
      duetSendMessage,
      setChannelThinking,
      upsertEntry,
      gatewayStatus,
    ]
  );

  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      processUserInput(transcript, 'voice');
    },
    [processUserInput]
  );

  const voice = useVoiceAgent(handleVoiceTranscript);
  voiceRef.current = {
    isMuted: voice.voiceState.isMuted,
    speakText: voice.speakText,
    setThinking: voice.setThinking,
    toggleMute: voice.toggleMute,
    stopSpeaking: voice.stopSpeaking,
  };

  useEffect(() => {
    document.title = 'Hermes Duet // Cyber Comms';
  }, []);

  const handleCycleMood = useCallback(() => {
    setMood((current) => {
      const idx = MOOD_CYCLE.indexOf(current);
      const next = MOOD_CYCLE[(idx + 1) % MOOD_CYCLE.length];
      updateSpokenLine(`Expression shifted to ${next}.`);
      return next;
    });
  }, [updateSpokenLine]);

  const handleToggleTaskStatus = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id || t.status === 'completed') return t;
        const nextStatus = t.status === 'running' ? 'paused' : 'running';
        return {
          ...t,
          status: nextStatus,
          lastStep: nextStatus === 'running' ? 'Lane resumed on host worker' : 'Paused by operator',
          updatedAt: nowTime(),
        };
      })
    );
  }, []);

  const handleRunBriefCommand = useCallback(
    (command: string, briefId: string) => {
      setBrief((prev) =>
        prev.map((b) => (b.id === briefId ? { ...b, resolved: true } : b))
      );
      processUserInput(command, 'cli');
    },
    [processUserInput]
  );

  const handleSelectChannel = useCallback(
    (id: ChannelId) => {
      setActiveChannel(id);
      appendEntry({
        channelId: id,
        role: 'system',
        source: 'ui',
        text: `Tuned active Hermes lane to #${id}.`,
      });
    },
    [appendEntry]
  );

  const handleResetCanvasSession = useCallback(
    async (channelId: string) => {
      voiceRef.current?.stopSpeaking();
      setChannelThinking(channelId, false);
      const target = stateRef.current.canvasSessions.find((s) => s.channelId === channelId);
      const sid = target?.hermesSessionId ?? createHermesSessionId(channelId);
      setEntries((prev) => prev.filter((e) => e.channelId !== channelId));
      const greeting = `Fresh context opened for ${sid} (#${channelId}). Prior messages in this shape were cleared.`;
      updateSpokenLine(greeting, channelId);

      if (duetConnected) {
        try {
          await resetHermesSession(channelId);
          return;
        } catch {
          // Fall through to local reset message
        }
      }
      appendEntry({
        channelId,
        role: 'hermes',
        source: 'ui',
        mood: 'happy',
        text: greeting,
      });
    },
    [appendEntry, duetConnected, resetHermesSession, setChannelThinking, updateSpokenLine]
  );

  const handleNewTask = useCallback(() => {
    const ch = stateRef.current.activeChannel;
    setSelectedItemId(null);
    setPanelView('voice');
    setMobileTab('voice');
    setMood('listening');
    void handleResetCanvasSession(ch);
  }, [handleResetCanvasSession]);

  const handleSelectCanvasSession = useCallback(
    (session: CanvasSession) => {
      setActiveChannel(session.channelId);
      setMood(session.mood);
      const latestHermes = [...stateRef.current.entries]
        .reverse()
        .find((e) => e.channelId === session.channelId && e.role === 'hermes' && e.text.trim());
      updateSpokenLine(
        latestHermes
          ? latestHermes.text
          : `${session.hermesSessionId} (${session.name}): ${session.topic}`,
        session.channelId
      );
    },
    [updateSpokenLine]
  );

  const handleMoveCanvasSession = useCallback((id: string, xPct: number, yPct: number) => {
    setCanvasSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, xPct, yPct } : s))
    );
  }, []);

  const handleAddCanvasSession = useCallback(
    (payload: {
      name: string;
      topic: string;
      persona: string;
      shape: BrailleShapeKind;
      tint: BrailleShapeTint;
      eyeStyle: 'open' | 'sleepy';
    }) => {
      const currentSessions = stateRef.current.canvasSessions;
      const slug = slugifySessionName(
        payload.name,
        currentSessions.map((s) => s.channelId)
      );
      const hermesSessionId = createHermesSessionId(slug);
      const spot = findOpenCanvasSpot(currentSessions);
      const nextSession: CanvasSession = {
        id: `session-${slug}-${Date.now().toString(36)}`,
        channelId: slug,
        hermesSessionId,
        agentPersona: payload.persona,
        name: slug,
        topic: payload.topic,
        shape: payload.shape,
        tint: payload.tint,
        xPct: spot.xPct,
        yPct: spot.yPct,
        mood: 'happy',
        eyeStyle: payload.eyeStyle,
        isCore: false,
      };
      syncedSessionsRef.current.add(slug);
      setCanvasSessions((prev) => [...prev, nextSession]);
      setActiveChannel(slug);
      setMood('happy');

      const msg = `Isolated session ${hermesSessionId} online (#${slug}). ${payload.topic}`;
      updateSpokenLine(msg, slug);

      if (duetConnected) {
        void createHermesSession({
          channelId: slug,
          name: slug,
          sessionId: hermesSessionId,
          topic: payload.topic,
          persona: payload.persona,
        }).catch(() => {
          appendEntry({
            channelId: slug,
            role: 'hermes',
            source: 'ui',
            mood: 'happy',
            text: msg,
          });
        });
      } else {
        appendEntry({
          channelId: slug,
          role: 'hermes',
          source: 'ui',
          mood: 'happy',
          text: msg,
        });
      }
    },
    [appendEntry, createHermesSession, duetConnected, updateSpokenLine]
  );

  const handleAutoArrangeCanvas = useCallback(() => {
    setCanvasSessions((prev) => autoArrangeSessions(prev));
  }, []);

  const handleCycleSessionMood = useCallback(
    (id: string) => {
      setCanvasSessions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const idx = MOOD_CYCLE.indexOf(s.mood);
          const next = MOOD_CYCLE[(idx + 1) % MOOD_CYCLE.length];
          if (s.channelId === stateRef.current.activeChannel) {
            setMood(next);
            updateSpokenLine(`#${s.name} expression shifted to ${next}.`, s.channelId);
          }
          return { ...s, mood: next };
        })
      );
    },
    [updateSpokenLine]
  );

  const handleRemoveCanvasSession = useCallback(
    (id: string) => {
      const target = stateRef.current.canvasSessions.find((s) => s.id === id);
      setCanvasSessions((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((s) => s.id !== id);
        if (target && target.channelId === stateRef.current.activeChannel && next[0]) {
          setActiveChannel(next[0].channelId);
        }
        return next;
      });
      if (target) {
        setEntries((prev) => prev.filter((e) => e.channelId !== target.channelId));
        if (duetConnected) {
          void deleteHermesSession(target.channelId).catch(() => {});
        }
      }
    },
    [deleteHermesSession, duetConnected]
  );

  const handleOpenSessionThread = useCallback(
    (session: CanvasSession) => {
      setActiveChannel(session.channelId);
      setMood(session.mood);
      setPanelView('voice');
      setMobileTab('voice');
    },
    []
  );

  const handleMobileTabChange = (tab: MobileTab) => {
    setMobileTab(tab);
    if (tab === 'home') setPanelView('home');
    else if (tab === 'canvas') setPanelView('canvas');
    else if (tab === 'voice') setPanelView('voice');
    else if (tab === 'queue') setPanelView('queue');
    else if (tab === 'cli') setPanelView('cli');
  };

  return (
    <div className="h-screen min-h-[600px] emerald-ambient-bg text-[#ECF3F0] p-2.5 sm:p-4 xl:p-5 pb-16 lg:pb-4 flex flex-col overflow-hidden">
      <main
        id="top"
        className="flex-1 min-h-0 w-full mx-auto grid grid-cols-1 lg:grid-cols-[clamp(300px,21vw,420px)_1fr] gap-3"
      >
        {/* Left Sidebar Window: Tasks, Approvals, Halftone Thumb & Lanes */}
        <div
          className={`${
            mobileTab === 'tasks' ? 'flex' : 'hidden'
          } lg:flex flex-col min-h-0 h-full`}
        >
          <SidebarWorkspace
            channels={channels}
            activeChannel={activeChannel}
            onSelectChannel={handleSelectChannel}
            approvals={approvals}
            brief={brief}
            tasks={tasks}
            lastSpokenLine={lastSpokenLine}
            mood={mood}
            frequencyBands={voice.voiceState.frequencyBands}
            isSpeaking={voice.voiceState.isSpeaking}
            isListening={voice.voiceState.isListening}
            selectedItemId={selectedItemId}
            onSelectTask={(task) => {
              setSelectedItemId(task.id);
              handleToggleTaskStatus(task.id);
              setPanelView('voice');
              setMobileTab('voice');
            }}
            onSelectApproval={(card) => {
              setSelectedItemId(card.id);
              setActiveChannel(card.channelId);
              setPanelView('queue');
              setMobileTab('queue');
            }}
            onSelectBrief={(item) => {
              setSelectedItemId(item.id);
              setPanelView('voice');
              setMobileTab('voice');
              handleRunBriefCommand(item.suggestedCommand, item.id);
            }}
            onNewTask={handleNewTask}
            onOpenQueue={() => {
              setPanelView((prev) => (prev === 'queue' ? 'home' : 'queue'));
              setMobileTab('home');
            }}
          />
        </div>

        {/* Right Emerald-Framed Voice, Character Overview & Interactive CLI Workspace */}
        <div
          className={`${
            mobileTab !== 'tasks' ? 'flex' : 'hidden'
          } lg:flex flex-col min-h-0 h-full`}
        >
          <VoiceWorkspacePane
            channels={channels}
            activeChannel={activeChannel}
            onSelectChannel={handleSelectChannel}
            mood={mood}
            onCycleMood={handleCycleMood}
            panelView={panelView}
            onChangePanelView={(view) => {
              setPanelView(view);
              setMobileTab(view);
            }}
            voiceState={voice.voiceState}
            lastSpokenLine={lastSpokenLine}
            animateSpeechLine={animateSpeechLine}
            entries={entries}
            approvals={approvals}
            brief={brief}
            tasks={tasks}
            gatewayStatus={gatewayStatus}
            onApproveCard={handleApproveCard}
            onRejectCard={handleRejectCard}
            onRunBriefCommand={handleRunBriefCommand}
            onToggleTaskStatus={handleToggleTaskStatus}
            onToggleListening={voice.toggleListening}
            onToggleMute={voice.toggleMute}
            onStopSpeaking={() => {
              const current = chatAbortRef.current;
              chatAbortRef.current = null;
              current?.abort();
              setChannelThinking(activeChannel, false);
              setSpeakingChannel(null);
              voice.stopSpeaking();
            }}
            onSubmitInput={(val, src) => processUserInput(val, src)}
            showThinking={showThinking}
            onToggleThinking={handleToggleThinking}
            canvasSessions={canvasSessions}
            hermesSessions={duet.sessions}
            thinkingByChannel={thinkingByChannel}
            speakingChannel={voice.voiceState.isSpeaking ? speakingChannel : null}
            onSelectCanvasSession={handleSelectCanvasSession}
            onMoveCanvasSession={handleMoveCanvasSession}
            onAddCanvasSession={handleAddCanvasSession}
            onAutoArrangeCanvas={handleAutoArrangeCanvas}
            onCycleSessionMood={handleCycleSessionMood}
            onResetSession={handleResetCanvasSession}
            onRemoveCanvasSession={handleRemoveCanvasSession}
            onOpenSessionThread={handleOpenSessionThread}
          />
        </div>
      </main>

      {/* Compact Mobile Bottom Nav (<= 56px height, < 7% of 844px viewport) */}
      <nav
        aria-label="Mobile workspace views"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#07120F]/95 backdrop-blur-md border-t border-white/10 grid grid-cols-5"
      >
        <button
          type="button"
          onClick={() => handleMobileTabChange('home')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            mobileTab === 'home' || mobileTab === 'voice' ? 'text-[#4ADE80]' : 'text-emerald-100/55'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Home</span>
        </button>
        <button
          type="button"
          onClick={() => handleMobileTabChange('canvas')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            mobileTab === 'canvas' ? 'text-[#4ADE80]' : 'text-emerald-100/55'
          }`}
        >
          <Shapes className="w-4 h-4" />
          <span>Canvas</span>
        </button>
        <button
          type="button"
          onClick={() => handleMobileTabChange('tasks')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            mobileTab === 'tasks' ? 'text-[#4ADE80]' : 'text-emerald-100/55'
          }`}
        >
          <ListTodo className="w-4 h-4" />
          <span>Tasks</span>
        </button>
        <button
          type="button"
          onClick={() => handleMobileTabChange('queue')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            mobileTab === 'queue' ? 'text-[#4ADE80]' : 'text-emerald-100/55'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Queue</span>
        </button>
        <button
          type="button"
          onClick={() => handleMobileTabChange('cli')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            mobileTab === 'cli' ? 'text-[#4ADE80]' : 'text-emerald-100/55'
          }`}
        >
          <TerminalIcon className="w-4 h-4" />
          <span>CLI</span>
        </button>
      </nav>
    </div>
  );
}
