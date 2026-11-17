use crate::types::{ActiveView, AvatarMode};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SlashCommandSpec {
    pub name: &'static str,
    pub aliases: &'static [&'static str],
    pub usage: &'static str,
    pub description: &'static str,
}

pub const SLASH_COMMANDS: &[SlashCommandSpec] = &[
    SlashCommandSpec { name: "/help", aliases: &["/?", "/h"], usage: "/help", description: "Show all slash commands and desktop shortcuts" },
    SlashCommandSpec { name: "/new", aliases: &["/n"], usage: "/new [title]", description: "Create a new Hermes workspace session" },
    SlashCommandSpec { name: "/reset", aliases: &[], usage: "/reset", description: "Reset conversation history for the active session" },
    SlashCommandSpec { name: "/sessions", aliases: &["/ls"], usage: "/sessions", description: "List workspace and gateway Hermes sessions" },
    SlashCommandSpec { name: "/resume", aliases: &["/switch"], usage: "/resume <id-or-name>", description: "Switch active thread to a matching session" },
    SlashCommandSpec { name: "/model", aliases: &["/m"], usage: "/model [id]", description: "Show or select active Hermes model" },
    SlashCommandSpec { name: "/status", aliases: &[], usage: "/status", description: "Print gateway status, transport, latency, and active profile" },
    SlashCommandSpec { name: "/gateway", aliases: &["/gw"], usage: "/gateway [url]", description: "Inspect or change Hermes gateway base URL" },
    SlashCommandSpec { name: "/profile", aliases: &["/p"], usage: "/profile [name]", description: "Show or switch active ~/.hermes profile" },
    SlashCommandSpec { name: "/skills", aliases: &[], usage: "/skills", description: "List available Hermes skills and enable state" },
    SlashCommandSpec { name: "/toolsets", aliases: &[], usage: "/toolsets", description: "List Hermes toolsets and exposed tools" },
    SlashCommandSpec { name: "/cron", aliases: &["/jobs"], usage: "/cron [pause|resume|run <id>]", description: "Inspect or control Hermes cron jobs" },
    SlashCommandSpec { name: "/tasks", aliases: &["/bg"], usage: "/tasks", description: "Show active, paused, and completed turn/background tasks" },
    SlashCommandSpec { name: "/queue", aliases: &["/approvals"], usage: "/queue", description: "Open Queue view for approvals, skills, and cron jobs" },
    SlashCommandSpec { name: "/approve", aliases: &[], usage: "/approve [once|always|deny]", description: "Resolve the latest pending approval gate" },
    SlashCommandSpec { name: "/stop", aliases: &["/cancel"], usage: "/stop", description: "Cancel the currently streaming Hermes run" },
    SlashCommandSpec { name: "/clear", aliases: &["/cls"], usage: "/clear", description: "Clear local terminal scrollback output" },
    SlashCommandSpec { name: "/voice", aliases: &["/mic"], usage: "/voice [on|off|ptt]", description: "Toggle hands-free VAD or push-to-talk audio" },
    SlashCommandSpec { name: "/tts", aliases: &["/mute"], usage: "/tts [on|off]", description: "Toggle Deepgram Aura-2 voice synthesis" },
    SlashCommandSpec { name: "/home", aliases: &[], usage: "/home", description: "Switch to Home stage view" },
    SlashCommandSpec { name: "/canvas", aliases: &["/dots"], usage: "/canvas", description: "Switch to spatial Canvas view" },
    SlashCommandSpec { name: "/thread", aliases: &["/chat"], usage: "/thread", description: "Switch to Thread view" },
    SlashCommandSpec { name: "/mode", aliases: &["/3d"], usage: "/mode [halftone|3d]", description: "Switch avatar renderer between Halftone and 3D ASCII" },
    SlashCommandSpec { name: "/ui", aliases: &["/theme"], usage: "/ui <preset or natural-language edit>", description: "Apply a theme preset or natural-language UI tweak" },
    SlashCommandSpec { name: "/phone", aliases: &["/widget"], usage: "/phone [open|close]", description: "Toggle the floating Phone Video Widget" },
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CliAction {
    PrintHelp(String),
    NewSession(Option<String>),
    ResetActiveSession,
    ListSessions,
    ResumeSession(String),
    SetModel(Option<String>),
    ShowStatus,
    SetGateway(Option<String>),
    SetProfile(Option<String>),
    ListSkills,
    ListToolsets,
    CronCommand(Option<String>),
    ListTasks,
    SwitchView(ActiveView),
    ResolveApproval(String),
    StopActiveRun,
    ClearTerminal,
    VoiceControl(Option<String>),
    TtsControl(Option<String>),
    SetAvatarMode(Option<AvatarMode>),
    ApplyUiCustomization(String),
    TogglePhoneWidget(Option<bool>),
    SendPrompt(String),
    UnknownCommand(String),
}

pub fn parse_cli_input(raw: &str) -> CliAction {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return CliAction::PrintHelp(render_help_text());
    }
    if !trimmed.starts_with('/') {
        return CliAction::SendPrompt(trimmed.to_string());
    }

    let mut parts = trimmed.splitn(2, char::is_whitespace);
    let cmd = parts.next().unwrap_or("").to_ascii_lowercase();
    let arg = parts
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);

    match cmd.as_str() {
        "/help" | "/?" | "/h" => CliAction::PrintHelp(render_help_text()),
        "/new" | "/n" => CliAction::NewSession(arg),
        "/reset" => CliAction::ResetActiveSession,
        "/sessions" | "/ls" => CliAction::ListSessions,
        "/resume" | "/switch" => match arg {
            Some(target) => CliAction::ResumeSession(target),
            None => CliAction::ListSessions,
        },
        "/model" | "/m" => CliAction::SetModel(arg),
        "/status" => CliAction::ShowStatus,
        "/gateway" | "/gw" => CliAction::SetGateway(arg),
        "/profile" | "/p" => CliAction::SetProfile(arg),
        "/skills" => CliAction::ListSkills,
        "/toolsets" => CliAction::ListToolsets,
        "/cron" | "/jobs" => CliAction::CronCommand(arg),
        "/tasks" | "/bg" => CliAction::ListTasks,
        "/queue" | "/approvals" => CliAction::SwitchView(ActiveView::Queue),
        "/approve" => CliAction::ResolveApproval(arg.unwrap_or_else(|| "once".to_string())),
        "/stop" | "/cancel" => CliAction::StopActiveRun,
        "/clear" | "/cls" => CliAction::ClearTerminal,
        "/voice" | "/mic" => CliAction::VoiceControl(arg),
        "/tts" | "/mute" => CliAction::TtsControl(arg),
        "/home" => CliAction::SwitchView(ActiveView::Home),
        "/canvas" | "/dots" => CliAction::SwitchView(ActiveView::Canvas),
        "/thread" | "/chat" => CliAction::SwitchView(ActiveView::Thread),
        "/mode" | "/3d" => {
            let m = match arg.as_deref().map(str::to_ascii_lowercase).as_deref() {
                Some("3d") | Some("ascii3d") => Some(AvatarMode::Ascii3d),
                Some("halftone") | Some("2d") => Some(AvatarMode::Halftone),
                _ => None,
            };
            CliAction::SetAvatarMode(m)
        }
        "/ui" | "/theme" => CliAction::ApplyUiCustomization(arg.unwrap_or_default()),
        "/phone" | "/widget" => {
            let toggle = match arg.as_deref().map(str::to_ascii_lowercase).as_deref() {
                Some("open") | Some("on") | Some("show") => Some(true),
                Some("close") | Some("off") | Some("hide") => Some(false),
                _ => None,
            };
            CliAction::TogglePhoneWidget(toggle)
        }
        _ => CliAction::UnknownCommand(cmd),
    }
}

