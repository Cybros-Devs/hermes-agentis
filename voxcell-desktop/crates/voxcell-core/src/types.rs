use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ExpressionMood {
    #[default]
    Calm,
    Focused,
    Listening,
    Thinking,
    Speaking,
    Happy,
    Alert,
}

impl ExpressionMood {
    pub fn label(self) -> &'static str {
        match self {
            Self::Calm => "Calm",
            Self::Focused => "Focused",
            Self::Listening => "Listening",
            Self::Thinking => "Thinking",
            Self::Speaking => "Speaking",
            Self::Happy => "Happy",
            Self::Alert => "Alert",
        }
    }

    pub fn next_cycle(self) -> Self {
        match self {
            Self::Calm => Self::Happy,
            Self::Happy => Self::Focused,
            Self::Focused => Self::Thinking,
            Self::Thinking => Self::Listening,
            Self::Listening => Self::Speaking,
            Self::Speaking => Self::Alert,
            Self::Alert => Self::Calm,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum EyeState {
    #[default]
    Open,
    Half,
    Blink,
    Wide,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MouthViseme {
    #[default]
    Closed,
    Rest,
    Mbp,
    Fv,
    Lth,
    Smile,
    Small,
    Mid,
    Round,
    Ee,
    Wide,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ActiveView {
    #[default]
    Home,
    Canvas,
    Thread,
    Queue,
    Cli,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AvatarMode {
    #[default]
    Halftone,
    Ascii3d,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AsciiShaderMode {
    #[default]
    Solid,
    Wire,
    Depth,
    Holo,
    Norm,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PhosphorTheme {
    #[default]
    Emerald,
    Cyan,
    Gold,
    Mono,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum HorizonMode {
    #[default]
    Silk,
    Peaks,
    Pulse,
    Ribbon,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum DotProfile {
    Crisp,
    #[default]
    Balanced,
    Phosphor,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum DensityMode {
    Compact,
    #[default]
    Comfortable,
    Airy,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SidebarPosition {
    #[default]
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SessionScopeTab {
    #[default]
    Sessions,
    Gateway,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum EntryRole {
    User,
    #[default]
    Hermes,
    Activity,
    Command,
    System,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityKind {
    Tool,
    Reasoning,
    Subagent,
    Commentary,
    Status,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalOutcome {
    Completed,
    Failed,
    Cancelled,
    Interrupted,
    IterationBudgetExhausted,
    AdmissionConflict,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TerminalEntry {
    pub id: String,
    pub channel_id: String,
    pub role: EntryRole,
    pub text: String,
    pub timestamp: String,
    pub created_at_ms: Option<u64>,
    pub streaming: bool,
    pub activity_kind: Option<ActivityKind>,
    pub activity_status: Option<String>,
    pub reasoning_detail: Option<String>,
    pub error_code: Option<String>,
    pub terminal_outcome: Option<TerminalOutcome>,
    pub model: Option<String>,
}

impl TerminalEntry {
    pub fn new(
        id: impl Into<String>,
        channel_id: impl Into<String>,
        role: EntryRole,
        text: impl Into<String>,
        timestamp: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            channel_id: channel_id.into(),
            role,
            text: text.into(),
            timestamp: timestamp.into(),
            created_at_ms: None,
            streaming: false,
            activity_kind: None,
            activity_status: None,
            reasoning_detail: None,
            error_code: None,
            terminal_outcome: None,
            model: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaskStepItem {
    pub text: String,
    pub done: bool,
    pub active: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TaskLifecycleStatus {
    #[default]
    Running,
    Paused,
    Completed,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BackgroundTask {
    pub id: String,
    pub channel_id: String,
    pub session_id: String,
    pub kind: Option<String>,
    pub background: Option<bool>,
    pub title: String,
    pub status: TaskLifecycleStatus,
    pub raw_status: Option<String>,
    pub progress: f32,
    pub progress_label: Option<String>,
    pub last_step: Option<String>,
    pub steps: Vec<TaskStepItem>,
    pub result: Option<String>,
    pub error_code: Option<String>,
    pub created_at_ms: Option<u64>,
    pub updated_at_ms: Option<u64>,
    pub agent_done_at_ms: Option<u64>,
    pub confirmed_at_ms: Option<u64>,
    pub updated_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalKind {
    #[default]
    Approval,
    Clarify,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChannelApprovalRequest {
    pub id: String,
    pub channel_id: String,
    pub run_id: Option<String>,
    pub request_id: String,
    pub execution_generation: u32,
    pub kind: ApprovalKind,
    pub title: String,
    pub tool_name: Option<String>,
    pub command: String,
    pub summary: String,
    pub destination: String,
    pub choices: Vec<String>,
    pub created_at: String,
    pub resolved: bool,
    pub resolution: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChannelMeta {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub session_id: String,
    pub unread: usize,
    pub origin: SessionOrigin,
    pub has_local_history: bool,
    pub model: Option<String>,
    pub updated_at_ms: Option<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SessionOrigin {
    #[default]
    Workspace,
    External,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    #[default]
    Idle,
    Thinking,
    Speaking,
    Running,
    Offline,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HermesAgentSession {
    pub channel_id: String,
    pub session_id: String,
    pub title: String,
    pub status: SessionStatus,
    pub model: String,
    pub source: String,
    pub last_message: String,
    pub updated_at_ms: Option<u64>,
    pub message_count: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum GatewayTransport {
    Runs,
    SessionStream,
    #[default]
    ChatCompletions,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct GatewayCapabilities {
    pub runs: bool,
    pub approvals: bool,
    pub clarify: bool,
    pub steering: bool,
    pub session_stream: bool,
    pub chat_completions: bool,
    pub skills: bool,
    pub toolsets: bool,
    pub cron_jobs: bool,
    pub profiles: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GatewayProfile {
    pub name: String,
    pub base_url: String,
    pub active: bool,
    pub online: bool,
    pub model: Option<String>,
    pub source: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct HermesGatewayInfo {
    pub online: bool,
    pub connected: bool,
    pub base_url: String,
    pub active_profile: String,
    pub model: String,
    pub active_transport: GatewayTransport,
    pub capabilities: GatewayCapabilities,
    pub version: Option<String>,
    pub latency_ms: Option<u64>,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HermesSkill {
    pub name: String,
    pub description: String,
    pub category: Option<String>,
    pub enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HermesToolset {
    pub name: String,
    pub description: String,
    pub tools: Vec<String>,
    pub enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HermesCronJob {
    pub id: String,
    pub name: String,
    pub schedule: String,
    pub prompt: String,
    pub channel_id: Option<String>,
    pub enabled: bool,
    pub last_run_at: Option<String>,
    pub next_run_at: Option<String>,
    pub last_status: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HermesModelOption {
    pub id: String,
    pub label: String,
    pub provider: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundPresetId {
    #[default]
    EmeraldAurora,
    AbyssGrid,
    CyberMist,
    SolarFlare,
    MidnightPulse,
    ObsidianSilk,
    PhosphorGrain,
}

impl BackgroundPresetId {
    pub fn label(self) -> &'static str {
        match self {
            Self::EmeraldAurora => "Emerald Aurora",
            Self::AbyssGrid => "Abyss Grid",
            Self::CyberMist => "Cyber Mist",
            Self::SolarFlare => "Solar Flare",
            Self::MidnightPulse => "Midnight Pulse",
            Self::ObsidianSilk => "Obsidian Silk",
            Self::PhosphorGrain => "Phosphor Grain",
        }
    }

    pub fn all() -> &'static [Self] {
        &[
            Self::EmeraldAurora,
            Self::AbyssGrid,
            Self::CyberMist,
            Self::SolarFlare,
            Self::MidnightPulse,
            Self::ObsidianSilk,
            Self::PhosphorGrain,
        ]
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BackgroundSettings {
    pub preset: BackgroundPresetId,
    pub opacity: f32,
    pub motion_speed: f32,
    pub intensity: f32,
}

impl Default for BackgroundSettings {
    fn default() -> Self {
        Self {
            preset: BackgroundPresetId::EmeraldAurora,
            opacity: 0.72,
            motion_speed: 1.0,
            intensity: 0.8,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UiCustomizationConfig {
    pub accent_hex: String,
    pub amber_hex: String,
    pub rose_hex: String,
    pub surface_hex: String,
    pub bg_hex: String,
    pub text_hex: String,
    pub portrait_tint_hex: Option<String>,
    pub dot_profile: DotProfile,
    pub bloom: f32,
    pub horizon_mode: HorizonMode,
    pub density: DensityMode,
    pub sidebar_position: SidebarPosition,
    pub sidebar_width: f32,
    pub sidebar_collapsed: bool,
    pub reduced_motion: bool,
    pub glass_opacity: f32,
    pub preset_name: String,
    pub custom_css_note: String,
}

impl Default for UiCustomizationConfig {
    fn default() -> Self {
        Self {
            accent_hex: "#34D399".to_string(),
            amber_hex: "#F59E0B".to_string(),
            rose_hex: "#F43F5E".to_string(),
            surface_hex: "#0A1410".to_string(),
            bg_hex: "#050C0A".to_string(),
            text_hex: "#ECF3F0".to_string(),
            portrait_tint_hex: None,
            dot_profile: DotProfile::Balanced,
            bloom: 0.38,
            horizon_mode: HorizonMode::Silk,
            density: DensityMode::Comfortable,
            sidebar_position: SidebarPosition::Left,
            sidebar_width: 296.0,
            sidebar_collapsed: false,
            reduced_motion: false,
            glass_opacity: 0.92,
            preset_name: "Voxcell Abyss".to_string(),
            custom_css_note: String::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct VoiceSettings {
    pub hands_free_vad: bool,
    pub tts_enabled: bool,
    pub tts_voice: String,
    pub stt_language: String,
    pub muted: bool,
    pub push_to_talk_active: bool,
    pub input_level: f32,
    pub output_level: f32,
    pub bands: [f32; 12],
}

impl Default for VoiceSettings {
    fn default() -> Self {
        Self {
            hands_free_vad: false,
            tts_enabled: true,
            tts_voice: "aura-2-thalia-en".to_string(),
            stt_language: "en-US".to_string(),
            muted: false,
            push_to_talk_active: false,
            input_level: 0.0,
            output_level: 0.0,
            bands: [0.0; 12],
        }
    }
}

pub type ChannelThinkMap = HashMap<String, bool>;
