use crate::state::{AppState, UiCommand};
use crate::theme::VoxcellTheme;
use rune::{Cx, El, ScrollSpec, TextStyle, col, el, row, text};
use rune_kit::{Button, ButtonVariant, ControlSize, Divider};

pub fn render_queue(state: &AppState, theme: &VoxcellTheme, _cx: &mut Cx<AppState>) -> El {
    let k = &theme.kit;
    let pending = state.pending_approvals();

    // 1. Gateway Status + Profiles Panel
    let mut profile_row = row().gap(6.0).items_center();
    for prof in &state.gateway_profiles {
        let active = prof.active || prof.name == state.gateway.active_profile;
        let pname = prof.name.clone();
        profile_row = profile_row.child(
            Button::new(prof.name.clone())
                .variant(if active {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Neutral
                })
                .control_size(ControlSize::Small)
                .on_press(move |s: &mut AppState| {
                    s.gateway.active_profile = pname.clone();
                    for item in &mut s.gateway_profiles {
                        item.active = item.name == pname;
                    }
                    s.pending_commands.push(UiCommand::SwitchProfile {
                        profile: pname.clone(),
                    });
                })
                .build(k),
        );
    }

    let gateway_card = col()
        .key("queue-gateway-card")
        .w_full()
        .padding(12.0)
        .gap(8.0)
        .radius(10.0)
        .fill(theme.card_fill)
        .border(1.0, theme.border)
        .child(
            row()
                .w_full()
                .justify_between()
                .items_center()
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
                            text(if state.gateway.online {
                                "Gateway Online"
                            } else {
                                "Gateway Offline"
                            })
                            .font(theme.heading)
                            .color(theme.text),
                        )
                        .child(
                            text(format!(
                                "{} · {:?} · {}ms",
                                state.gateway.base_url,
                                state.gateway.active_transport,
                                state.gateway.latency_ms.unwrap_or(0)
                            ))
                            .font(theme.mono_sm)
                            .color(theme.text_muted),
                        ),
                )
                .child(
                    Button::new("Probe Now")
                        .variant(ButtonVariant::Neutral)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            s.pending_commands.push(UiCommand::RefreshGateway);
                        })
                        .build(k),
                ),
        )
        .child(
            row()
                .w_full()
                .justify_between()
                .items_center()
                .child(
                    row()
                        .gap(8.0)
                        .items_center()
                        .child(text("Profiles:").font(theme.mono_sm).color(theme.text_muted))
                        .child(profile_row),
                )
                .child(
                    text(format!(
                        "runs={} · approvals={} · cron={} · skills={}",
                        state.gateway.capabilities.runs,
                        state.gateway.capabilities.approvals,
                        state.gateway.capabilities.cron_jobs,
                        state.gateway.capabilities.skills
                    ))
                    .font(theme.mono_sm)
                    .color(theme.text_faint),
                ),
        );

    // 2. Pending Approvals Gate Section
    let mut approvals_section = col().key("queue-approvals").w_full().gap(8.0).child(
        text(format!("Pending Approvals & Clarifications ({})", pending.len()))
            .font(TextStyle::new(13.5, 700.0))
            .color(if pending.is_empty() {
                theme.text_muted
            } else {
                theme.amber
            }),
    );

    if pending.is_empty() {
        approvals_section = approvals_section.child(
            el().w_full()
                .padding(12.0)
                .radius(8.0)
                .fill(theme.bg.alpha(0.45))
                .border(0.75, theme.border)
                .child(
                    text("No pending tool approvals or clarify gates.")
                        .font(theme.mono_sm)
                        .color(theme.text_faint),
                ),
        );
    } else {
        for req in pending {
            let id1 = req.id.clone();
            let id2 = req.id.clone();
            let id3 = req.id.clone();
            approvals_section = approvals_section.child(
                col()
                    .key(format!("queue-apr-{}", req.id))
                    .w_full()
                    .padding(12.0)
                    .gap(6.0)
                    .radius(8.0)
                    .fill(theme.amber.alpha(0.09))
                    .border(1.0, theme.amber.alpha(0.4))
                    .child(
                        row()
                            .w_full()
                            .justify_between()
                            .child(
                                text(req.title)
                                    .font(TextStyle::new(13.0, 600.0))
                                    .color(theme.text),
                            )
                            .child(
                                text(req.created_at)
                                    .font(theme.mono_sm)
                                    .color(theme.amber),
                            ),
                    )
                    .child(
                        text(if req.command.is_empty() {
                            req.summary
                        } else {
                            req.command
                        })
                        .font(theme.mono_sm)
                        .color(theme.text_muted),
                    )
                    .child(
                        row()
                            .gap(8.0)
                            .child(
                                Button::new("Approve Once")
                                    .variant(ButtonVariant::Submit)
                                    .control_size(ControlSize::Small)
                                    .on_press(move |s: &mut AppState| s.resolve_approval(&id1, "once"))
                                    .build(k),
                            )
                            .child(
                                Button::new("Always Allow")
                                    .variant(ButtonVariant::Neutral)
                                    .control_size(ControlSize::Small)
                                    .on_press(move |s: &mut AppState| s.resolve_approval(&id2, "always"))
                                    .build(k),
                            )
                            .child(
                                Button::new("Deny")
                                    .variant(ButtonVariant::Ghost)
                                    .control_size(ControlSize::Small)
                                    .on_press(move |s: &mut AppState| s.resolve_approval(&id3, "deny"))
                                    .build(k),
                            ),
                    ),
            );
        }
    }

    // 3. Cron Jobs Section
    let mut cron_section = col().key("queue-cron").w_full().gap(8.0).child(
        text(format!("Scheduled Cron Jobs ({})", state.cron_jobs.len()))
            .font(TextStyle::new(13.5, 700.0))
            .color(theme.text),
    );
    if state.cron_jobs.is_empty() {
        cron_section = cron_section.child(
            el().w_full()
                .padding(12.0)
                .radius(8.0)
                .fill(theme.bg.alpha(0.45))
                .border(0.75, theme.border)
                .child(
                    text("No gateway cron jobs registered.")
                        .font(theme.mono_sm)
                        .color(theme.text_faint),
                ),
        );
    } else {
        for job in &state.cron_jobs {
            let jid_run = job.id.clone();
            let jid_toggle = job.id.clone();
            let jid_del = job.id.clone();
            let next_act = if job.enabled { "pause" } else { "resume" };
            let next_label = if job.enabled { "Pause" } else { "Resume" };
            cron_section = cron_section.child(
                row()
                    .key(format!("cron-{}", job.id))
                    .w_full()
                    .padding(10.0)
                    .radius(8.0)
                    .fill(theme.card_fill)
                    .border(0.75, theme.border)
                    .justify_between()
                    .items_center()
                    .child(
                        col()
                            .gap(2.0)
                            .child(
                                text(format!("{} [{}]", job.name, job.schedule))
                                    .font(TextStyle::new(12.5, 600.0))
                                    .color(theme.text),
                            )
                            .child(
                                text(format!(
                                    "{} · last={} · next={}",
                                    if job.enabled { "active" } else { "paused" },
                                    job.last_run_at.as_deref().unwrap_or("-"),
                                    job.next_run_at.as_deref().unwrap_or("-")
                                ))
                                .font(theme.mono_sm)
                                .color(theme.text_muted),
                            ),
                    )
                    .child(
                        row()
                            .gap(6.0)
                            .child(
                                Button::new("Run Now")
                                    .variant(ButtonVariant::Neutral)
                                    .control_size(ControlSize::Mini)
                                    .on_press(move |s: &mut AppState| {
                                        s.pending_commands.push(UiCommand::ManageCronJob {
                                            job_id: jid_run.clone(),
                                            action: "run".into(),
                                        });
                                    })
                                    .build(k),
                            )
                            .child(
                                Button::new(next_label)
                                    .variant(ButtonVariant::Ghost)
                                    .control_size(ControlSize::Mini)
                                    .on_press(move |s: &mut AppState| {
                                        if let Some(j) = s.cron_jobs.iter_mut().find(|c| c.id == jid_toggle) {
                                            j.enabled = !j.enabled;
                                        }
                                        s.pending_commands.push(UiCommand::ManageCronJob {
                                            job_id: jid_toggle.clone(),
                                            action: next_act.into(),
                                        });
                                    })
                                    .build(k),
                            )
                            .child(
                                Button::new("Delete")
                                    .variant(ButtonVariant::Ghost)
                                    .control_size(ControlSize::Mini)
                                    .on_press(move |s: &mut AppState| {
                                        s.cron_jobs.retain(|c| c.id != jid_del);
                                        s.pending_commands.push(UiCommand::ManageCronJob {
                                            job_id: jid_del.clone(),
                                            action: "delete".into(),
                                        });
                                    })
                                    .build(k),
                            ),
                    ),
            );
        }
    }

    // 4. Skills & Toolsets Split Grid
    let mut skills_col = col().grow(1.0).min_w(0.0).gap(6.0).child(
        text(format!("Skills ({})", state.skills.len()))
            .font(TextStyle::new(13.0, 700.0))
            .color(theme.accent),
    );
    for sk in &state.skills {
        skills_col = skills_col.child(
            col()
                .w_full()
                .padding(8.0)
                .radius(6.0)
                .fill(theme.card_fill)
                .border(0.5, theme.border)
                .gap(2.0)
                .child(text(sk.name.clone()).font(TextStyle::new(12.0, 600.0)).color(theme.text))
                .child(text(sk.description.clone()).font(theme.mono_sm).color(theme.text_muted)),
        );
    }

    let mut tools_col = col().grow(1.0).min_w(0.0).gap(6.0).child(
        text(format!("Toolsets ({})", state.toolsets.len()))
            .font(TextStyle::new(13.0, 700.0))
            .color(theme.accent),
    );
    for ts in &state.toolsets {
        tools_col = tools_col.child(
            col()
                .w_full()
                .padding(8.0)
                .radius(6.0)
                .fill(theme.card_fill)
                .border(0.5, theme.border)
                .gap(2.0)
                .child(text(ts.name.clone()).font(TextStyle::new(12.0, 600.0)).color(theme.text))
                .child(
                    text(format!("{} — [{}]", ts.description, ts.tools.join(", ")))
                        .font(theme.mono_sm)
                        .color(theme.text_muted),
                ),
        );
    }

    let scroll_body = col()
        .w_full()
        .gap(14.0)
        .child(approvals_section)
        .child(Divider::horizontal().build(k))
        .child(cron_section)
        .child(Divider::horizontal().build(k))
        .child(
            row()
                .w_full()
                .gap(12.0)
                .items_start()
                .child(skills_col)
                .child(tools_col),
        );

    col()
        .key("queue-view")
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .h_full()
        .padding(14.0)
        .gap(12.0)
        .child(gateway_card)
        .child(
            col()
                .key("queue-scroll")
                .grow(1.0)
                .min_h(0.0)
                .w_full()
                .scroll(ScrollSpec { stick_bottom: false })
                .child(scroll_body),
        )
}
