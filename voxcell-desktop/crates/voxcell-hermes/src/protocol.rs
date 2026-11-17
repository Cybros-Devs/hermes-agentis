use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;
use voxcell_core::{
    ApprovalKind, GatewayCapabilities, GatewayTransport, HermesCronJob, HermesModelOption,
    HermesSkill, HermesToolset, SessionOrigin, TerminalOutcome,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileGatewayConfig {
    pub base_url: String,
    pub profile: String,
    pub api_key: String,
    pub route_prefix: String,
}

pub fn resolve_profile_gateway_config(
    base_url: Option<&str>,
    profile: Option<&str>,
    default_key: Option<&str>,
    profile_key: Option<&str>,
    env_vars: &HashMap<String, String>,
) -> ProfileGatewayConfig {
    let base = base_url
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("http://127.0.0.1:8642")
        .trim_end_matches('/')
        .to_string();

    let raw_profile = profile
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("default")
        .to_string();
    let is_default = raw_profile.eq_ignore_ascii_case("default");
    let route_prefix = if is_default {
        String::new()
    } else {
        format!("/p/{}", percent_encode_segment(&raw_profile))
    };

    let slug_env: String = raw_profile
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_uppercase() } else { '_' })
        .collect();
    let env_profile_key = env_vars
        .get(&format!("HERMES_API_KEY_{slug_env}"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let pkey = env_profile_key
        .or_else(|| {
            profile_key
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned)
        })
        .unwrap_or_default();
    let dkey = default_key
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("")
        .to_string();

    ProfileGatewayConfig {
        base_url: base,
        profile: raw_profile,
        api_key: if is_default || pkey.is_empty() {
            dkey
        } else {
            pkey
        },
        route_prefix,
    }
}

fn percent_encode_segment(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for b in raw.as_bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(*b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub fn build_gateway_url(cfg: &ProfileGatewayConfig, pathname: &str, unprefixed: bool) -> String {
    let clean = if pathname.starts_with('/') {
        pathname.to_string()
    } else {
        format!("/{pathname}")
    };
    let prefix = if unprefixed { "" } else { &cfg.route_prefix };
    format!("{}{prefix}{clean}", cfg.base_url)
}

pub fn sanitize_session_key_header(raw: Option<&str>) -> Option<String> {
    let s = raw?;
    let cleaned: String = s
        .chars()
        .filter(|&c| c != '\r' && c != '\n' && c != '\0')
        .collect::<String>()
        .trim()
        .to_string();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.chars().take(256).collect())
    }
}

pub fn create_idempotency_key(prefix: &str) -> String {
    let clean: String = prefix
        .chars()
        .map(|c| if ('!'..='~').contains(&c) { c } else { '-' })
        .take(32)
        .collect();
    let p = if clean.is_empty() { "voxcell" } else { clean.as_str() };
    let key = format!("{p}-{}", Uuid::new_v4());
    key.chars().take(255).collect()
}

pub fn parse_capabilities_payload(raw: &Value) -> Option<(GatewayCapabilities, Option<String>)> {
    let obj = raw.as_object()?;
    let features = obj.get("features").and_then(|v| v.as_object());
    let flag = |k: &str, default: bool| -> bool {
        features
            .and_then(|f| f.get(k))
            .and_then(|v| v.as_bool())
            .unwrap_or(default)
    };
    let profiles = obj
        .get("profiles")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|p| p.as_str().map(ToOwned::to_owned))
                .collect()
        })
        .unwrap_or_default();

    let caps = GatewayCapabilities {
        runs: flag("run_submission", false) && flag("run_events_sse", false),
        approvals: flag("run_approval", false),
        clarify: flag("run_clarify", false),
        steering: flag("run_steer", false),
        session_stream: flag("session_chat_stream", false),
        chat_completions: flag("chat_completions", true),
        skills: flag("skills", true),
        toolsets: flag("toolsets", true),
        cron_jobs: flag("cron_jobs", true),
        profiles,
    };
    let model = obj
        .get("model")
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned);
    Some((caps, model))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PreferredTransport {
    Auto,
    Runs,
    SessionStream,
    ChatCompletions,
}

