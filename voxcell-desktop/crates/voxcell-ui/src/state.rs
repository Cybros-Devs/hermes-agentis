use rune::{Pixels, TextEdit};
use std::collections::{HashMap, HashSet};
use voxcell_audio::AudioSnapshot;
use voxcell_core::canvas::{
    CanvasDotData, CanvasFormation, CanvasShapeKind, apply_formation, create_home_session_channel,
};
use voxcell_core::cli::{CliAction, autocomplete_slash_commands, parse_cli_input};
use voxcell_core::tasks::{
    apply_streaming_delta_to_steps, apply_tool_progress_to_steps, derive_turn_task_title,
};
use voxcell_core::ui_config::{
    apply_preset, apply_ui_customization_patch, parse_natural_language_ui_request,
};
use voxcell_core::sidebar_char::lead_running_task;
use voxcell_core::{
    ActiveView, ActivityKind, ApprovalKind, AsciiShaderMode, AvatarMode, BackgroundSettings,
    BackgroundTask, ChannelApprovalRequest, ChannelMeta, EntryRole, ExpressionMood, EyeState,
    GatewayCapabilities, GatewayProfile, GatewayTransport, HermesAgentSession, HermesCronJob,
    HermesGatewayInfo, HermesModelOption, HermesSkill, HermesToolset, MouthViseme,
    PhosphorTheme, SessionOrigin, SessionScopeTab, TaskLifecycleStatus, TaskStepItem,
    TerminalEntry, TerminalOutcome, UiCustomizationConfig, VoiceSettings,
};
use voxcell_halftone::{
    Ascii3DParams, HorizonAnimator, PortraitAnimator, PortraitAnimatorInput, PortraitRenderOptions,
    render_ascii3d_frame, render_ascii3d_rgba, render_canvas_dot_rgba, render_horizon_rgba,
    render_portrait_rgba,
};
use voxcell_hermes::{GatewayStreamEvent, StreamSignal};

#[derive(Clone, Debug, PartialEq)]
pub enum UiCommand {
    SendPrompt {
        channel_id: String,
        session_id: String,
        prompt: String,
    },
    ResolveApproval {
        run_id: Option<String>,
        request_id: String,
        execution_generation: u32,
        decision: String,
        is_clarify: bool,
    },
    StopRun {
        run_id: String,
        channel_id: String,
    },
    SteerRun {
        run_id: String,
        text: String,
    },
    ResetSession {
        channel_id: String,
        session_id: String,
    },
    SwitchProfile {
        profile: String,
    },
    SaveGatewaySettings {
        base_url: String,
        hermes_api_key: String,
        deepgram_api_key: String,
    },
    RefreshGateway,
    ManageCronJob {
        job_id: String,
        action: String,
    },
    ToggleMic(bool),
    ToggleMute(bool),
    SpeakText(String),
    TogglePhoneWindow(bool),
    PersistUiConfig,
    PersistBackgroundSettings,
    PersistVoiceSettings,
    PersistDots,
    DismissChannel(String),
}

pub struct AppState {
    pub active_view: ActiveView,
    pub avatar_mode: AvatarMode,
    pub shader_mode: AsciiShaderMode,
    pub phosphor_theme: PhosphorTheme,

    pub gateway: HermesGatewayInfo,
    pub gateway_base_url: String,
    pub gateway_profiles: Vec<GatewayProfile>,
    pub models: Vec<HermesModelOption>,
    pub selected_model: Option<String>,
    pub skills: Vec<HermesSkill>,
    pub toolsets: Vec<HermesToolset>,
    pub cron_jobs: Vec<HermesCronJob>,
    pub gateway_sessions: Vec<HermesAgentSession>,

    pub channels: Vec<ChannelMeta>,
    pub active_channel_id: String,
    pub session_scope: SessionScopeTab,
    pub entries: Vec<TerminalEntry>,
    pub thinking_by_channel: HashMap<String, bool>,
    pub active_run_ids: HashMap<String, String>,
    pub tasks: Vec<BackgroundTask>,
    pub approvals: Vec<ChannelApprovalRequest>,
    pub collapsed_traces: HashSet<String>,

    pub dots: Vec<CanvasDotData>,
    pub canvas_formation: CanvasFormation,
    pub selected_dot_id: Option<String>,

    pub ui_config: UiCustomizationConfig,
    pub bg_settings: BackgroundSettings,
    pub voice: VoiceSettings,
    pub audio: AudioSnapshot,

    pub settings_open: bool,
    pub add_dot_modal_open: bool,
    pub add_dot_shape: CanvasShapeKind,
    pub phone_widget_open: bool,
    pub cli_log: Vec<String>,
    pub status_banner: Option<String>,

    // TextEdit controls
    pub composer_edit: TextEdit,
    pub cli_edit: TextEdit,
    pub search_edit: TextEdit,
    pub canvas_prompt_edit: TextEdit,
    pub add_dot_label_edit: TextEdit,
    pub ui_prompt_edit: TextEdit,
    pub gateway_url_edit: TextEdit,
    pub hermes_key_edit: TextEdit,
    pub deepgram_key_edit: TextEdit,

    // Animation & pixel surfaces
    pub stage_mood: ExpressionMood,
    pub stage_viseme: MouthViseme,
    pub stage_energy: f32,
    pub tap_impulse: f32,
    pub pointer_stage: Option<(f32, f32)>,
    pub pointer_sidebar: Option<(f32, f32)>,
    pub pointer_horizon: (f32, f32),
    pub time_s: f32,
    pub now_ms: u64,
    pub session_counter: usize,
    pub entry_counter: usize,
    pub has_hermes_key: bool,
    pub has_deepgram_key: bool,

    pub stage_anim: PortraitAnimator,
    pub sidebar_anim: PortraitAnimator,
    pub phone_anim: PortraitAnimator,
    pub horizon_anim: HorizonAnimator,

    pub stage_pixels: Pixels,
    pub sidebar_pixels: Pixels,
    pub phone_pixels: Pixels,
    pub horizon_pixels: Pixels,
    pub add_dot_preview_pixels: Pixels,
    pub dot_pixels: HashMap<String, Pixels>,

    pub pending_commands: Vec<UiCommand>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let home_channel = ChannelMeta {
            id: "home".to_string(),
            name: "Home Stage".to_string(),
            category: "workspace".to_string(),
            description: "Primary Voxcell companion session".to_string(),
            session_id: "voxcell-home".to_string(),
            unread: 0,
            origin: SessionOrigin::Workspace,
            has_local_history: true,
            model: Some("hermes-agent".to_string()),
            updated_at_ms: Some(1_000),
        };

