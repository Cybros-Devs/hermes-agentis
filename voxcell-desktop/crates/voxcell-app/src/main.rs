mod bridge;

use rune::{AppSpec, Cx, El, Key, KeyEvent, Tx};
use voxcell_core::ActiveView;
use voxcell_ui::{AppState, VoxcellTheme, render_main_window, render_phone_widget};

fn init_state() -> AppState {
    AppState::new()
}

fn render_root(state: &AppState, cx: &mut Cx<AppState>) -> El {
    // If `--scene phone` was requested, render the dedicated 320x420 Cyber Comms widget window
    // directly when no workspace chrome is needed, or alongside main window if requested.
    if state.phone_widget_open
        && state.active_view == ActiveView::Home
        && std::env::args().any(|a| a == "phone")
    {
        let theme = VoxcellTheme::from_config(&state.ui_config);
        return render_phone_widget(state, &theme, cx);
    }
    render_main_window(state, cx)
}

fn setup_app(state: &mut AppState, waker: rune::Waker) {
    if !rune::is_headless() {
        bridge::init_bridge(state, waker);
    }
}

fn poll_app(state: &mut AppState, t_seconds: f64, tx: &mut Tx) -> bool {
    let target_t = t_seconds as f32;
    let dt = if target_t > state.time_s {
        (target_t - state.time_s).clamp(0.008, 0.05)
    } else {
        0.016
    };

    if !rune::is_headless() {
        let _ = bridge::poll_bridge(state, dt);
    }

    // Drive 60Hz character portrait, horizon FFT, and active task pulse
    state.step_animations(dt);
    tx.wake_after(std::time::Duration::from_millis(33));
    true
}

fn on_key(state: &mut AppState, ev: &KeyEvent, _tx: &mut Tx) -> bool {
    if ev.mods.cmd {
        match &ev.key {
            Key::Text(t) if t == "1" => {
                state.active_view = ActiveView::Home;
                return true;
            }
            Key::Text(t) if t == "2" => {
                state.active_view = ActiveView::Canvas;
                return true;
            }
            Key::Text(t) if t == "3" => {
                state.active_view = ActiveView::Thread;
                return true;
            }
            Key::Text(t) if t == "4" => {
                state.active_view = ActiveView::Queue;
                return true;
            }
            Key::Text(t) if t == "5" => {
                state.active_view = ActiveView::Cli;
                return true;
            }
            Key::Text(t) if t == "," => {
                state.settings_open = !state.settings_open;
                return true;
            }
            _ => {}
        }
    }
    if ev.key == Key::Escape {
        if state.settings_open {
            state.settings_open = false;
            return true;
        }
        if state.add_dot_modal_open {
            state.add_dot_modal_open = false;
            return true;
        }
    }
    false
}

fn scene_idle(s: &mut AppState) {
    s.apply_scene_preset("idle");
}
fn scene_working(s: &mut AppState) {
    s.apply_scene_preset("working");
}
fn scene_attention(s: &mut AppState) {
    s.apply_scene_preset("attention");
}
fn scene_speaking(s: &mut AppState) {
    s.apply_scene_preset("speaking");
}
fn scene_canvas(s: &mut AppState) {
    s.apply_scene_preset("canvas");
}
fn scene_thread(s: &mut AppState) {
    s.apply_scene_preset("thread");
}
fn scene_queue(s: &mut AppState) {
    s.apply_scene_preset("queue");
}
fn scene_cli(s: &mut AppState) {
    s.apply_scene_preset("cli");
}
fn scene_settings(s: &mut AppState) {
    s.apply_scene_preset("settings");
}
fn scene_phone(s: &mut AppState) {
    s.apply_scene_preset("phone");
}