pub fn choose_gateway_transport(
    preferred: PreferredTransport,
    caps: Option<&GatewayCapabilities>,
) -> GatewayTransport {
    let supports_runs = caps.is_some_and(|c| c.runs);
    let supports_session = caps.is_some_and(|c| c.session_stream);
    let supports_chat = caps.is_none_or(|c| c.chat_completions);
    let has_run_controls = caps.is_some_and(|c| c.approvals || c.steering);

    match preferred {
        PreferredTransport::Runs => {
            if supports_runs {
                GatewayTransport::Runs
            } else if supports_chat {
                GatewayTransport::ChatCompletions
            } else if supports_session {
                GatewayTransport::SessionStream
            } else {
                GatewayTransport::ChatCompletions
            }
        }
        PreferredTransport::SessionStream => {
            if supports_session {
                GatewayTransport::SessionStream
            } else if supports_runs {
                GatewayTransport::Runs
            } else {
                GatewayTransport::ChatCompletions
            }
        }
        PreferredTransport::ChatCompletions => {
            if supports_chat {
                GatewayTransport::ChatCompletions
            } else if supports_runs {
                GatewayTransport::Runs
            } else if supports_session {
                GatewayTransport::SessionStream
            } else {
                GatewayTransport::ChatCompletions
            }
        }
        PreferredTransport::Auto => {
            if supports_runs && has_run_controls {
                GatewayTransport::Runs
            } else if supports_runs {
                GatewayTransport::Runs
            } else if supports_session {
                GatewayTransport::SessionStream
            } else {
                GatewayTransport::ChatCompletions
            }
        }
    }
}

pub fn parse_model_options_payload(raw: &Value) -> (Vec<HermesModelOption>, Option<String>) {
    let Some(obj) = raw.as_object() else {
        return (Vec::new(), None);
    };
    let mut models: Vec<HermesModelOption> = Vec::new();
    let mut push_model = |val: &Value, provider: Option<String>| {
        if let Some(s) = val.as_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() && !models.iter().any(|m| m.id == trimmed) {
                models.push(HermesModelOption {
                    id: trimmed.to_string(),
                    label: trimmed.to_string(),
                    provider,
                });
            }
        } else if let Some(m) = val.as_object() {
            let id = m
                .get("id")
                .or_else(|| m.get("model"))
                .or_else(|| m.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if !id.is_empty() && !models.iter().any(|x| x.id == id) {
                let label = m
                    .get("label")
                    .and_then(|v| v.as_str())
                    .unwrap_or(id)
                    .to_string();
                let prov = m
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned)
                    .or(provider);
                models.push(HermesModelOption {
                    id: id.to_string(),
                    label,
                    provider: prov,
                });
            }
        }
    };

    for key in ["models", "data", "curated_models"] {
        if let Some(arr) = obj.get(key).and_then(|v| v.as_array()) {
            for item in arr {
                push_model(item, None);
            }
        }
    }
    if let Some(provs) = obj.get("providers").and_then(|v| v.as_array()) {
        for p in provs {
            if let Some(po) = p.as_object() {
                let pid = po
                    .get("id")
                    .or_else(|| po.get("slug"))
                    .or_else(|| po.get("name"))
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned);
                if let Some(pmodels) = po.get("models").and_then(|v| v.as_array()) {
                    for pm in pmodels {
                        push_model(pm, pid.clone());
                    }
                }
            }
        }
    }

    let selected = obj.get("selected").and_then(|v| v.as_object());
    let active_model = obj
        .get("current_model")
        .or_else(|| obj.get("active_model"))
        .or_else(|| obj.get("model"))
        .or_else(|| selected.and_then(|s| s.get("model")))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| models.first().map(|m| m.id.clone()));

    if let Some(active) = &active_model {
        if !models.iter().any(|m| &m.id == active) {
            models.insert(
                0,
                HermesModelOption {
                    id: active.clone(),
                    label: active.clone(),
                    provider: None,
                },
            );
        }
    }
    (models, active_model)
}

pub fn map_gateway_skills(raw: &Value) -> Vec<HermesSkill> {
    let list = raw
        .as_array()
        .or_else(|| raw.get("skills").and_then(|v| v.as_array()))
        .or_else(|| raw.get("data").and_then(|v| v.as_array()));
    let Some(items) = list else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let obj = item.as_object()?;
            let name = obj.get("name")?.as_str()?.trim();
            if name.is_empty() {
                return None;
            }
            let description = obj
                .get("description")
                .or_else(|| obj.get("summary"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let category = obj
                .get("category")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string());
            let enabled = obj
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            Some(HermesSkill {
                name: name.to_string(),
                description,
                category,
                enabled,
            })
        })
        .collect()
}