        let mut state = Self {
            active_view: ActiveView::Home,
            avatar_mode: AvatarMode::Halftone,
            shader_mode: AsciiShaderMode::Holo,
            phosphor_theme: PhosphorTheme::Emerald,

            gateway: HermesGatewayInfo {
                online: false,
                connected: false,
                base_url: "http://127.0.0.1:8642".to_string(),
                active_profile: "default".to_string(),
                model: "hermes-agent".to_string(),
                active_transport: GatewayTransport::Runs,
                capabilities: GatewayCapabilities::default(),
                version: None,
                latency_ms: None,
                last_error: None,
            },
            gateway_base_url: "http://127.0.0.1:8642".to_string(),
            gateway_profiles: vec![GatewayProfile {
                name: "default".to_string(),
                base_url: "http://127.0.0.1:8642".to_string(),
                active: true,
                online: false,
                model: Some("hermes-agent".to_string()),
                source: "desktop".to_string(),
            }],
            models: vec![HermesModelOption {
                id: "hermes-agent".to_string(),
                label: "Hermes Agent (default)".to_string(),
                provider: Some("hermes".to_string()),
            }],
            selected_model: Some("hermes-agent".to_string()),
            skills: Vec::new(),
            toolsets: Vec::new(),
            cron_jobs: Vec::new(),
            gateway_sessions: Vec::new(),

            channels: vec![home_channel],
            active_channel_id: "home".to_string(),
            session_scope: SessionScopeTab::Sessions,
            entries: Vec::new(),
            thinking_by_channel: HashMap::new(),
            active_run_ids: HashMap::new(),
            tasks: Vec::new(),
            approvals: Vec::new(),
            collapsed_traces: HashSet::new(),

            dots: Vec::new(),
            canvas_formation: CanvasFormation::Constellation,
            selected_dot_id: None,

            ui_config: UiCustomizationConfig::default(),
            bg_settings: BackgroundSettings::default(),
            voice: VoiceSettings::default(),
            audio: AudioSnapshot {
                has_output_device: false,
                has_input_device: false,
                is_speaking: false,
                is_listening: false,
                input_level: 0.0,
                output_level: 0.0,
                bands: [0.0; 12],
            },

            settings_open: false,
            add_dot_modal_open: false,
            add_dot_shape: CanvasShapeKind::HermesOrb,
            phone_widget_open: false,
            cli_log: vec![
                "Voxcell Desktop // RUNE Native Runtime ready.".to_string(),
                "Type a prompt or /help for slash commands.".to_string(),
            ],
            status_banner: None,

            composer_edit: TextEdit::default(),
            cli_edit: TextEdit::default(),
            search_edit: TextEdit::default(),
            canvas_prompt_edit: TextEdit::default(),
            add_dot_label_edit: TextEdit::default(),
            ui_prompt_edit: TextEdit::default(),
            gateway_url_edit: TextEdit::new("http://127.0.0.1:8642"),
            hermes_key_edit: TextEdit::default(),
            deepgram_key_edit: TextEdit::default(),

            stage_mood: ExpressionMood::Calm,
            stage_viseme: MouthViseme::Closed,
            stage_energy: 0.14,
            tap_impulse: 0.0,
            pointer_stage: None,
            pointer_sidebar: None,
            pointer_horizon: (0.0, 0.0),
            time_s: 0.0,
            now_ms: 10_000,
            session_counter: 1,
            entry_counter: 1,
            has_hermes_key: false,
            has_deepgram_key: false,

            stage_anim: PortraitAnimator::new(),
            sidebar_anim: PortraitAnimator::new(),
            phone_anim: PortraitAnimator::new(),
            horizon_anim: HorizonAnimator::new(),

            stage_pixels: Pixels::new(),
            sidebar_pixels: Pixels::new(),
            phone_pixels: Pixels::new(),
            horizon_pixels: Pixels::new(),
            add_dot_preview_pixels: Pixels::new(),
            dot_pixels: HashMap::new(),

            pending_commands: Vec::new(),
        };
        state.step_animations(0.016);
        state
    }

    pub fn next_id(&mut self, prefix: &str) -> String {
        self.entry_counter += 1;
        format!("{prefix}-{}", self.entry_counter)
    }

    pub fn active_channel(&self) -> Option<&ChannelMeta> {
        self.channels
            .iter()
            .find(|c| c.id == self.active_channel_id)
            .or_else(|| self.channels.first())
    }

    pub fn active_session_id(&self) -> String {
        self.active_channel()
            .map(|c| c.session_id.clone())
            .unwrap_or_else(|| "voxcell-home".to_string())
    }

    pub fn active_entries(&self) -> Vec<TerminalEntry> {
        self.entries
            .iter()
            .filter(|e| e.channel_id == self.active_channel_id)
            .cloned()
            .collect()
    }

    pub fn active_is_thinking(&self) -> bool {
        self.thinking_by_channel
            .get(&self.active_channel_id)
            .copied()
            .unwrap_or(false)
    }

    pub fn pending_approvals(&self) -> Vec<ChannelApprovalRequest> {
        self.approvals.iter().filter(|a| !a.resolved).cloned().collect()
    }

    pub fn toggle_stage_mood(&mut self) {
        self.stage_mood = self.stage_mood.next_cycle();
        self.tap_impulse = 1.0;
        self.step_animations(0.016);
    }

    pub fn submit_composer_prompt(&mut self) {
        let prompt = self.composer_edit.text.trim().to_string();
        if prompt.is_empty() {
            return;
        }
        self.composer_edit.clear();
        if prompt.starts_with('/') {
            self.execute_cli_line(&prompt);
            return;
        }
        self.dispatch_user_prompt(&prompt, true);
    }

    pub fn dispatch_user_prompt(&mut self, prompt: &str, switch_to_thread: bool) {
        let trimmed = prompt.trim();
        if trimmed.is_empty() {
            return;
        }
        self.now_ms += 1000;
        if self.active_channel_id == "home" && self.active_entries().is_empty() {
            let new_ch = create_home_session_channel(trimmed, self.session_counter, self.now_ms);
            self.session_counter += 1;
            let ch_id = new_ch.id.clone();
            self.channels.push(new_ch);
            self.active_channel_id = ch_id;
        }
        let channel_id = self.active_channel_id.clone();
        let session_id = self.active_session_id();
        let eid = self.next_id("usr");
        let mut user_entry = TerminalEntry::new(eid, &channel_id, EntryRole::User, trimmed, "now");
        user_entry.created_at_ms = Some(self.now_ms);
        self.entries.push(user_entry);

        if let Some(ch) = self.channels.iter_mut().find(|c| c.id == channel_id) {
            ch.updated_at_ms = Some(self.now_ms);
            ch.has_local_history = true;
            if ch.name.starts_with("Session ") || ch.name == "Home Stage" {
                ch.name = derive_turn_task_title(trimmed, Some("Hermes Session"));
            }
        }

        self.thinking_by_channel.insert(channel_id.clone(), true);
        self.stage_mood = ExpressionMood::Thinking;

        let task_id = format!("turn-{channel_id}-{}", self.now_ms);
        self.tasks.retain(|t| !(t.channel_id == channel_id && t.status == TaskLifecycleStatus::Running));
        self.tasks.push(BackgroundTask {
            id: task_id,
            channel_id: channel_id.clone(),
            session_id: session_id.clone(),
            kind: Some("Turn".to_string()),
            background: Some(false),
            title: derive_turn_task_title(trimmed, Some("Hermes turn")),
            status: TaskLifecycleStatus::Running,
            raw_status: Some("running".to_string()),
            progress: 12.0,
            progress_label: Some("0/1".to_string()),
            last_step: Some("Routing to Hermes gateway".to_string()),
            steps: vec![TaskStepItem {
                text: "Routing to Hermes gateway".to_string(),
                done: false,
                active: true,
            }],
            result: None,
            error_code: None,
            created_at_ms: Some(self.now_ms),
            updated_at_ms: Some(self.now_ms),
            agent_done_at_ms: None,
            confirmed_at_ms: None,
            updated_at: "now".to_string(),
        });

        if switch_to_thread {
            self.active_view = ActiveView::Thread;
        }
        self.pending_commands.push(UiCommand::SendPrompt {
            channel_id,
            session_id,
            prompt: trimmed.to_string(),
        });
    }

    pub fn create_new_workspace_session(&mut self, title: Option<&str>) {
        self.now_ms += 1000;
        let label = title
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("New Hermes session");
        let ch = create_home_session_channel(label, self.session_counter, self.now_ms);
        self.session_counter += 1;
        let id = ch.id.clone();
        self.channels.push(ch);
        self.active_channel_id = id;
        self.active_view = ActiveView::Thread;
    }

    pub fn pin_active_channel_to_canvas(&mut self) {
        let Some(ch) = self.active_channel().cloned() else {
            return;
        };
        if let Some(existing) = self.dots.iter_mut().find(|d| d.channel_id == ch.id) {
            existing.pinned = true;
            self.selected_dot_id = Some(existing.id.clone());
        } else {
            let idx = self.dots.len();
            let shape = CanvasShapeKind::all()[idx % CanvasShapeKind::all().len()];
            let id = format!("dot-{}", ch.id);
            self.dots.push(CanvasDotData {
                id: id.clone(),
                channel_id: ch.id,
                label: ch.name,
                shape,
                x: 420.0,
                y: 250.0,
                pinned: true,
                color_hex: self.ui_config.accent_hex.clone(),
            });
            apply_formation(&mut self.dots, self.canvas_formation, 860.0, 520.0);
            self.selected_dot_id = Some(id);
        }
        self.active_view = ActiveView::Canvas;
        self.pending_commands.push(UiCommand::PersistDots);
        self.step_animations(0.016);
    }

    pub fn add_canvas_dot(&mut self, label: &str, shape: CanvasShapeKind) {
        self.now_ms += 1000;
        let clean_label = if label.trim().is_empty() {
            format!("{} Node", shape.label())
        } else {
            label.trim().to_string()
        };
        let ch = create_home_session_channel(&clean_label, self.session_counter, self.now_ms);
        self.session_counter += 1;
        let ch_id = ch.id.clone();
        self.channels.push(ch);
        let dot_id = format!("dot-{ch_id}");
        self.dots.push(CanvasDotData {
            id: dot_id.clone(),
            channel_id: ch_id.clone(),
            label: clean_label,
            shape,
            x: 430.0,
            y: 260.0,
            pinned: true,
            color_hex: self.ui_config.accent_hex.clone(),
        });
        apply_formation(&mut self.dots, self.canvas_formation, 860.0, 520.0);
        self.selected_dot_id = Some(dot_id);
        self.active_channel_id = ch_id;
        self.add_dot_modal_open = false;
        self.add_dot_label_edit.clear();
        self.pending_commands.push(UiCommand::PersistDots);
        self.step_animations(0.016);
    }

    pub fn resolve_approval(&mut self, approval_id: &str, decision: &str) {
        if let Some(req) = self.approvals.iter_mut().find(|a| a.id == approval_id) {
            req.resolved = true;
            req.resolution = Some(decision.to_string());
            self.pending_commands.push(UiCommand::ResolveApproval {
                run_id: req.run_id.clone(),
                request_id: req.request_id.clone(),
                execution_generation: req.execution_generation,
                decision: decision.to_string(),
                is_clarify: req.kind == ApprovalKind::Clarify,
            });
            self.cli_log.push(format!(
                "[approval] {} -> {decision}",
                req.title
            ));
        }
    }

    pub fn execute_cli_line(&mut self, raw: &str) {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return;
        }
        self.cli_log.push(format!("> {trimmed}"));
        match parse_cli_input(trimmed) {
            CliAction::PrintHelp(help) => {
                for line in help.lines() {
                    self.cli_log.push(line.to_string());
                }
            }
            CliAction::NewSession(title) => {
                self.create_new_workspace_session(title.as_deref());
                self.cli_log.push(format!("Created workspace session {}", self.active_channel_id));
            }
            CliAction::ResetActiveSession => {
                let ch_id = self.active_channel_id.clone();
                let sid = self.active_session_id();
                self.entries.retain(|e| e.channel_id != ch_id);
                self.pending_commands.push(UiCommand::ResetSession {
                    channel_id: ch_id,
                    session_id: sid,
                });
                self.cli_log.push("Reset active session history.".to_string());
            }
            CliAction::ListSessions => {
                for ch in &self.channels {
                    self.cli_log.push(format!(
                        "  {} ({:?}) — {}",
                        ch.id, ch.origin, ch.name
                    ));
                }
            }
            CliAction::ResumeSession(target) => {
                let needle = target.to_ascii_lowercase();
                if let Some(found) = self.channels.iter().find(|c| {
                    c.id.to_ascii_lowercase().contains(&needle)
                        || c.name.to_ascii_lowercase().contains(&needle)
                }) {
                    self.active_channel_id = found.id.clone();
                    self.active_view = ActiveView::Thread;
                    self.cli_log.push(format!("Switched to {}", found.name));
                } else {
                    self.cli_log.push(format!("No session matched '{target}'"));
                }
            }
            CliAction::SetModel(m) => {
                if let Some(model) = m {
                    self.selected_model = Some(model.clone());
                    self.gateway.model = model.clone();
                    self.cli_log.push(format!("Active model set to {model}"));
                } else {
                    self.cli_log.push(format!("Current model: {}", self.gateway.model));
                }
            }
            CliAction::ShowStatus => {
                self.cli_log.push(format!(
                    "Gateway: {} | online={} | profile={} | transport={:?} | latency={:?}ms",
                    self.gateway.base_url,
                    self.gateway.online,
                    self.gateway.active_profile,
                    self.gateway.active_transport,
                    self.gateway.latency_ms
                ));
            }
            CliAction::SetGateway(url) => {
                if let Some(u) = url {
                    self.gateway_base_url = u.clone();
                    self.gateway_url_edit.replace_text(&u);
                    self.pending_commands.push(UiCommand::SaveGatewaySettings {
                        base_url: u,
                        hermes_api_key: String::new(),
                        deepgram_api_key: String::new(),
                    });
                    self.pending_commands.push(UiCommand::RefreshGateway);
                    self.cli_log.push("Updated gateway URL and queued probe.".to_string());
                } else {
                    self.cli_log.push(format!("Gateway URL: {}", self.gateway_base_url));
                }
            }
            CliAction::SetProfile(p) => {
                if let Some(name) = p {
                    self.gateway.active_profile = name.clone();
                    self.pending_commands.push(UiCommand::SwitchProfile { profile: name.clone() });
                    self.cli_log.push(format!("Switched profile to {name}"));
                } else {
                    self.cli_log.push(format!("Active profile: {}", self.gateway.active_profile));
                }
            }
            CliAction::ListSkills => {
                if self.skills.is_empty() {
                    self.cli_log.push("No skills loaded yet from gateway.".to_string());
                } else {
                    for sk in &self.skills {
                        self.cli_log.push(format!("  {} — {}", sk.name, sk.description));
                    }
                }
            }
            CliAction::ListToolsets => {
                if self.toolsets.is_empty() {
                    self.cli_log.push("No toolsets loaded yet from gateway.".to_string());
                } else {
                    for ts in &self.toolsets {
                        self.cli_log.push(format!("  {} ({} tools)", ts.name, ts.tools.len()));
                    }
                }
            }
            CliAction::CronCommand(arg) => {
                if let Some(spec) = arg {
                    let parts: Vec<&str> = spec.split_whitespace().collect();
                    if parts.len() == 2 {
                        self.pending_commands.push(UiCommand::ManageCronJob {
                            job_id: parts[1].to_string(),
                            action: parts[0].to_string(),
                        });
                        self.cli_log.push(format!("Dispatched cron {} {}", parts[0], parts[1]));
                    } else {
                        self.cli_log.push("Usage: /cron [pause|resume|run|delete] <job-id>".to_string());
                    }
                } else {
                    self.cli_log.push(format!("Cron jobs tracked: {}", self.cron_jobs.len()));
                }
            }
            CliAction::ListTasks => {
                self.cli_log.push(format!("Tracked tasks: {}", self.tasks.len()));
                for t in &self.tasks {
                    self.cli_log.push(format!("  [{}] {} ({:?})", t.id, t.title, t.status));
                }
            }
            CliAction::SwitchView(v) => {
                self.active_view = v;
                self.cli_log.push(format!("Switched view to {v:?}"));
            }
            CliAction::ResolveApproval(decision) => {
                if let Some(first_id) = self.pending_approvals().first().map(|a| a.id.clone()) {
                    self.resolve_approval(&first_id, &decision);
                } else {
                    self.cli_log.push("No pending approval request.".to_string());
                }
            }
            CliAction::StopActiveRun => {
                let ch_id = self.active_channel_id.clone();
                if let Some(run_id) = self.active_run_ids.get(&ch_id).cloned() {
                    self.pending_commands.push(UiCommand::StopRun {
                        run_id,
                        channel_id: ch_id.clone(),
                    });
                }
                self.thinking_by_channel.insert(ch_id, false);
                self.cli_log.push("Stopped active run.".to_string());
            }
            CliAction::ClearTerminal => {
                self.cli_log.clear();
            }
            CliAction::VoiceControl(arg) => {
                let next = match arg.as_deref() {
                    Some("on") | Some("ptt") => true,
                    Some("off") => false,
                    _ => !self.voice.hands_free_vad,
                };
                self.voice.hands_free_vad = next;
                self.pending_commands.push(UiCommand::ToggleMic(next));
                self.cli_log.push(format!("Voice input {}", if next { "enabled" } else { "disabled" }));
            }
            CliAction::TtsControl(arg) => {
                let muted = match arg.as_deref() {
                    Some("off") | Some("mute") => true,
                    Some("on") => false,
                    _ => !self.voice.muted,
                };
                self.voice.muted = muted;
                self.pending_commands.push(UiCommand::ToggleMute(muted));
                self.cli_log.push(format!("TTS audio {}", if muted { "muted" } else { "unmuted" }));
            }
            CliAction::SetAvatarMode(mode) => {
                self.avatar_mode = mode.unwrap_or(match self.avatar_mode {
                    AvatarMode::Halftone => AvatarMode::Ascii3d,
                    AvatarMode::Ascii3d => AvatarMode::Halftone,
                });
                self.cli_log.push(format!("Avatar mode: {:?}", self.avatar_mode));
                self.step_animations(0.016);
            }
            CliAction::ApplyUiCustomization(req) => {
                if !req.is_empty() {
                    let patch = parse_natural_language_ui_request(&req);
                    apply_ui_customization_patch(&mut self.ui_config, &patch);
                    self.pending_commands.push(UiCommand::PersistUiConfig);
                    self.cli_log.push(format!(
                        "Applied UI style: accent={}, profile={:?}, horizon={:?}",
                        self.ui_config.accent_hex,
                        self.ui_config.dot_profile,
                        self.ui_config.horizon_mode
                    ));
                    self.step_animations(0.016);
                } else {
                    self.settings_open = true;
                }
            }
            CliAction::TogglePhoneWidget(open) => {
                let next = open.unwrap_or(!self.phone_widget_open);
                self.phone_widget_open = next;
                self.pending_commands.push(UiCommand::TogglePhoneWindow(next));
                self.cli_log.push(format!("Phone widget {}", if next { "opened" } else { "closed" }));
            }
            CliAction::SendPrompt(prompt) => {
                self.dispatch_user_prompt(&prompt, false);
            }
            CliAction::UnknownCommand(cmd) => {
                let suggestions = autocomplete_slash_commands(&cmd);
                if suggestions.is_empty() {
                    self.cli_log.push(format!("Unknown command: {cmd}. Try /help."));
                } else {
                    let names: Vec<&str> = suggestions.iter().map(|s| s.name).collect();
                    self.cli_log.push(format!("Unknown command {cmd}. Did you mean: {}", names.join(", ")));
                }
            }
        }
    }

    pub fn apply_ui_prompt(&mut self, prompt: &str) {
        if !apply_preset(&mut self.ui_config, prompt) {
            let patch = parse_natural_language_ui_request(prompt);
            apply_ui_customization_patch(&mut self.ui_config, &patch);
        }
        self.pending_commands.push(UiCommand::PersistUiConfig);
        self.step_animations(0.016);
    }

    pub fn apply_hermes_event(&mut self, ev: GatewayStreamEvent) {
        self.now_ms += 50;
        match ev {
            GatewayStreamEvent::RunStarted { channel_id, run_id } => {
                self.active_run_ids.insert(channel_id.clone(), run_id);
                self.thinking_by_channel.insert(channel_id, true);
                self.stage_mood = ExpressionMood::Thinking;
            }
            GatewayStreamEvent::Signal { channel_id, signal } => match signal {
                StreamSignal::ContentDelta { chunk, .. } => {
                    self.stage_mood = ExpressionMood::Speaking;
                    if let Some(last) = self.entries.iter_mut().rev().find(|e| {
                        e.channel_id == channel_id && e.role == EntryRole::Hermes && e.streaming
                    }) {
                        last.text.push_str(&chunk);
                    } else {
                        let id = self.next_id("hrm");
                        let mut entry = TerminalEntry::new(
                            id,
                            &channel_id,
                            EntryRole::Hermes,
                            chunk,
                            "live",
                        );
                        entry.streaming = true;
                        entry.created_at_ms = Some(self.now_ms);
                        self.entries.push(entry);
                    }
                    if let Some(task) = self.tasks.iter_mut().rev().find(|t| {
                        t.channel_id == channel_id && t.status == TaskLifecycleStatus::Running
                    }) {
                        let (steps, ratio, changed) = apply_streaming_delta_to_steps(&task.steps);
                        if changed {
                            task.steps = steps;
                            task.progress_label = Some(ratio);
                            task.last_step = Some("Composing response".to_string());
                        }
                    }
                }
                StreamSignal::ReasoningDelta { chunk, .. } => {
                    let id = self.next_id("rsn");
                    let mut entry = TerminalEntry::new(
                        id,
                        &channel_id,
                        EntryRole::Activity,
                        format!("Reasoning: {chunk}"),
                        "live",
                    );
                    entry.activity_kind = Some(ActivityKind::Reasoning);
                    entry.reasoning_detail = Some(chunk);
                    self.entries.push(entry);
                }
                StreamSignal::Interim { text, .. } => {
                    let id = self.next_id("note");
                    let mut entry = TerminalEntry::new(
                        id,
                        &channel_id,
                        EntryRole::Activity,
                        format!("Commentary: {text}"),
                        "live",
                    );
                    entry.activity_kind = Some(ActivityKind::Commentary);
                    self.entries.push(entry);
                }
                StreamSignal::ToolEvent(ev) => {
                    let is_running = ev.status.eq_ignore_ascii_case("running")
                        || ev.phase.eq_ignore_ascii_case("started");
                    if is_running {
                        self.stage_mood = ExpressionMood::Focused;
                    }
                    let detail = if !ev.summary.is_empty() {
                        ev.summary.clone()
                    } else if !ev.label.is_empty() {
                        ev.label.clone()
                    } else {
                        format!("{} ({})", ev.tool_name, ev.status)
                    };
                    let id = self.next_id("tool");
                    let mut entry = TerminalEntry::new(
                        id,
                        &channel_id,
                        EntryRole::Activity,
                        format!("{}: {detail}", ev.tool_name),
                        "live",
                    );
                    entry.activity_kind = Some(ActivityKind::Tool);
                    entry.activity_status = Some(ev.status.clone());
                    self.entries.push(entry);

                    if let Some(task) = self.tasks.iter_mut().rev().find(|t| {
                        t.channel_id == channel_id && t.status == TaskLifecycleStatus::Running
                    }) {
                        let (steps, ratio) = apply_tool_progress_to_steps(
                            &task.steps,
                            &ev.tool_name,
                            if ev.label.is_empty() { None } else { Some(ev.label.as_str()) },
                            &ev.status,
                            if ev.summary.is_empty() { None } else { Some(ev.summary.as_str()) },
                        );
                        task.steps = steps;
                        task.progress_label = Some(ratio);
                        task.last_step = Some(detail);
                    }
                }
                StreamSignal::ApprovalRequest(req) => {
                    self.stage_mood = ExpressionMood::Alert;
                    let run_id = self.active_run_ids.get(&channel_id).cloned();
                    self.approvals.push(ChannelApprovalRequest {
                        id: format!("apr-{}", req.request_id),
                        channel_id,
                        run_id,
                        request_id: req.request_id,
                        execution_generation: req.execution_generation,
                        kind: req.kind,
                        title: req.title,
                        tool_name: req.tool_name,
                        command: req.command,
                        summary: req.summary,
                        destination: req.destination,
                        choices: req.choices,
                        created_at: "now".to_string(),
                        resolved: false,
                        resolution: None,
                    });
                }
                StreamSignal::SubagentStart { summary, .. } => {
                    let id = self.next_id("sub");
                    let mut entry = TerminalEntry::new(
                        id,
                        &channel_id,
                        EntryRole::Activity,
                        format!("Subagent: {summary}"),
                        "live",
                    );
                    entry.activity_kind = Some(ActivityKind::Subagent);
                    entry.activity_status = Some("running".to_string());
                    self.entries.push(entry);
                }
                StreamSignal::SubagentComplete { status, summary, .. } => {
                    let id = self.next_id("sub");
                    let mut entry = TerminalEntry::new(
                        id,
                        &channel_id,
                        EntryRole::Activity,
                        format!("Subagent ({status}): {summary}"),
                        "live",
                    );
                    entry.activity_kind = Some(ActivityKind::Subagent);
                    entry.activity_status = Some(status);
                    self.entries.push(entry);
                }
                StreamSignal::Steered(txt) => {
                    let id = self.next_id("steer");
                    self.entries.push(TerminalEntry::new(
                        id,
                        &channel_id,
                        EntryRole::System,
                        format!("Steered: {txt}"),
                        "now",
                    ));
                }
            },
            GatewayStreamEvent::Completed { channel_id, result } => {
                self.thinking_by_channel.insert(channel_id.clone(), false);
                self.active_run_ids.remove(&channel_id);
                let mut spoken = None;
                if let Some(last) = self.entries.iter_mut().rev().find(|e| {
                    e.channel_id == channel_id && e.role == EntryRole::Hermes && e.streaming
                }) {
                    if last.text.trim().is_empty() && !result.output.is_empty() {
                        last.text = result.output.clone();
                    }
                    last.streaming = false;
                    spoken = Some(last.text.clone());
                } else if !result.output.is_empty() {
                    let id = self.next_id("hrm");
                    spoken = Some(result.output.clone());
                    self.entries.push(TerminalEntry::new(
                        id,
                        &channel_id,
                        EntryRole::Hermes,
                        result.output,
                        "now",
                    ));
                }
                let ok = result.outcome == TerminalOutcome::Completed;
                if let Some(task) = self.tasks.iter_mut().rev().find(|t| {
                    t.channel_id == channel_id && t.status == TaskLifecycleStatus::Running
                }) {
                    task.status = TaskLifecycleStatus::Completed;
                    task.raw_status = Some(if ok { "done".into() } else { "failed".into() });
                    task.progress = 100.0;
                    for s in &mut task.steps {
                        s.done = ok;
                        s.active = false;
                    }
                }
                if let Some(err_msg) = result.error {
                    let id = self.next_id("err");
                    let mut entry = TerminalEntry::new(
                        id,
                        &channel_id,
                        EntryRole::Activity,
                        err_msg,
                        "now",
                    );
                    entry.error_code = result.error_code;
                    entry.terminal_outcome = Some(result.outcome);
                    self.entries.push(entry);
                }
                self.stage_mood = if ok { ExpressionMood::Calm } else { ExpressionMood::Alert };
                if self.voice.tts_enabled && !self.voice.muted {
                    if let Some(txt) = spoken.filter(|s| !s.trim().is_empty()) {
                        self.pending_commands.push(UiCommand::SpeakText(txt));
                    }
                }
            }
            GatewayStreamEvent::Error { channel_id, message } => {
                self.thinking_by_channel.insert(channel_id.clone(), false);
                self.active_run_ids.remove(&channel_id);
                let id = self.next_id("err");
                let mut entry = TerminalEntry::new(
                    id,
                    &channel_id,
                    EntryRole::Activity,
                    message.clone(),
                    "now",
                );
                entry.error_code = Some("gateway_error".to_string());
                entry.terminal_outcome = Some(TerminalOutcome::Failed);
                self.entries.push(entry);
                self.cli_log.push(format!("[gateway error] {message}"));
                self.stage_mood = ExpressionMood::Alert;
            }
        }
    }

    pub fn step_animations(&mut self, dt: f32) {
        let clamped_dt = dt.clamp(0.001, 0.1);
        self.time_s += clamped_dt;
        self.tap_impulse = (self.tap_impulse - clamped_dt * 2.4).max(0.0);

        let running_count = self
            .tasks
            .iter()
            .filter(|t| t.status == TaskLifecycleStatus::Running)
            .count();
        let pending_approval_count = self.approvals.iter().filter(|a| !a.resolved).count();
        let any_thinking = self.thinking_by_channel.values().any(|&v| v);
        let active_channel_thinking = self.active_is_thinking();

        let is_speaking = self.audio.is_speaking || self.stage_mood == ExpressionMood::Speaking;
        let is_listening = self.audio.is_listening || self.voice.hands_free_vad;
        let voice_amp = self.audio.output_level.max(self.audio.input_level);

        let stage_effective_mood = if pending_approval_count > 0 {
            ExpressionMood::Alert
        } else if is_speaking {
            ExpressionMood::Speaking
        } else if is_listening {
            ExpressionMood::Listening
        } else if running_count > 0 || any_thinking {
            ExpressionMood::Thinking
        } else {
            self.stage_mood
        };

        let stage_eye = match stage_effective_mood {
            ExpressionMood::Alert => EyeState::Wide,
            _ => EyeState::Open,
        };
        let stage_viseme = if is_speaking {
            let amp = if voice_amp > 0.05 {
                voice_amp
            } else {
                ((self.time_s * 7.5).sin().abs() * 0.65 + 0.25).clamp(0.0, 1.0)
            };
            voxcell_core::sidebar_char::amplitude_to_viseme(amp)
        } else if is_listening {
            MouthViseme::Rest
        } else {
            self.stage_viseme
        };

        let stage_energy = if is_speaking {
            voice_amp.max(0.55)
        } else if running_count > 0 || any_thinking {
            0.55
        } else if is_listening {
            0.38
        } else {
            0.16
        };

        let tint = self.ui_config.portrait_tint_hex.as_deref();
        let dot_profile = self.ui_config.dot_profile;
        let bloom = self.ui_config.bloom;
        let reduced = self.ui_config.reduced_motion;

        // 1) Main stage avatar (Halftone or 3D ASCII SDF)
        let motion_stage = self.stage_anim.step(
            &PortraitAnimatorInput {
                time: self.time_s,
                mood: stage_effective_mood,
                eye_state: stage_eye,
                viseme: stage_viseme,
                energy: stage_energy,
                is_speaking,
                is_listening,
                pointer_x: self.pointer_stage.map(|p| p.0),
                pointer_y: self.pointer_stage.map(|p| p.1),
                tap_impulse: self.tap_impulse,
            },
            clamped_dt,
            reduced,
        );
        let stage_rgba = match self.avatar_mode {
            AvatarMode::Halftone => render_portrait_rgba(
                motion_stage,
                &PortraitRenderOptions {
                    pixel_w: 320,
                    pixel_h: 294,
                    cols: 58,
                    rows: 27,
                    time: self.time_s,
                    mood: stage_effective_mood,
                    viseme: stage_viseme,
                    energy: stage_energy,
                    is_speaking,
                    is_listening,
                    is_loading: false,
                    is_thumb: false,
                    dot_profile,
                    bloom,
                    tint_hex: tint,
                },
            ),
            AvatarMode::Ascii3d => {
                let frame = render_ascii3d_frame(&Ascii3DParams {
                    cols: 56,
                    rows: 27,
                    time: self.time_s,
                    yaw: self.pointer_stage.map(|p| p.0 * 0.45).unwrap_or(self.time_s * 0.25),
                    pitch: self.pointer_stage.map(|p| p.1 * 0.28).unwrap_or(0.06),
                    zoom: 1.0,
                    mood: stage_effective_mood,
                    viseme: stage_viseme,
                    eye_state: stage_eye,
                    energy: stage_energy,
                    is_speaking,
                    is_listening,
                    shader_mode: self.shader_mode,
                    bands: self.audio.bands,
                });
                render_ascii3d_rgba(320, 294, &frame, self.phosphor_theme)
            }
        };
        self.stage_pixels.set(320, 294, stage_rgba);

        // 2) Sidebar live 72x66 reactive avatar
        let lead_task = lead_running_task(&self.tasks);
        let sb_pres = voxcell_core::sidebar_char::derive_sidebar_character_state(
            &voxcell_core::sidebar_char::SidebarCharacterInput {
                connected: self.gateway.online,
                is_speaking,
                is_listening,
                active_channel_thinking,
                any_thinking,
                running_task_count: running_count,
                pending_approval_count,
                voice_amplitude: if is_speaking { stage_energy } else { voice_amp },
                active_task_progress: lead_task.map(|t| t.progress),
                active_task_title: lead_task.map(|t| t.title.clone()),
                look_x: self.pointer_sidebar.map(|p| p.0).unwrap_or(0.0),
                look_y: self.pointer_sidebar.map(|p| p.1).unwrap_or(0.0),
            },
        );
        let motion_sb = self.sidebar_anim.step(
            &PortraitAnimatorInput {
                time: self.time_s,
                mood: sb_pres.mood,
                eye_state: sb_pres.eye_state,
                viseme: sb_pres.viseme,
                energy: sb_pres.energy,
                is_speaking: sb_pres.is_speaking,
                is_listening: sb_pres.is_listening,
                pointer_x: self.pointer_sidebar.map(|p| p.0),
                pointer_y: self.pointer_sidebar.map(|p| p.1),
                tap_impulse: self.tap_impulse * 0.6,
            },
            clamped_dt,
            reduced,
        );
        let sb_rgba = render_portrait_rgba(
            motion_sb,
            &PortraitRenderOptions {
                pixel_w: 144,
                pixel_h: 132,
                cols: 32,
                rows: 16,
                time: self.time_s,
                mood: sb_pres.mood,
                viseme: sb_pres.viseme,
                energy: sb_pres.energy,
                is_speaking: sb_pres.is_speaking,
                is_listening: sb_pres.is_listening,
                is_loading: false,
                is_thumb: true,
                dot_profile,
                bloom: (bloom + 0.1).min(1.0),
                tint_hex: tint,
            },
        );
        self.sidebar_pixels.set(144, 132, sb_rgba);

        // 3) Horizon wave strip (Home view)
        let h_state = self.horizon_anim.step(
            stage_energy,
            self.pointer_horizon.0,
            self.pointer_horizon.1,
            &self.audio.bands,
            clamped_dt,
            reduced,
        );
        let h_rgba = render_horizon_rgba(
            680,
            88,
            136,
            12,
            self.time_s,
            h_state,
            self.ui_config.horizon_mode,
            &self.ui_config.accent_hex,
            dot_profile,
            bloom,
        );
        self.horizon_pixels.set(680, 88, h_rgba);

        // 4) Phone widget portrait (only update when open or small cost)
        if self.phone_widget_open {
            let phone_rgba = render_portrait_rgba(
                motion_stage,
                &PortraitRenderOptions {
                    pixel_w: 240,
                    pixel_h: 210,
                    cols: 48,
                    rows: 22,
                    time: self.time_s,
                    mood: stage_effective_mood,
                    viseme: stage_viseme,
                    energy: stage_energy,
                    is_speaking,
                    is_listening,
                    is_loading: false,
                    is_thumb: false,
                    dot_profile,
                    bloom,
                    tint_hex: tint,
                },
            );
            self.phone_pixels.set(240, 210, phone_rgba);
        }

        // 5) Canvas dots & Add-Dot modal preview
        if self.active_view == ActiveView::Canvas {
            for dot in &self.dots {
                let busy = self
                    .thinking_by_channel
                    .get(&dot.channel_id)
                    .copied()
                    .unwrap_or(false)
                    || self.tasks.iter().any(|t| {
                        t.channel_id == dot.channel_id && t.status == TaskLifecycleStatus::Running
                    });
                let dot_rgba = render_canvas_dot_rgba(
                    96,
                    96,
                    22,
                    11,
                    dot.shape,
                    self.time_s,
                    if busy { ExpressionMood::Thinking } else { ExpressionMood::Calm },
                    MouthViseme::Rest,
                    if busy { 0.72 } else { 0.2 },
                    false,
                    false,
                    busy,
                    Some(&dot.color_hex),
                    dot_profile,
                    bloom,
                );
                self.dot_pixels
                    .entry(dot.id.clone())
                    .or_default()
                    .set(96, 96, dot_rgba);
            }
        }
        if self.add_dot_modal_open {
            let prev_rgba = render_canvas_dot_rgba(
                96,
                96,
                22,
                11,
                self.add_dot_shape,
                self.time_s,
                ExpressionMood::Happy,
                MouthViseme::Smile,
                0.45,
                false,
                false,
                false,
                Some(&self.ui_config.accent_hex),
                dot_profile,
                bloom,
            );
            self.add_dot_preview_pixels.set(96, 96, prev_rgba);
        }
    }

    /// Deterministic scene presets for headless inspection & UI verification tests.
    pub fn apply_scene_preset(&mut self, scene: &str) {
        self.gateway.online = true;
        self.gateway.connected = true;
        self.gateway.latency_ms = Some(14);
        self.gateway.version = Some("2026.11-rune".to_string());
        self.gateway.capabilities = GatewayCapabilities {
            runs: true,
            approvals: true,
            clarify: true,
            steering: true,
            session_stream: true,
            chat_completions: true,
            skills: true,
            toolsets: true,
            cron_jobs: true,
            profiles: vec!["default".into(), "ops".into()],
        };
        self.gateway_profiles = vec![
            GatewayProfile {
                name: "default".into(),
                base_url: self.gateway_base_url.clone(),
                active: true,
                online: true,
                model: Some("hermes-agent".into()),
                source: "config".into(),
            },
            GatewayProfile {
                name: "ops".into(),
                base_url: self.gateway_base_url.clone(),
                active: false,
                online: true,
                model: Some("glm-5.3".into()),
                source: "profile".into(),
            },
        ];

        match scene {
            "idle" => {
                self.active_view = ActiveView::Home;
            }
            "working" => {
                self.create_new_workspace_session(Some("Audit RUNE shader pipeline"));
                let ch_id = self.active_channel_id.clone();
                self.thinking_by_channel.insert(ch_id.clone(), true);
                self.tasks.push(BackgroundTask {
                    id: "t-work".into(),
                    channel_id: ch_id.clone(),
                    session_id: "voxcell-work".into(),
                    kind: Some("Build".into()),
                    background: Some(false),
                    title: "Audit RUNE shader pipeline".into(),
                    status: TaskLifecycleStatus::Running,
                    raw_status: Some("running".into()),
                    progress: 62.0,
                    progress_label: Some("2/3".into()),
                    last_step: Some("Running cargo check --workspace".into()),
                    steps: vec![
                        TaskStepItem { text: "Inspect compositor passes".into(), done: true, active: false },
                        TaskStepItem { text: "Verify Bayer 8x8 LUT".into(), done: true, active: false },
                        TaskStepItem { text: "Run cargo test".into(), done: false, active: true },
                    ],
                    result: None,
                    error_code: None,
                    created_at_ms: Some(1_000),
                    updated_at_ms: Some(9_000),
                    agent_done_at_ms: None,
                    confirmed_at_ms: None,
                    updated_at: "14s".into(),
                });
                self.stage_mood = ExpressionMood::Thinking;
                self.active_view = ActiveView::Home;
            }
            "attention" => {
                self.create_new_workspace_session(Some("Deploy gateway config"));
                let ch_id = self.active_channel_id.clone();
                self.approvals.push(ChannelApprovalRequest {
                    id: "apr-deploy-1".into(),
                    channel_id: ch_id,
                    run_id: Some("run-77".into()),
                    request_id: "req-77".into(),
                    execution_generation: 1,
                    kind: ApprovalKind::Approval,
                    title: "Execute Shell Command".into(),
                    tool_name: Some("terminal".into()),
                    command: "systemctl restart hermes-gateway".into(),
                    summary: "Restart Hermes gateway daemon to apply TLS profile".into(),
                    destination: "ops".into(),
                    choices: vec!["once".into(), "always".into(), "deny".into()],
                    created_at: "just now".into(),
                    resolved: false,
                    resolution: None,
                });
                self.stage_mood = ExpressionMood::Alert;
                self.active_view = ActiveView::Home;
            }
            "speaking" => {
                self.stage_mood = ExpressionMood::Speaking;
                self.audio.is_speaking = true;
                self.audio.output_level = 0.72;
                self.audio.bands = [0.4, 0.7, 0.85, 0.75, 0.6, 0.5, 0.65, 0.45, 0.35, 0.25, 0.18, 0.12];
                self.active_view = ActiveView::Home;
            }
            "canvas" => {
                self.active_view = ActiveView::Canvas;
                let samples = [
                    ("Hermes Core", CanvasShapeKind::HermesOrb, "#34D399"),
                    ("Neko Scout", CanvasShapeKind::CatBot, "#22D3EE"),
                    ("Kitsune Trace", CanvasShapeKind::FoxSpirit, "#F59E0B"),
                    ("Seraph Guard", CanvasShapeKind::AngelBot, "#A78BFA"),
                    ("Phantom CLI", CanvasShapeKind::GhostShell, "#F43F5E"),
                ];
                for (i, (label, shape, color)) in samples.iter().enumerate() {
                    let ch = create_home_session_channel(label, i + 10, 5000 + i as u64);
                    let ch_id = ch.id.clone();
                    self.channels.push(ch);
                    self.dots.push(CanvasDotData {
                        id: format!("dot-{i}"),
                        channel_id: ch_id.clone(),
                        label: (*label).to_string(),
                        shape: *shape,
                        x: 0.0,
                        y: 0.0,
                        pinned: true,
                        color_hex: (*color).to_string(),
                    });
                    if i == 2 {
                        self.thinking_by_channel.insert(ch_id, true);
                    }
                }
                apply_formation(&mut self.dots, CanvasFormation::Constellation, 860.0, 520.0);
                self.selected_dot_id = Some("dot-0".into());
            }
            "thread" => {
                self.create_new_workspace_session(Some("RUNE GPU Atlas Inspection"));
                let ch_id = self.active_channel_id.clone();
                self.entries.push(TerminalEntry::new(
                    "e1",
                    &ch_id,
                    EntryRole::User,
                    "Inspect halftone atlas throughput and confirm tests pass.",
                    "15:40",
                ));
                let mut rsn = TerminalEntry::new(
                    "e2",
                    &ch_id,
                    EntryRole::Activity,
                    "Reasoning: Measuring RGBA buffer generation vs atlas dirty-row upload cost.",
                    "15:40",
                );
                rsn.activity_kind = Some(ActivityKind::Reasoning);
                self.entries.push(rsn);

                let mut t1 = TerminalEntry::new(
                    "e3",
                    &ch_id,
                    EntryRole::Activity,
                    "terminal: cargo test -p voxcell-halftone -> 4 passed",
                    "15:41",
                );
                t1.activity_kind = Some(ActivityKind::Tool);
                t1.activity_status = Some("done".into());
                self.entries.push(t1);

                self.entries.push(TerminalEntry::new(
                    "e4",
                    &ch_id,
                    EntryRole::Hermes,
                    "All 4 halftone engine tests passed. Portrait rendering averages 0.6 ms per frame at 320x294 with bilinear sprite bank blending and two-pass phosphor bloom.",
                    "15:41",
                ));
                self.active_view = ActiveView::Thread;
            }
            "queue" => {
                self.active_view = ActiveView::Queue;
                self.skills = vec![
                    HermesSkill { name: "rust-diagnostics".into(), description: "Analyze cargo errors and workspace targets".into(), category: Some("dev".into()), enabled: true },
                    HermesSkill { name: "ui-screenshot-audit".into(), description: "Headless visual frame critique".into(), category: Some("qa".into()), enabled: true },
                ];
                self.toolsets = vec![
                    HermesToolset { name: "terminal".into(), description: "Shell command execution with approval gates".into(), tools: vec!["exec".into(), "process".into()], enabled: true },
                    HermesToolset { name: "filesystem".into(), description: "Workspace file read/write".into(), tools: vec!["read_file".into(), "write_file".into()], enabled: true },
                ];
                self.cron_jobs = vec![
                    HermesCronJob {
                        id: "cron-health".into(),
                        name: "Gateway Heartbeat".into(),
                        schedule: "*/5 * * * *".into(),
                        prompt: "Check local gateway metrics".into(),
                        channel_id: None,
                        enabled: true,
                        last_run_at: Some("2m ago".into()),
                        next_run_at: Some("in 3m".into()),
                        last_status: Some("ok".into()),
                    },
                ];
                self.approvals.push(ChannelApprovalRequest {
                    id: "apr-q-1".into(),
                    channel_id: "home".into(),
                    run_id: Some("run-88".into()),
                    request_id: "req-88".into(),
                    execution_generation: 2,
                    kind: ApprovalKind::Approval,
                    title: "Run Integration Suite".into(),
                    tool_name: Some("terminal".into()),
                    command: "cargo test --workspace".into(),
                    summary: "Execute full desktop workspace tests".into(),
                    destination: "default".into(),
                    choices: vec!["once".into(), "always".into(), "deny".into()],
                    created_at: "1m ago".into(),
                    resolved: false,
                    resolution: None,
                });
            }
            "cli" => {
                self.active_view = ActiveView::Cli;
                self.cli_edit.replace_text("/ui");
                self.execute_cli_line("/status");
            }
            "settings" => {
                self.active_view = ActiveView::Home;
                self.settings_open = true;
            }
            "phone" => {
                self.phone_widget_open = true;
                self.stage_mood = ExpressionMood::Speaking;
                self.audio.is_speaking = true;
                self.audio.output_level = 0.65;
                self.audio.bands = [0.3, 0.55, 0.78, 0.66, 0.5, 0.42, 0.52, 0.38, 0.25, 0.18, 0.14, 0.1];
            }
            _ => {}
        }
        self.step_animations(0.016);
    }
}
