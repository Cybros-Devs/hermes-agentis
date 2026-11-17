pub mod canvas;
pub mod cli;
pub mod home;
pub mod phone_widget;
pub mod queue;
pub mod settings;
pub mod sidebar;
pub mod thread;

use crate::state::{AppState, UiCommand};
use crate::theme::{VoxcellTheme, render_ambient_backdrop};
use rune::{Cx, El, TextStyle, col, el, row, text};
use rune_kit::{Button, ButtonVariant, ControlSize};
use voxcell_core::{ActiveView, SidebarPosition};

pub fn render_main_window(state: &AppState, cx: &mut Cx<AppState>) -> El {
    let theme = VoxcellTheme::from_config(&state.ui_config);
    let k = &theme.kit;

    // 1. Top Navigation & Controls Bar
    let nav_items = [
        (ActiveView::Home, "Home"),
        (ActiveView::Canvas, "Canvas"),
        (ActiveView::Thread, "Thread"),
        (ActiveView::Queue, "Queue"),
        (ActiveView::Cli, "CLI"),
    ];

    let mut nav_tabs = row().key("top-nav-tabs").gap(6.0).items_center();
    for (view, label) in nav_items {
        let active = state.active_view == view;
        let badge_suffix = if view == ActiveView::Queue {
            let n = state.pending_approvals().len();
            if n > 0 { format!(" ({n})") } else { String::new() }
        } else {
            String::new()
        };
        nav_tabs = nav_tabs.child(
            Button::new(format!("{label}{badge_suffix}"))
                .variant(if active {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Small)
                .on_press(move |s: &mut AppState| s.active_view = view)
                .build(k),
        );
    }

    let top_bar = row()
        .key("top-header")
        .w_full()
        .h(46.0)
        .px(14.0)
        .justify_between()
        .items_center()
        .fill(theme.glass_fill)
        .border(1.0, theme.border)
        .child(
            row()
                .gap(12.0)
                .items_center()
                .child(
                    Button::new(if state.ui_config.sidebar_collapsed {
                        "Show Sidebar"
                    } else {
                        "Hide Sidebar"
                    })
                    .variant(ButtonVariant::Ghost)
                    .control_size(ControlSize::Mini)
                    .on_press(|s: &mut AppState| {
                        s.ui_config.sidebar_collapsed = !s.ui_config.sidebar_collapsed;
                    })
                    .build(k),
                )
                .child(nav_tabs),
        )
        .child(
            row()
                .gap(8.0)
                .items_center()
                .child(
                    text(if state.gateway.online {
                        format!("{} · {}ms", state.gateway.model, state.gateway.latency_ms.unwrap_or(0))
                    } else {
                        "local standby".to_string()
                    })
                    .font(TextStyle::new(11.0, 500.0).mono())
                    .color(if state.gateway.online {
                        theme.accent
                    } else {
                        theme.text_faint
                    }),
                )
                .child(
                    Button::new(if state.voice.muted { "TTS Muted" } else { "TTS On" })
                        .variant(ButtonVariant::Neutral)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            let next = !s.voice.muted;
                            s.voice.muted = next;
                            s.pending_commands.push(UiCommand::ToggleMute(next));
                        })
                        .build(k),
                )
                .child(
                    Button::new("Phone HUD")
                        .variant(if state.phone_widget_open {
                            ButtonVariant::Submit
                        } else {
                            ButtonVariant::Neutral
                        })
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            let next = !s.phone_widget_open;
                            s.phone_widget_open = next;
                            s.pending_commands.push(UiCommand::TogglePhoneWindow(next));
                        })
                        .build(k),
                )
                .child(
                    Button::new("Settings")
                        .variant(ButtonVariant::Neutral)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| s.settings_open = true)
                        .build(k),
                ),
        );

    // 2. Active Content Pane
    let main_pane = match state.active_view {
        ActiveView::Home => home::render_home(state, &theme, cx),
        ActiveView::Canvas => canvas::render_canvas(state, &theme, cx),
        ActiveView::Thread => thread::render_thread(state, &theme, cx),
        ActiveView::Queue => queue::render_queue(state, &theme, cx),
        ActiveView::Cli => cli::render_cli(state, &theme, cx),
    };

    let main_pane_wrap = el()
        .key("main-pane")
        .grow(1.0)
        .min_w(0.0)
        .min_h(0.0)
        .h_full()
        .child(main_pane);

    // 3. Responsive Workspace Body (Sidebar Left or Right)
    let mut workspace = row().key("workspace-body").grow(1.0).min_h(0.0).w_full();
    if !state.ui_config.sidebar_collapsed {
        let sb = sidebar::render_sidebar(state, &theme, cx);
        match state.ui_config.sidebar_position {
            SidebarPosition::Left => {
                workspace = workspace.child(sb).child(main_pane_wrap);
            }
            SidebarPosition::Right => {
                workspace = workspace.child(main_pane_wrap).child(sb);
            }
        }
    } else {
        workspace = workspace.child(main_pane_wrap);
    }

    // 4. Overlay Layer (Settings Dialog, Add Dot Dialog, or Embedded Phone HUD Preview in phone scene)
    let mut overlay_layer = Vec::new();
    settings::render_settings_dialog(state, &theme, &mut overlay_layer);
    canvas::render_add_dot_dialog(state, &theme, &mut overlay_layer);

    if state.phone_widget_open && state.active_view == ActiveView::Home && !state.settings_open {
        let phone_card = el()
            .key("phone-floating-dock")
            .absolute(920.0, 320.0)
            .w(320.0)
            .h(420.0)
            .radius(14.0)
            .child(phone_widget::render_phone_widget(state, &theme, cx));
        overlay_layer.push(phone_card);
    }

    let base_shell = el()
        .key("voxcell-root")
        .role("window")
        .w_full()
        .h_full()
        .child(render_ambient_backdrop(
            &theme,
            &state.bg_settings,
            state.time_s,
            state.ui_config.reduced_motion,
        ))
        .child(
            col()
                .w_full()
                .h_full()
                .min_h(0.0)
                .child(top_bar)
                .child(workspace),
        );

    rune_kit::root(base_shell, overlay_layer)
}