pub fn map_gateway_toolsets(raw: &Value) -> Vec<HermesToolset> {
    let list = raw
        .as_array()
        .or_else(|| raw.get("toolsets").and_then(|v| v.as_array()))
        .or_else(|| raw.get("data").and_then(|v| v.as_array()));
    let Some(items) = list else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            if let Some(s) = item.as_str() {
                let name = s.trim();
                if name.is_empty() {
                    return None;
                }
                return Some(HermesToolset {
                    name: name.to_string(),
                    description: String::new(),
                    tools: Vec::new(),
                    enabled: true,
                });
            }
            let obj = item.as_object()?;
            let name = obj.get("name")?.as_str()?.trim();
            if name.is_empty() {
                return None;
            }
            let tools = obj
                .get("tools")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|t| t.as_str().map(ToOwned::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            Some(HermesToolset {
                name: name.to_string(),
                description: obj
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string(),
                tools,
                enabled: obj
                    .get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true),
            })
        })
        .collect()
}

pub fn map_gateway_jobs(raw: &Value) -> Vec<HermesCronJob> {
    let list = raw
        .as_array()
        .or_else(|| raw.get("jobs").and_then(|v| v.as_array()))
        .or_else(|| raw.get("data").and_then(|v| v.as_array()));
    let Some(items) = list else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let obj = item.as_object()?;
            let id = obj
                .get("id")
                .or_else(|| obj.get("job_id"))
                .or_else(|| obj.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if id.is_empty() {
                return None;
            }
            let paused = obj.get("paused").and_then(|v| v.as_bool()).unwrap_or(false)
                || obj
                    .get("status")
                    .and_then(|v| v.as_str())
                    .is_some_and(|s| s.eq_ignore_ascii_case("paused"))
                || obj.get("enabled").and_then(|v| v.as_bool()) == Some(false);
            let enabled = obj
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(!paused);
            Some(HermesCronJob {
                id: id.to_string(),
                name: obj
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(id)
                    .to_string(),
                schedule: obj
                    .get("schedule")
                    .or_else(|| obj.get("cron"))
                    .or_else(|| obj.get("schedule_display"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("* * * * *")
                    .to_string(),
                prompt: obj
                    .get("prompt")
                    .or_else(|| obj.get("command"))
                    .or_else(|| obj.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(id)
                    .to_string(),
                channel_id: obj
                    .get("channel_id")
                    .or_else(|| obj.get("delivery_target"))
                    .or_else(|| obj.get("channel"))
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned),
                enabled,
                last_run_at: obj
                    .get("last_run_at")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned),
                next_run_at: obj
                    .get("next_run_at")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned),
                last_status: obj
                    .get("last_status")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned),
            })
        })
        .collect()
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GatewaySessionRecord {
    pub id: String,
    pub session_key: Option<String>,
    pub title: Option<String>,
    pub source: Option<String>,
    pub model: Option<String>,
    pub message_count: usize,
    pub last_message: Option<String>,
    pub updated_at_ms: Option<u64>,
    pub origin: SessionOrigin,
}

fn to_epoch_ms(val: Option<&Value>) -> Option<u64> {
    let v = val?;
    if let Some(n) = v.as_f64() {
        if n.is_finite() && n >= 0.0 {
            return Some(if n < 10_000_000_000.0 {
                (n * 1000.0).round() as u64
            } else {
                n.round() as u64
            });
        }
    }
    if let Some(s) = v.as_str() {
        if let Ok(n) = s.trim().parse::<f64>() {
            if n.is_finite() && n >= 0.0 {
                return Some(if n < 10_000_000_000.0 {
                    (n * 1000.0).round() as u64
                } else {
                    n.round() as u64
                });
            }
        }
    }
    None
}

pub fn classify_gateway_session_origin(
    session_id: Option<&str>,
    session_key: Option<&str>,
    source: Option<&str>,
) -> SessionOrigin {
    let key = session_key.unwrap_or("").trim().to_ascii_lowercase();
    if key.starts_with("voxcell-") {
        return SessionOrigin::Workspace;
    }
    let src = source.unwrap_or("").trim().to_ascii_lowercase();
    if matches!(src.as_str(), "web" | "voxcell" | "ui" | "desktop") {
        return SessionOrigin::Workspace;
    }
    if matches!(
        src.as_str(),
        "cli" | "cron" | "scheduler" | "daemon" | "telegram" | "discord" | "slack" | "whatsapp" | "signal"
    ) {
        return SessionOrigin::External;
    }
    let sid = session_id.unwrap_or("").trim().to_ascii_lowercase();
    if sid.starts_with("local-") || (sid.starts_with("hermes-") && !sid.contains("cron")) {
        return SessionOrigin::Workspace;
    }
    SessionOrigin::External
}

