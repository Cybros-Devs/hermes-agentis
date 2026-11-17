use crate::state::{AppState, UiCommand};
use crate::theme::VoxcellTheme;
use rune::{Cx, El, SurfaceFit, TextStyle, col, el, row, text};
use rune_kit::{Button, ButtonVariant, ControlSize, Divider, TextInput};
use voxcell_core::sessions::{build_sidebar_session_list, count_sidebar_buckets};
use voxcell_core::sidebar_char::{
    SidebarCharacterInput, SidebarWorkTone, derive_sidebar_character_state, lead_running_task,
    resolve_sidebar_look_target,
};
use voxcell_core::tasks::{
    format_elapsed_duration, resolve_task_display_title, resolve_task_progress,
    summarize_channel_task_activity,
};
use voxcell_core::{ActiveView, SessionScopeTab};

pub fn render_sidebar(state: &AppState, theme: &VoxcellTheme, _cx: &mut Cx<AppState>) -> El {
    let k = &theme.kit;
    let width = state.ui_config.sidebar_width.clamp(240.0, 380.0);

    let running_count = state
        .tasks
        .iter()
        .filter(|t| t.status == voxcell_core::TaskLifecycleStatus::Running)
        .count();
    let pending_approvals = state.pending_approvals();
    let lead_task = lead_running_task(&state.tasks);

    let char_pres = derive_sidebar_character_state(&SidebarCharacterInput {
        connected: state.gateway.online,
        is_speaking: state.audio.is_speaking
            || state.stage_mood == voxcell_core::ExpressionMood::Speaking,
        is_listening: state.audio.is_listening || state.voice.hands_free_vad,
        active_channel_thinking: state.active_is_thinking(),
        any_thinking: state.thinking_by_channel.values().any(|&v| v),
        running_task_count: running_count,
        pending_approval_count: pending_approvals.len(),
        voice_amplitude: state.audio.output_level.max(state.audio.input_level),
        active_task_progress: lead_task.map(|t| t.progress),
        active_task_title: lead_task.map(resolve_task_display_title),
        look_x: state.pointer_sidebar.map(|p| p.0).unwrap_or(0.0),
        look_y: state.pointer_sidebar.map(|p| p.1).unwrap_or(0.0),
    });

    let tone_color = match char_pres.tone {
        SidebarWorkTone::Emerald => theme.accent,
        SidebarWorkTone::Amber => theme.amber,
        SidebarWorkTone::Rose => theme.rose,
        SidebarWorkTone::Slate => theme.text_muted,
    };

    // 1. Header bar with brand + New Session
    let header = row()
        .key("sidebar-header")
        .w_full()
        .items_center()
        .justify_between()
        .child(
            row()
                .gap(8.0)
                .items_center()
                .child(
                    el().w(8.0)
                        .h(8.0)
                        .radius(4.0)
                        .fill(if state.gateway.online {
                            theme.accent
                        } else {
                            theme.rose
                        }),
                )
                .child(
                    text("HERMES // DUET")
                        .font(TextStyle::new(11.5, 700.0).tracking(0.8).mono())
                        .color(theme.text),
                ),
        )
        .child(
            Button::new("+ New")
                .variant(ButtonVariant::Neutral)
                .control_size(ControlSize::Small)
                .on_press(|s: &mut AppState| s.create_new_workspace_session(None))
                .build(k),
        );

    // 2. Reactive 72x66 Character Companion Card with pointer gaze tracking
    let avatar_surface = el()
        .key("sidebar-avatar-hit")
        .w(72.0)
        .h(66.0)
        .radius(8.0)
        .fill(theme.bg.alpha(0.92))
        .border(1.0, tone_color.alpha(0.35))
        .on_pointer_move_local(|s: &mut AppState, ev, _tx| {
            let nx = (ev.x / 72.0) * 2.0 - 1.0;
            let ny = (ev.y / 66.0) * 2.0 - 1.0;
            let inside = ev.x >= 0.0 && ev.x <= 72.0 && ev.y >= 0.0 && ev.y <= 66.0;
            s.pointer_sidebar = Some(resolve_sidebar_look_target(nx, ny, inside));
        })
        .on_press(|s: &mut AppState| {
            s.toggle_stage_mood();
        })
        .child(
            el().w(72.0)
                .h(66.0)
                .pixels_fit(&state.sidebar_pixels, SurfaceFit::Fit),
        );

    let companion_card = col()
        .key("sidebar-companion-card")
        .w_full()
        .gap(10.0)
        .padding(10.0)
        .radius(10.0)
        .fill(theme.card_fill)
        .border(1.0, tone_color.alpha(0.28))
        .child(
            row()
                .w_full()
                .gap(10.0)
                .items_center()
                .child(avatar_surface)
                .child(
                    col()
                        .grow(1.0)
                        .min_w(0.0)
                        .gap(4.0)
                        .child(
                            row()
                                .w_full()
                                .items_center()
                                .justify_between()
                                .child(
                                    text("Hermes Agent")
                                        .font(TextStyle::new(13.0, 600.0).lh(17.0))
                                        .color(theme.text),
                                )
                                .child(
                                    row()
                                        .px(6.0)
                                        .py(2.0)
                                        .radius(4.0)
                                        .fill(tone_color.alpha(0.16))
                                        .border(0.5, tone_color.alpha(0.45))
                                        .child(
                                            text(char_pres.status_label.clone())
                                                .font(TextStyle::new(10.0, 600.0).lh(12.0).mono())
                                                .color(tone_color),
                                        ),
                                ),
                        )
                        .child(
                            text(char_pres.status_detail.clone())
                                .font(theme.mono_sm)
                                .color(theme.text_muted),
                        )
                        .child(
                            text(format!(
                                "{} · {}",
                                state.gateway.active_profile, state.gateway.model
                            ))
                            .font(TextStyle::new(10.5, 400.0).lh(14.0).mono())
                            .color(theme.text_faint),
                        ),
                ),
        );

    // 3. Task Telemetry Tray (when active task running)
    let companion_card = if let Some(task) = lead_task {
        let progress = resolve_task_progress(task);
        let elapsed = format_elapsed_duration(task.created_at_ms, state.now_ms, true);
        let title = resolve_task_display_title(task);
        let bar_pct = (progress.pct as f32 / 100.0).clamp(0.08, 1.0);
        let bar_w = (width - 48.0).max(120.0) * bar_pct;

        companion_card.child(
            col()
                .key("sidebar-task-tray")
                .w_full()
                .gap(5.0)
                .padding(8.0)
                .radius(6.0)
                .fill(theme.bg.alpha(0.68))
                .border(0.5, theme.amber.alpha(0.32))
                .child(
                    row()
                        .w_full()
                        .justify_between()
                        .items_center()
                        .child(
                            text(title)
                                .font(TextStyle::new(11.5, 600.0).lh(15.0))
                                .color(theme.text),
                        )
                        .child(
                            text(format!("{} · {}", progress.ratio_label, elapsed))
                                .font(theme.mono_sm)
                                .color(theme.amber),
                        ),
                )
                .child(
                    el().w_full()
                        .h(4.0)
                        .radius(2.0)
                        .fill(theme.text.alpha(0.10))
                        .child(el().w(bar_w).h(4.0).radius(2.0).fill(theme.amber)),
                )
                .child(
                    text(
                        task.last_step
                            .clone()
                            .unwrap_or_else(|| "Executing turn...".into()),
                    )
                    .font(theme.mono_sm)
                    .color(theme.text_muted),
                ),
        )
    } else {
        companion_card
    };

    // 4. Inline Needs-Attention Approval Card (if pending approvals)
    let attention_card = pending_approvals.first().map(|req| {
        let req_id_once = req.id.clone();
        let req_id_always = req.id.clone();
        let req_id_deny = req.id.clone();
        col()
            .key("sidebar-attention-card")
            .w_full()
            .gap(8.0)
            .padding(10.0)
            .radius(8.0)
            .fill(theme.amber.alpha(0.11))
            .border(1.0, theme.amber.alpha(0.42))
            .child(
                row()
                    .w_full()
                    .justify_between()
                    .items_center()
                    .child(
                        text("NEEDS ATTENTION")
                            .font(TextStyle::new(10.0, 700.0).tracking(0.7).mono())
                            .color(theme.amber),
                    )
                    .child(
                        text(format!("{} pending", pending_approvals.len()))
                            .font(theme.mono_sm)
                            .color(theme.amber),
                    ),
            )
            .child(
                text(req.title.clone())
                    .font(TextStyle::new(12.5, 600.0).lh(16.0))
                    .color(theme.text),
            )
            .child(
                text(if req.command.is_empty() {
                    req.summary.clone()
                } else {
                    req.command.clone()
                })
                .font(theme.mono_sm)
                .color(theme.text_muted),
            )
            .child(
                row()
                    .gap(6.0)
                    .w_full()
                    .child(
                        Button::new("Approve")
                            .variant(ButtonVariant::Submit)
                            .control_size(ControlSize::Small)
                            .on_press(move |s: &mut AppState| {
                                s.resolve_approval(&req_id_once, "once");
                            })
                            .build(k),
                    )
                    .child(
                        Button::new("Always")
                            .variant(ButtonVariant::Neutral)
                            .control_size(ControlSize::Small)
                            .on_press(move |s: &mut AppState| {
                                s.resolve_approval(&req_id_always, "always");
                            })
                            .build(k),
                    )
                    .child(
                        Button::new("Deny")
                            .variant(ButtonVariant::Ghost)
                            .control_size(ControlSize::Small)
                            .on_press(move |s: &mut AppState| {
                                s.resolve_approval(&req_id_deny, "deny");
                            })
                            .build(k),
                    ),
            )
    });

    // 5. Scope Tabs (Sessions vs Gateway) + Search
    let (ws_count, gw_count) = count_sidebar_buckets(&state.channels);
    let scope_tabs = row()
        .key("sidebar-scope-tabs")
        .w_full()
        .gap(6.0)
        .child(
            Button::new(format!("Sessions ({ws_count})"))
                .variant(if state.session_scope == SessionScopeTab::Sessions {
                    ButtonVariant::Neutral
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Small)
                .on_press(|s: &mut AppState| s.session_scope = SessionScopeTab::Sessions)
                .build(k),
        )
        .child(
            Button::new(format!("Gateway ({gw_count})"))
                .variant(if state.session_scope == SessionScopeTab::Gateway {
                    ButtonVariant::Neutral
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Small)
                .on_press(|s: &mut AppState| s.session_scope = SessionScopeTab::Gateway)
                .build(k),
        );

    let search_bar = TextInput::new(&state.search_edit)
        .placeholder("Filter sessions...")
        .label("Filter sessions")
        .width(None)
        .on_edit(|s: &mut AppState| &mut s.search_edit)
        .build(k);

    // 6. Session List
    let task_summary = summarize_channel_task_activity(
        &state.tasks,
        &state.channels,
        &state.thinking_by_channel,
    );
    let items = build_sidebar_session_list(
        &state.channels,
        state.session_scope,
        &state.search_edit.text,
        &task_summary,
    );

    let mut session_list = col().key("sidebar-session-list").w_full().gap(4.0);
    if items.is_empty() {
        session_list = session_list.child(
            col()
                .padding(12.0)
                .radius(8.0)
                .fill(theme.bg.alpha(0.45))
                .border(0.5, theme.border)
                .gap(4.0)
                .child(
                    text("No sessions matching filter")
                        .font(TextStyle::new(12.0, 500.0))
                        .color(theme.text_muted),
                )
                .child(
                    text("Start a prompt on Home or click + New.")
                        .font(theme.mono_sm)
                        .color(theme.text_faint),
                ),
        );
    } else {
        for item in items {
            let ch = item.channel;
            let is_active = ch.id == state.active_channel_id;
            let ch_id_select = ch.id.clone();
            let ch_id_dismiss = ch.id.clone();
            let border_c = if item.is_active_work {
                theme.amber.alpha(0.45)
            } else if is_active {
                theme.accent.alpha(0.48)
            } else {
                theme.border
            };
            let bg_c = if is_active {
                theme.accent.alpha(0.11)
            } else {
                theme.bg.alpha(0.45)
            };

            let mut row_el = row()
                .key(format!("session-row-{}", ch.id))
                .w_full()
                .padding(8.0)
                .radius(7.0)
                .fill(bg_c)
                .border(0.75, border_c)
                .items_center()
                .justify_between()
                .gap(6.0)
                .on_press(move |s: &mut AppState| {
                    s.active_channel_id = ch_id_select.clone();
                    if s.active_view == ActiveView::Home && !s.entries.iter().all(|e| e.channel_id != s.active_channel_id) {
                        s.active_view = ActiveView::Thread;
                    }
                })
                .child(
                    col()
                        .grow(1.0)
                        .min_w(0.0)
                        .gap(2.0)
                        .child(
                            row()
                                .gap(6.0)
                                .items_center()
                                .child(
                                    el().w(6.0)
                                        .h(6.0)
                                        .radius(3.0)
                                        .fill(if item.is_active_work {
                                            theme.amber
                                        } else if is_active {
                                            theme.accent
                                        } else {
                                            theme.text_faint
                                        }),
                                )
                                .child(
                                    text(ch.name.clone())
                                        .font(TextStyle::new(12.5, if is_active { 600.0 } else { 500.0 }).lh(16.0))
                                        .color(if is_active { theme.text } else { theme.text_muted }),
                                ),
                        )
                        .child(
                            text(
                                item.activity_label
                                    .unwrap_or_else(|| ch.session_id.clone()),
                            )
                            .font(theme.mono_sm)
                            .color(if item.is_active_work {
                                theme.amber
                            } else {
                                theme.text_faint
                            }),
                        ),
                );

            if ch.id != "home" {
                row_el = row_el.child(
                    Button::new("x")
                        .variant(ButtonVariant::Ghost)
                        .control_size(ControlSize::Mini)
                        .on_press(move |s: &mut AppState| {
                            s.channels.retain(|c| c.id != ch_id_dismiss);
                            s.dots.retain(|d| d.channel_id != ch_id_dismiss);
                            if s.active_channel_id == ch_id_dismiss {
                                s.active_channel_id = "home".into();
                            }
                            s.pending_commands.push(UiCommand::DismissChannel(ch_id_dismiss.clone()));
                        })
                        .build(k),
                );
            }

            session_list = session_list.child(row_el);
        }
    }

    // 7. Footer actions (Pin to Canvas + Phone Widget quick toggle)
    let footer = row()
        .key("sidebar-footer")
        .w_full()
        .justify_between()
        .gap(6.0)
        .child(
            Button::new("Pin to Canvas")
                .variant(ButtonVariant::Neutral)
                .control_size(ControlSize::Small)
                .on_press(|s: &mut AppState| s.pin_active_channel_to_canvas())
                .build(k),
        )
        .child(
            Button::new(if state.phone_widget_open {
                "Phone Open"
            } else {
                "Phone HUD"
            })
            .variant(if state.phone_widget_open {
                ButtonVariant::Submit
            } else {
                ButtonVariant::Ghost
            })
            .control_size(ControlSize::Small)
            .on_press(|s: &mut AppState| {
                let next = !s.phone_widget_open;
                s.phone_widget_open = next;
                s.pending_commands.push(UiCommand::TogglePhoneWindow(next));
            })
            .build(k),
        );

    let mut root = col()
        .key("sidebar")
        .w(width)
        .h_full()
        .min_h(0.0)
        .padding(12.0)
        .gap(10.0)
        .fill(theme.glass_fill)
        .backdrop_blur(12.0)
        .border(1.0, theme.border)
        .child(header)
        .child(companion_card);

    if let Some(card) = attention_card {
        root = root.child(card);
    }

    root.child(Divider::horizontal().build(k))
        .child(scope_tabs)
        .child(search_bar)
        .child(
            col()
                .key("sidebar-scroll")
                .grow(1.0)
                .min_h(0.0)
                .w_full()
                .scroll(rune::ScrollSpec { stick_bottom: false })
                .child(session_list),
        )
        .child(Divider::horizontal().build(k))
        .child(footer)
}
