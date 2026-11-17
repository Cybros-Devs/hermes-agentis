use crate::state::{AppState, UiCommand};
use crate::theme::VoxcellTheme;
use rune::{Cx, El, ScrollSpec, TextStyle, col, el, row, text};
use rune_kit::{Button, ButtonVariant, ControlSize, Divider, TextInput};
use voxcell_core::tasks::{
    format_elapsed_duration, get_task_status_display, partition_channel_tasks,
    resolve_task_display_title, resolve_task_progress, resolve_task_step_breakdown,
    summarize_thread_tasks,
};
use voxcell_core::thread::{ThreadTimelineBlock, TraceStepIcon, group_thread_timeline};
use voxcell_core::EntryRole;

pub fn render_thread(state: &AppState, theme: &VoxcellTheme, _cx: &mut Cx<AppState>) -> El {
    let k = &theme.kit;
    let ch = state.active_channel().cloned();
    let ch_id = state.active_channel_id.clone();
    let is_thinking = state.active_is_thinking();
    let ch_entries = state.active_entries();

    let partition = partition_channel_tasks(&state.tasks, &ch_id);
    let summary = summarize_thread_tasks(&partition, is_thinking);

    // 1. Thread Header + Active Task Banner
    let mut header = col()
        .key("thread-header")
        .w_full()
        .gap(8.0)
        .padding(12.0)
        .radius(10.0)
        .fill(theme.card_fill)
        .border(1.0, theme.border)
        .child(
            row()
                .w_full()
                .justify_between()
                .items_center()
                .child(
                    col()
                        .gap(2.0)
                        .child(
                            text(ch.as_ref().map(|c| c.name.as_str()).unwrap_or("Thread"))
                                .font(theme.heading)
                                .color(theme.text),
                        )
                        .child(
                            text(format!(
                                "session={} · model={}",
                                state.active_session_id(),
                                state.gateway.model
                            ))
                            .font(theme.mono_sm)
                            .color(theme.text_muted),
                        ),
                )
                .child(
                    row()
                        .gap(6.0)
                        .items_center()
                        .child(if !summary.header_badge.is_empty() {
                            el().px(8.0)
                                .py(3.0)
                                .radius(4.0)
                                .fill(if is_thinking {
                                    theme.amber.alpha(0.15)
                                } else {
                                    theme.accent.alpha(0.14)
                                })
                                .border(
                                    0.5,
                                    if is_thinking {
                                        theme.amber.alpha(0.45)
                                    } else {
                                        theme.accent.alpha(0.4)
                                    },
                                )
                                .child(
                                    text(summary.header_badge.clone())
                                        .font(theme.mono_sm)
                                        .color(if is_thinking { theme.amber } else { theme.accent }),
                                )
                        } else {
                            el()
                        })
                        .child(if is_thinking {
                            Button::new("Stop Run")
                                .variant(ButtonVariant::Neutral)
                                .control_size(ControlSize::Small)
                                .on_press(move |s: &mut AppState| {
                                    let active_id = s.active_channel_id.clone();
                                    if let Some(run_id) = s.active_run_ids.get(&active_id).cloned() {
                                        s.pending_commands.push(UiCommand::StopRun {
                                            run_id,
                                            channel_id: active_id.clone(),
                                        });
                                    }
                                    s.thinking_by_channel.insert(active_id, false);
                                })
                                .build(k)
                        } else {
                            Button::new("Reset")
                                .variant(ButtonVariant::Ghost)
                                .control_size(ControlSize::Small)
                                .on_press(|s: &mut AppState| {
                                    let id = s.active_channel_id.clone();
                                    let sid = s.active_session_id();
                                    s.entries.retain(|e| e.channel_id != id);
                                    s.pending_commands.push(UiCommand::ResetSession {
                                        channel_id: id,
                                        session_id: sid,
                                    });
                                })
                                .build(k)
                        }),
                ),
        );

    if let Some(lead) = partition.running.first().or_else(|| partition.all.first()) {
        let disp = get_task_status_display(lead);
        let prog = resolve_task_progress(lead);
        let breakdown = resolve_task_step_breakdown(lead);
        let elapsed = format_elapsed_duration(lead.created_at_ms, state.now_ms, true);

        let mut banner = col()
            .key("thread-task-banner")
            .w_full()
            .gap(6.0)
            .padding(10.0)
            .radius(8.0)
            .fill(theme.bg.alpha(0.62))
            .border(0.75, theme.amber.alpha(0.28))
            .child(
                row()
                    .w_full()
                    .justify_between()
                    .items_center()
                    .child(
                        text(format!(
                            "[{}] {}",
                            disp.label,
                            resolve_task_display_title(lead)
                        ))
                        .font(TextStyle::new(12.5, 600.0))
                        .color(theme.text),
                    )
                    .child(
                        text(format!("{} · {}% · {}", prog.ratio_label, prog.pct, elapsed))
                            .font(theme.mono_sm)
                            .color(theme.amber),
                    ),
            );

        for step in breakdown.steps.iter().take(4) {
            let (glyph, colr) = match step.state {
                voxcell_core::tasks::ResolvedStepState::Done => ("[x]", theme.accent),
                voxcell_core::tasks::ResolvedStepState::Active => ("[>]", theme.amber),
                voxcell_core::tasks::ResolvedStepState::Pending => ("[ ]", theme.text_faint),
            };
            banner = banner.child(
                text(format!("  {glyph} {}", step.text))
                    .font(theme.mono_sm)
                    .color(colr),
            );
        }
        header = header.child(banner);
    }

    // 2. Scrollable Grouped Timeline (Trace Groups + Chat Bubbles)
    let blocks = group_thread_timeline(&ch_entries, is_thinking, true);
    let mut feed = col().key("thread-feed").w_full().gap(10.0).padding(4.0);

    if blocks.is_empty() {
        feed = feed.child(
            col()
                .w_full()
                .padding(24.0)
                .radius(10.0)
                .fill(theme.card_fill)
                .border(0.75, theme.border)
                .items_center()
                .gap(6.0)
                .child(
                    text("Thread ready")
                        .font(TextStyle::new(14.0, 600.0))
                        .color(theme.text),
                )
                .child(
                    text("Send a prompt below to stream reasoning traces, tool executions, and voice replies.")
                        .font(theme.mono_sm)
                        .color(theme.text_muted),
                ),
        );
    } else {
        for block in blocks {
            match block {
                ThreadTimelineBlock::Trace { id, items, is_live } => {
                    let collapsed = state.collapsed_traces.contains(&id);
                    let trace_id = id.clone();
                    let header_row = row()
                        .w_full()
                        .justify_between()
                        .items_center()
                        .on_press(move |s: &mut AppState| {
                            if s.collapsed_traces.contains(&trace_id) {
                                s.collapsed_traces.remove(&trace_id);
                            } else {
                                s.collapsed_traces.insert(trace_id.clone());
                            }
                        })
                        .child(
                            text(if is_live {
                                format!("LIVE TRACE ({} steps)", items.len())
                            } else {
                                format!("TRACE GROUP ({} steps)", items.len())
                            })
                            .font(TextStyle::new(11.0, 700.0).tracking(0.5).mono())
                            .color(if is_live { theme.amber } else { theme.accent }),
                        )
                        .child(
                            text(if collapsed { "Expand +" } else { "Collapse -" })
                                .font(theme.mono_sm)
                                .color(theme.text_faint),
                        );

                    let mut card = col()
                        .key(id)
                        .w_full()
                        .padding(10.0)
                        .gap(6.0)
                        .radius(8.0)
                        .fill(theme.bg.alpha(0.68))
                        .border(
                            0.75,
                            if is_live {
                                theme.amber.alpha(0.35)
                            } else {
                                theme.border
                            },
                        )
                        .child(header_row);

                    if !collapsed {
                        for step in items {
                            let tag = match step.icon {
                                TraceStepIcon::Reasoning => "THINK",
                                TraceStepIcon::Tool => "TOOL ",
                                TraceStepIcon::Spawn => "AGENT",
                                TraceStepIcon::Commentary => "NOTE ",
                                TraceStepIcon::Link => "LINK ",
                                TraceStepIcon::Status => "STAT ",
                            };
                            card = card.child(
                                row()
                                    .w_full()
                                    .gap(8.0)
                                    .child(
                                        text(tag)
                                            .font(TextStyle::new(10.5, 700.0).mono())
                                            .color(if step.is_reasoning {
                                                theme.amber
                                            } else {
                                                theme.accent
                                            }),
                                    )
                                    .child(
                                        col()
                                            .grow(1.0)
                                            .min_w(0.0)
                                            .gap(2.0)
                                            .child(
                                                text(step.label)
                                                    .font(TextStyle::new(12.0, 600.0))
                                                    .color(theme.text),
                                            )
                                            .child(if step.detail.is_empty() {
                                                el()
                                            } else {
                                                text(step.detail)
                                                    .font(theme.mono_sm)
                                                    .color(theme.text_muted)
                                            }),
                                    ),
                            );
                        }
                    }
                    feed = feed.child(card);
                }
                ThreadTimelineBlock::Entry { id, entry } => {
                    let is_user = entry.role == EntryRole::User;
                    let is_err = entry.error_code.is_some();
                    let role_label = match entry.role {
                        EntryRole::User => "YOU",
                        EntryRole::Hermes => "HERMES",
                        EntryRole::Command => "CMD",
                        EntryRole::System => "SYS",
                        EntryRole::Activity => "EVENT",
                    };
                    let border = if is_err {
                        theme.rose.alpha(0.55)
                    } else if is_user {
                        theme.accent.alpha(0.35)
                    } else {
                        theme.border
                    };
                    let fill = if is_err {
                        theme.rose.alpha(0.10)
                    } else if is_user {
                        theme.accent.alpha(0.09)
                    } else {
                        theme.card_fill
                    };

                    feed = feed.child(
                        col()
                            .key(format!("msg-{id}"))
                            .w_full()
                            .padding(12.0)
                            .gap(6.0)
                            .radius(10.0)
                            .fill(fill)
                            .border(0.75, border)
                            .child(
                                row()
                                    .w_full()
                                    .justify_between()
                                    .child(
                                        text(role_label)
                                            .font(TextStyle::new(10.5, 700.0).tracking(0.6).mono())
                                            .color(if is_err {
                                                theme.rose
                                            } else if is_user {
                                                theme.accent
                                            } else {
                                                theme.text_muted
                                            }),
                                    )
                                    .child(
                                        text(if entry.streaming {
                                            "streaming...".to_string()
                                        } else {
                                            entry.timestamp
                                        })
                                        .font(theme.mono_sm)
                                        .color(theme.text_faint),
                                    ),
                            )
                            .child(
                                text(entry.text)
                                    .font(TextStyle::new(13.5, 400.0).lh(20.0))
                                    .color(theme.text),
                            ),
                    );
                }
            }
        }
    }

    // 3. Thread Composer
    let composer = row()
        .key("thread-composer")
        .w_full()
        .padding(8.0)
        .gap(8.0)
        .radius(10.0)
        .fill(theme.card_fill)
        .border(1.0, theme.border_strong)
        .items_center()
        .child(
            el().grow(1.0).min_w(0.0).child(
                TextInput::new(&state.composer_edit)
                    .placeholder(if is_thinking {
                        "Type to steer running turn or queue prompt..."
                    } else {
                        "Reply in thread..."
                    })
                    .label("Thread input")
                    .plain()
                    .width(None)
                    .on_edit(|s: &mut AppState| &mut s.composer_edit)
                    .on_submit(|s: &mut AppState, _tx| s.submit_composer_prompt())
                    .build(k),
            ),
        )
        .child(
            Button::new(if is_thinking { "Steer" } else { "Send" })
                .variant(ButtonVariant::Submit)
                .control_size(ControlSize::Small)
                .on_press(|s: &mut AppState| {
                    let ch = s.active_channel_id.clone();
                    if let Some(run_id) = s.active_run_ids.get(&ch).cloned() {
                        let txt = s.composer_edit.text.trim().to_string();
                        if !txt.is_empty() {
                            s.composer_edit.clear();
                            s.pending_commands.push(UiCommand::SteerRun {
                                run_id,
                                text: txt,
                            });
                        }
                    } else {
                        s.submit_composer_prompt();
                    }
                })
                .build(k),
        );

    col()
        .key("thread-view")
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .h_full()
        .padding(14.0)
        .gap(10.0)
        .child(header)
        .child(
            col()
                .key("thread-scroll")
                .grow(1.0)
                .min_h(0.0)
                .w_full()
                .scroll(ScrollSpec { stick_bottom: true })
                .child(feed),
        )
        .child(Divider::horizontal().build(k))
        .child(composer)
}