pub fn map_gateway_sessions(raw: &Value) -> Vec<GatewaySessionRecord> {
    let list = raw
        .as_array()
        .or_else(|| raw.get("sessions").and_then(|v| v.as_array()))
        .or_else(|| raw.get("data").and_then(|v| v.as_array()));
    let Some(items) = list else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let obj = item.as_object()?;
            let id = obj
                .get("session_id")
                .or_else(|| obj.get("id"))
                .and_then(|v| v.as_str())?
                .trim();
            if id.is_empty() {
                return None;
            }
            let session_key = obj
                .get("session_key")
                .or_else(|| obj.get("sessionKey"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string());
            let source = obj
                .get("source")
                .and_then(|v| v.as_str())
                .map(ToOwned::to_owned);
            let origin = classify_gateway_session_origin(
                Some(id),
                session_key.as_deref(),
                source.as_deref(),
            );
            Some(GatewaySessionRecord {
                id: id.to_string(),
                session_key,
                title: obj
                    .get("title")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned),
                source,
                model: obj
                    .get("model")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned),
                message_count: obj
                    .get("message_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as usize,
                last_message: obj
                    .get("last_message")
                    .or_else(|| obj.get("preview"))
                    .or_else(|| obj.get("first_prompt"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string()),
                updated_at_ms: to_epoch_ms(
                    obj.get("updated_at")
                        .or_else(|| obj.get("last_active_at"))
                        .or_else(|| obj.get("created_at")),
                ),
                origin,
            })
        })
        .collect()
}

// ---------------------------------------------------------------------------
// SSE Line Decoder & Event Parsers
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SseFrame {
    pub event: String,
    pub data: String,
}

#[derive(Default)]
pub struct SseLineDecoder {
    buffer: String,
    current_event: String,
    data_lines: Vec<String>,
    pub keepalive_count: usize,
}