pub fn autocomplete_slash_commands(prefix: &str) -> Vec<&'static SlashCommandSpec> {
    let trimmed = prefix.trim().to_ascii_lowercase();
    if !trimmed.starts_with('/') {
        return Vec::new();
    }
    SLASH_COMMANDS
        .iter()
        .filter(|spec| {
            spec.name.starts_with(&trimmed)
                || spec.aliases.iter().any(|a| a.starts_with(&trimmed))
        })
        .collect()
}

pub fn render_help_text() -> String {
    let mut out = String::from("Hermes Duet CLI Commands:\n");
    for spec in SLASH_COMMANDS {
        out.push_str(&format!("  {:<22} {}\n", spec.usage, spec.description));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_all_slash_commands_and_prompts() {
        assert_eq!(SLASH_COMMANDS.len(), 25);
        assert!(matches!(parse_cli_input("/help"), CliAction::PrintHelp(_)));
        assert_eq!(
            parse_cli_input("/resume hermes-ops"),
            CliAction::ResumeSession("hermes-ops".into())
        );
        assert_eq!(
            parse_cli_input("/ui switch to cyan phosphor compact"),
            CliAction::ApplyUiCustomization("switch to cyan phosphor compact".into())
        );
        assert_eq!(
            parse_cli_input("check deployment status"),
            CliAction::SendPrompt("check deployment status".into())
        );
    }

    #[test]
    fn autocompletes_prefixes_and_aliases() {
        let matches = autocomplete_slash_commands("/ca");
        assert!(matches.iter().any(|c| c.name == "/canvas"));
        assert!(matches.iter().any(|c| c.name == "/stop"));
    }
}