fn main() {
    rune::set_app_id("dev.voxcell.desktop");

    let is_phone_scene = std::env::args().any(|a| a == "phone");
    let win_size = if is_phone_scene {
        (320.0, 420.0)
    } else {
        (1280.0, 800.0)
    };

    let spec = AppSpec {
        min_size: Some((720.0, 520.0)),
        scenes: &[
            ("idle", scene_idle),
            ("working", scene_working),
            ("attention", scene_attention),
            ("speaking", scene_speaking),
            ("canvas", scene_canvas),
            ("thread", scene_thread),
            ("queue", scene_queue),
            ("cli", scene_cli),
            ("settings", scene_settings),
            ("phone", scene_phone),
        ],
        setup: Some(setup_app),
        poll: Some(poll_app),
        on_key: Some(on_key),
        ..AppSpec::new("Hermes Duet // Voxcell", win_size, init_state, render_root)
    };

    rune::run(spec);
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use voxcell_core::{ActiveView, ExpressionMood};

    #[test]
    fn stage_tap_cycles_mood_and_triggers_tap_impulse() {
        let mut s = AppState::new();
        s.apply_scene_preset("idle");
        let mut rt = Runtime::new(s, render_main_window, (1280.0, 800.0), Env::new(true, 1.0));
        rt.frame(0.0);

        let before_mood = rt.state.stage_mood;
        let (px, py) = rt.find("home-portrait-stage").expect("portrait stage element");
        rt.pointer_down(px, py);
        rt.pointer_up(px, py);
        rt.frame(0.016);

        assert_ne!(rt.state.stage_mood, before_mood);
        assert!(rt.state.tap_impulse > 0.5);
    }

    #[test]
    fn navigation_tabs_and_cli_slash_commands_work_end_to_end() {
        let mut s = AppState::new();
        s.apply_scene_preset("idle");
        let mut rt = Runtime::new(s, render_main_window, (1280.0, 800.0), Env::new(true, 1.0));
        rt.frame(0.0);

        // Click CLI tab in header
        let cli_tab = rt
            .elements()
            .into_iter()
            .find(|e| e.text.as_deref() == Some("CLI"))
            .expect("CLI tab");
        let cx = cli_tab.target[0] + cli_tab.target[2] * 0.5;
        let cy = cli_tab.target[1] + cli_tab.target[3] * 0.5;
        rt.pointer_down(cx, cy);
        rt.pointer_up(cx, cy);
        rt.frame(0.016);
        assert_eq!(rt.state.active_view, ActiveView::Cli);

        // Execute slash commands and confirm UI customization + /help output
        rt.state.execute_cli_line("/help");
        rt.state.execute_cli_line("/ui cyan crisp");
        rt.frame(0.016);

        assert_eq!(rt.state.ui_config.accent_hex, "#22D3EE");
        assert!(rt.state.cli_log.iter().any(|l| l.contains("Hermes Duet CLI Commands")));
    }

    #[test]
    fn sidebar_working_and_attention_approval_resolution_updates_state() {
        let mut s = AppState::new();
        s.apply_scene_preset("attention");
        let mut rt = Runtime::new(s, render_main_window, (1280.0, 800.0), Env::new(true, 1.0));
        rt.frame(0.0);

        assert_eq!(rt.state.pending_approvals().len(), 1);
        assert!(rt.find("sidebar-attention-card").is_some());

        let approve_btn = rt
            .elements()
            .into_iter()
            .find(|e| e.text.as_deref() == Some("Approve"))
            .expect("Approve button");
        let bx = approve_btn.target[0] + approve_btn.target[2] * 0.5;
        let by = approve_btn.target[1] + approve_btn.target[3] * 0.5;
        rt.pointer_down(bx, by);
        rt.pointer_up(bx, by);
        rt.frame(0.016);

        assert_eq!(rt.state.pending_approvals().len(), 0);
        assert!(rt.state.pending_commands.iter().any(|c| matches!(
            c,
            voxcell_ui::UiCommand::ResolveApproval { decision, .. } if decision == "once"
        )));

        // Accessibility tree exposes semantic roles cleanly
        let a11y = rt.accessibility_json().to_string();
        assert!(a11y.contains("Home"));
        assert!(a11y.contains("Canvas"));
        assert!(a11y.contains("Settings"));
    }

    #[test]
    fn canvas_scene_and_settings_dialog_render_without_panics() {
        let mut s = AppState::new();
        s.apply_scene_preset("canvas");
        let mut rt = Runtime::new(s, render_main_window, (1280.0, 800.0), Env::new(true, 1.0));
        rt.frame(0.0);
        assert_eq!(rt.state.dots.len(), 5);
        assert!(rt.find("canvas-node-dot-0").is_some());

        // Open settings dialog by clicking the Settings button in the top bar
        let settings_btn = rt
            .elements()
            .into_iter()
            .find(|e| e.text.as_deref() == Some("Settings"))
            .expect("Settings button");
        let sx = settings_btn.target[0] + settings_btn.target[2] * 0.5;
        let sy = settings_btn.target[1] + settings_btn.target[3] * 0.5;
        rt.pointer_down(sx, sy);
        rt.pointer_up(sx, sy);
        rt.frame(0.016);
        assert!(rt.state.settings_open);
        assert!(rt.find("settings-dialog").is_some());

        // Speaking state drives non-calm stage mood
        rt.state.apply_scene_preset("speaking");
        rt.frame(0.032);
        assert_eq!(rt.state.stage_mood, ExpressionMood::Speaking);
    }
}