impl SseLineDecoder {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            current_event: "message".to_string(),
            data_lines: Vec::new(),
            keepalive_count: 0,
        }
    }

    pub fn push(&mut self, chunk: &str) -> Vec<SseFrame> {
        self.buffer.push_str(chunk);
        let mut frames = Vec::new();
        while let Some(nl_idx) = self.buffer.find('\n') {
            let line = self.buffer[..nl_idx].trim_end_matches('\r').to_string();
            self.buffer.drain(..=nl_idx);

            if line.is_empty() {
                if !self.data_lines.is_empty() {
                    frames.push(SseFrame {
                        event: if self.current_event.is_empty() {
                            "message".to_string()
                        } else {
                            self.current_event.clone()
                        },
                        data: self.data_lines.join("\n"),
                    });
                }
                self.current_event = "message".to_string();
                self.data_lines.clear();
                continue;
            }

            if line.starts_with(':') {
                self.keepalive_count += 1;
                continue;
            }

            if let Some(rest) = line.strip_prefix("event:") {
                let ev = rest.trim();
                self.current_event = if ev.is_empty() {
                    "message".to_string()
                } else {
                    ev.to_string()
                };
                continue;
            }

            if let Some(rest) = line.strip_prefix("data:") {
                let data = rest.strip_prefix(' ').unwrap_or(rest);
                self.data_lines.push(data.to_string());
            }
        }
        frames
    }

    pub fn flush(&mut self) -> Vec<SseFrame> {
        let mut frames = Vec::new();
        if !self.buffer.trim().is_empty() {
            let tail = self.buffer.trim_end_matches('\r').to_string();
            self.buffer.clear();
            if tail.starts_with(':') {
                self.keepalive_count += 1;
            } else if let Some(rest) = tail.strip_prefix("data:") {
                let data = rest.strip_prefix(' ').unwrap_or(rest);
                self.data_lines.push(data.to_string());
            }
        }
        if !self.data_lines.is_empty() {
            frames.push(SseFrame {
                event: if self.current_event.is_empty() {
                    "message".to_string()
                } else {
                    self.current_event.clone()
                },
                data: self.data_lines.join("\n"),
            });
        }
        self.current_event = "message".to_string();
        self.data_lines.clear();
        frames
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ParsedToolEvent {
    pub phase: String,
    pub tool_name: String,
    pub label: String,
    pub status: String,
    pub summary: String,
    pub error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedApprovalRequest {
    pub request_id: String,
    pub execution_generation: u32,
    pub kind: ApprovalKind,
    pub title: String,
    pub tool_name: Option<String>,
    pub command: String,
    pub summary: String,
    pub destination: String,
    pub choices: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum StreamSignal {
    ContentDelta { accumulated: String, chunk: String },
    ReasoningDelta { accumulated: String, chunk: String },
    Interim { text: String, already_streamed: bool },
    ToolEvent(ParsedToolEvent),
    ApprovalRequest(ParsedApprovalRequest),
    SubagentStart { summary: String, child_session_id: Option<String> },
    SubagentComplete { status: String, summary: String, child_session_id: Option<String> },
    Steered(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StreamTerminalResult {
    pub output: String,
    pub reasoning: String,
    pub outcome: TerminalTurnResultKind,
    pub error: Option<String>,
    pub error_code: Option<String>,
    pub model: Option<String>,
}

pub type TerminalTurnResultKind = TerminalOutcome;

pub struct RunsEventStreamParser {
    sse: SseLineDecoder,
    content: String,
    reasoning: String,
    final_output: Option<String>,
    outcome: Option<TerminalOutcome>,
    error: Option<String>,
    error_code: Option<String>,
    model: Option<String>,
}

impl Default for RunsEventStreamParser {
    fn default() -> Self {
        Self::new()
    }
}

impl RunsEventStreamParser {
    pub fn new() -> Self {
        Self {
            sse: SseLineDecoder::new(),
            content: String::new(),
            reasoning: String::new(),
            final_output: None,
            outcome: None,
            error: None,
            error_code: None,
            model: None,
        }
    }

    pub fn push(&mut self, chunk: &str) -> Vec<StreamSignal> {
        let mut signals = Vec::new();
        for frame in self.sse.push(chunk) {
            self.handle_frame(&frame, &mut signals);
        }
        signals
    }

    pub fn finish(&mut self) -> (Vec<StreamSignal>, StreamTerminalResult) {
        let mut signals = Vec::new();
        for frame in self.sse.flush() {
            self.handle_frame(&frame, &mut signals);
        }
        let output = self
            .final_output
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| self.content.clone());
        let outcome = self.outcome.unwrap_or_else(|| {
            if self.error.is_some() {
                TerminalOutcome::Failed
            } else {
                TerminalOutcome::Completed
            }
        });
        (
            signals,
            StreamTerminalResult {
                output,
                reasoning: self.reasoning.clone(),
                outcome,
                error: self.error.clone(),
                error_code: self.error_code.clone(),
                model: self.model.clone(),
            },
        )
    }

    fn handle_frame(&mut self, frame: &SseFrame, out: &mut Vec<StreamSignal>) {
        let trimmed = frame.data.trim();
        if trimmed.is_empty() || trimmed == "[DONE]" {
            return;
        }
        let Ok(payload) = serde_json::from_str::<Value>(trimmed) else {
            return;
        };
        let Some(obj) = payload.as_object() else {
            return;
        };
        let ev_type = obj
            .get("type")
            .or_else(|| obj.get("event"))
            .and_then(|v| v.as_str())
            .unwrap_or(&frame.event);

        match ev_type {
            "message.reasoning" | "reasoning.delta" => {
                if let Some(c) = obj.get("delta").or_else(|| obj.get("text")).and_then(|v| v.as_str()) {
                    if !c.is_empty() {
                        self.reasoning.push_str(c);
                        out.push(StreamSignal::ReasoningDelta {
                            accumulated: self.reasoning.clone(),
                            chunk: c.to_string(),
                        });
                    }
                }
            }
            "message.delta" | "assistant.delta" => {
                if let Some(rc) = obj.get("reasoning_content").and_then(|v| v.as_str()) {
                    if !rc.is_empty() {
                        self.reasoning.push_str(rc);
                        out.push(StreamSignal::ReasoningDelta {
                            accumulated: self.reasoning.clone(),
                            chunk: rc.to_string(),
                        });
                    }
                }
                if let Some(c) = obj
                    .get("delta")
                    .or_else(|| obj.get("text"))
                    .or_else(|| obj.get("content"))
                    .and_then(|v| v.as_str())
                {
                    if !c.is_empty() {
                        self.content.push_str(c);
                        out.push(StreamSignal::ContentDelta {
                            accumulated: self.content.clone(),
                            chunk: c.to_string(),
                        });
                    }
                }
            }
            "message.interim" | "assistant.commentary" => {
                if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                    if !text.trim().is_empty() {
                        out.push(StreamSignal::Interim {
                            text: text.to_string(),
                            already_streamed: obj
                                .get("already_streamed")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false),
                        });
                    }
                }
            }
            "tool.started" => {
                let tool_name = obj
                    .get("tool")
                    .or_else(|| obj.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("tool")
                    .to_string();
                let preview = obj
                    .get("preview")
                    .or_else(|| obj.get("args_preview"))
                    .or_else(|| obj.get("args"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                out.push(StreamSignal::ToolEvent(ParsedToolEvent {
                    phase: "started".to_string(),
                    label: if preview.is_empty() {
                        tool_name.clone()
                    } else {
                        format!("{tool_name}: {preview}")
                    },
                    summary: if preview.is_empty() {
                        format!("Running {tool_name}")
                    } else {
                        format!("{tool_name}: {preview}")
                    },
                    tool_name,
                    status: "running".to_string(),
                    error: None,
                }));
            }
            "tool.completed" | "tool.failed" => {
                let tool_name = obj
                    .get("tool")
                    .or_else(|| obj.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("tool")
                    .to_string();
                let err_str = obj
                    .get("error")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned);
                let is_err = ev_type == "tool.failed" || err_str.is_some();
                let preview = obj
                    .get("preview")
                    .or_else(|| obj.get("result"))
                    .and_then(|v| v.as_str())
                    .or(err_str.as_deref())
                    .unwrap_or("")
                    .trim();
                out.push(StreamSignal::ToolEvent(ParsedToolEvent {
                    phase: if is_err { "failed" } else { "completed" }.to_string(),
                    label: if preview.is_empty() {
                        tool_name.clone()
                    } else {
                        format!("{tool_name}: {preview}")
                    },
                    summary: if preview.is_empty() {
                        format!(
                            "{tool_name} {}",
                            if is_err { "failed" } else { "completed" }
                        )
                    } else {
                        format!("{tool_name}: {preview}")
                    },
                    tool_name,
                    status: if is_err { "failed" } else { "done" }.to_string(),
                    error: err_str,
                }));
            }
            "approval.request" | "clarify.request" => {
                let request_id = obj
                    .get("request_id")
                    .or_else(|| obj.get("prompt_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if !request_id.is_empty() {
                    let tool_name = obj
                        .get("tool")
                        .or_else(|| obj.get("tool_name"))
                        .and_then(|v| v.as_str())
                        .map(ToOwned::to_owned);
                    let command = obj
                        .get("command")
                        .or_else(|| obj.get("args_preview"))
                        .or_else(|| obj.get("draft"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let choices = obj
                        .get("choices")
                        .and_then(|v| v.as_array())
                        .map(|a| {
                            a.iter()
                                .filter_map(|x| x.as_str().map(ToOwned::to_owned))
                                .collect::<Vec<_>>()
                        })
                        .filter(|v| !v.is_empty())
                        .unwrap_or_else(|| vec!["once".into(), "always".into(), "deny".into()]);
                    out.push(StreamSignal::ApprovalRequest(ParsedApprovalRequest {
                        request_id,
                        execution_generation: obj
                            .get("execution_generation")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(1) as u32,
                        kind: if ev_type == "clarify.request" {
                            ApprovalKind::Clarify
                        } else {
                            ApprovalKind::Approval
                        },
                        title: obj
                            .get("title")
                            .and_then(|v| v.as_str())
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| {
                                tool_name
                                    .as_ref()
                                    .map(|t| format!("Approve {t}"))
                                    .unwrap_or_else(|| "Approval required".to_string())
                            }),
                        destination: obj
                            .get("destination")
                            .and_then(|v| v.as_str())
                            .map(ToOwned::to_owned)
                            .or_else(|| tool_name.clone())
                            .unwrap_or_else(|| "hermes-run".to_string()),
                        tool_name,
                        summary: obj
                            .get("description")
                            .or_else(|| obj.get("summary"))
                            .and_then(|v| v.as_str())
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| {
                                if command.is_empty() {
                                    "Hermes run paused awaiting approval.".to_string()
                                } else {
                                    format!("Execute: {command}")
                                }
                            }),
                        command,
                        choices,
                    }));
                }
            }
            "subagent.start" => {
                let summary = obj
                    .get("summary")
                    .or_else(|| obj.get("task"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Subagent spawned")
                    .to_string();
                out.push(StreamSignal::SubagentStart {
                    summary,
                    child_session_id: obj
                        .get("child_session_id")
                        .and_then(|v| v.as_str())
                        .map(ToOwned::to_owned),
                });
            }
            "subagent.complete" => {
                let status = obj
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("completed")
                    .to_string();
                let summary = obj
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| format!("Subagent {status}"));
                out.push(StreamSignal::SubagentComplete {
                    status,
                    summary,
                    child_session_id: obj
                        .get("child_session_id")
                        .and_then(|v| v.as_str())
                        .map(ToOwned::to_owned),
                });
            }
            "run.steered" => {
                if let Some(t) = obj.get("text").and_then(|v| v.as_str()) {
                    if !t.is_empty() {
                        out.push(StreamSignal::Steered(t.to_string()));
                    }
                }
            }
            "run.completed" => {
                if let Some(output) = obj.get("output").and_then(|v| v.as_str()) {
                    self.final_output = Some(output.to_string());
                }
                if self.reasoning.is_empty() {
                    if let Some(r) = obj.get("reasoning_content").and_then(|v| v.as_str()) {
                        self.reasoning = r.to_string();
                    }
                }
                let ec = obj
                    .get("error_code")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned);
                if ec.as_deref() == Some("iteration_budget_exhausted") {
                    self.error_code = ec;
                    self.outcome = Some(TerminalOutcome::IterationBudgetExhausted);
                } else {
                    self.outcome = Some(TerminalOutcome::Completed);
                }
                if let Some(m) = obj
                    .get("runtime")
                    .and_then(|r| r.get("model"))
                    .and_then(|v| v.as_str())
                {
                    self.model = Some(m.to_string());
                }
            }
            "run.failed" => {
                self.outcome = Some(TerminalOutcome::Failed);
                self.error = Some(
                    obj.get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Run failed")
                        .to_string(),
                );
                self.error_code = obj
                    .get("error_code")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned);
            }
            "run.cancelled" => {
                self.outcome = Some(TerminalOutcome::Cancelled);
                self.error = obj
                    .get("error")
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned);
            }
            "run.interrupted" => {
                self.outcome = Some(TerminalOutcome::Interrupted);
                self.error = Some(
                    obj.get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Gateway shutdown interrupted the run.")
                        .to_string(),
                );
            }
            _ => {}
        }
    }
}

pub struct ChatCompletionsStreamParser {
    sse: SseLineDecoder,
    content: String,
    reasoning: String,
    finish_reason: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
}

impl Default for ChatCompletionsStreamParser {
    fn default() -> Self {
        Self::new()
    }
}

impl ChatCompletionsStreamParser {
    pub fn new() -> Self {
        Self {
            sse: SseLineDecoder::new(),
            content: String::new(),
            reasoning: String::new(),
            finish_reason: None,
            error_code: None,
            error_message: None,
        }
    }

    pub fn push(&mut self, chunk: &str) -> Vec<StreamSignal> {
        let mut signals = Vec::new();
        for frame in self.sse.push(chunk) {
            self.handle_frame(&frame, &mut signals);
        }
        signals
    }

    pub fn finish(&mut self) -> (Vec<StreamSignal>, StreamTerminalResult) {
        let mut signals = Vec::new();
        for frame in self.sse.flush() {
            self.handle_frame(&frame, &mut signals);
        }
        let outcome = if self.error_code.as_deref() == Some("admission_conflict") {
            TerminalOutcome::AdmissionConflict
        } else {
            match self.finish_reason.as_deref() {
                Some("cancelled") => TerminalOutcome::Cancelled,
                Some("error") => TerminalOutcome::Failed,
                Some("length")
                    if self.error_code.as_deref() == Some("iteration_budget_exhausted") =>
                {
                    TerminalOutcome::IterationBudgetExhausted
                }
                _ => TerminalOutcome::Completed,
            }
        };
        (
            signals,
            StreamTerminalResult {
                output: self.content.clone(),
                reasoning: self.reasoning.clone(),
                outcome,
                error: self.error_message.clone(),
                error_code: self.error_code.clone(),
                model: None,
            },
        )
    }

    fn handle_frame(&mut self, frame: &SseFrame, out: &mut Vec<StreamSignal>) {
        let trimmed = frame.data.trim();
        if trimmed.is_empty() || trimmed == "[DONE]" {
            return;
        }
        let Ok(payload) = serde_json::from_str::<Value>(trimmed) else {
            return;
        };
        let Some(obj) = payload.as_object() else {
            return;
        };
        if frame.event == "hermes.tool.progress" {
            let tool_name = obj
                .get("tool")
                .or_else(|| obj.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("tool")
                .to_string();
            let status = obj
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("running")
                .to_string();
            let detail = obj
                .get("summary")
                .or_else(|| obj.get("label"))
                .or_else(|| obj.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            let lower_s = status.to_ascii_lowercase();
            let phase = if lower_s == "failed" || lower_s == "error" {
                "failed"
            } else if lower_s == "done" || lower_s == "completed" {
                "completed"
            } else {
                "progress"
            };
            out.push(StreamSignal::ToolEvent(ParsedToolEvent {
                phase: phase.to_string(),
                label: if detail.is_empty() {
                    tool_name.clone()
                } else {
                    format!("{tool_name}: {detail}")
                },
                summary: if detail.is_empty() {
                    format!("Running {tool_name}")
                } else {
                    format!("{tool_name}: {detail}")
                },
                tool_name,
                status,
                error: None,
            }));
            return;
        }

        if let Some(ec) = obj
            .get("hermes")
            .and_then(|h| h.get("error_code"))
            .and_then(|v| v.as_str())
        {
            self.error_code = Some(ec.to_string());
        }
        if let Some(err) = obj.get("error").and_then(|v| v.as_object()) {
            if let Some(c) = err.get("code").and_then(|v| v.as_str()) {
                self.error_code = Some(c.to_string());
            }
            if let Some(m) = err.get("message").and_then(|v| v.as_str()) {
                self.error_message = Some(m.to_string());
            }
        }
        let Some(first) = obj
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_object())
        else {
            return;
        };
        if let Some(fr) = first.get("finish_reason").and_then(|v| v.as_str()) {
            self.finish_reason = Some(fr.to_string());
        }
        let delta = first
            .get("delta")
            .or_else(|| first.get("message"))
            .and_then(|v| v.as_object());
        if let Some(d) = delta {
            if let Some(rc) = d
                .get("reasoning_content")
                .or_else(|| d.get("reasoning"))
                .and_then(|v| v.as_str())
            {
                if !rc.is_empty() {
                    self.reasoning.push_str(rc);
                    out.push(StreamSignal::ReasoningDelta {
                        accumulated: self.reasoning.clone(),
                        chunk: rc.to_string(),
                    });
                }
            }
            if let Some(cc) = d.get("content").and_then(|v| v.as_str()) {
                if !cc.is_empty() {
                    self.content.push_str(cc);
                    out.push(StreamSignal::ContentDelta {
                        accumulated: self.content.clone(),
                        chunk: cc.to_string(),
                    });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_profile_prefixed_urls() {
        let env = HashMap::from([(
            "HERMES_API_KEY_RESEARCH_LAB".to_string(),
            "secret-lab".to_string(),
        )]);
        let cfg = resolve_profile_gateway_config(
            Some("http://127.0.0.1:8642/"),
            Some("research lab"),
            Some("default-key"),
            None,
            &env,
        );
        assert_eq!(cfg.route_prefix, "/p/research%20lab");
        assert_eq!(cfg.api_key, "secret-lab");
        assert_eq!(
            build_gateway_url(&cfg, "/v1/runs", false),
            "http://127.0.0.1:8642/p/research%20lab/v1/runs"
        );
        assert_eq!(
            build_gateway_url(&cfg, "/health", true),
            "http://127.0.0.1:8642/health"
        );
    }

    #[test]
    fn decodes_sse_with_keepalive_and_runs_events() {
        let mut parser = RunsEventStreamParser::new();
        let s1 = parser.push(": keepalive\n\ndata: {\"event\":\"message.reasoning\",\"delta\":\"think \"}\n\n");
        assert_eq!(s1.len(), 1);
        let s2 = parser.push(
            "data: {\"event\":\"tool.started\",\"tool\":\"terminal\",\"preview\":\"cargo test\"}\n\n\
             data: {\"event\":\"approval.request\",\"request_id\":\"req-1\",\"tool\":\"terminal\",\"command\":\"rm -rf tmp\"}\n\n\
             data: {\"event\":\"message.delta\",\"delta\":\"Hello \"}\n\n\
             data: {\"event\":\"run.completed\",\"output\":\"\"}\n\n",
        );
        assert_eq!(s2.len(), 3);
        let (_, res) = parser.finish();
        assert_eq!(res.output, "Hello ");
        assert_eq!(res.reasoning, "think ");
        assert_eq!(res.outcome, TerminalOutcome::Completed);
    }
}
