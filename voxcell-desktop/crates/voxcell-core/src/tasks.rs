use crate::types::{
    ActivityKind, BackgroundTask, ChannelMeta, EntryRole, HermesAgentSession, SessionStatus,
    TaskLifecycleStatus, TaskStepItem, TerminalEntry,
};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResolvedStepState {
    Done,
    Active,
    Pending,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedTaskStep {
    pub text: String,
    pub state: ResolvedStepState,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TaskStepBreakdown {
    pub steps: Vec<ResolvedTaskStep>,
    pub completed_count: usize,
    pub total_count: usize,
    pub active_step_text: String,
    pub ratio_label: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TaskProgressInfo {
    pub pct: u8,
    pub ratio_label: String,
    pub is_indeterminate: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskTone {
    Amber,
    Emerald,
    Slate,
    Rose,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskPulseState {
    Thinking,
    Live,
    Waiting,
    Done,
    Error,
    Idle,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TaskStatusDisplay {
    pub label: &'static str,
    pub pulse_state: TaskPulseState,
    pub tone: TaskTone,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskConfirmationState {
    Confirmed,
    NeedsConfirm,
    Open,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChannelTaskPartition {
    pub running: Vec<BackgroundTask>,
    pub paused: Vec<BackgroundTask>,
    pub completed: Vec<BackgroundTask>,
    pub all: Vec<BackgroundTask>,
}

#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct ChannelTaskSummary {
    pub channel_id: String,
    pub running_count: usize,
    pub paused_count: usize,
    pub completed_count: usize,
    pub is_thinking: bool,
    pub has_active_task: bool,
    pub primary_title: Option<String>,
    pub started_at_ms: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ThreadTasksSummary {
    pub total_count: usize,
    pub running_count: usize,
    pub paused_count: usize,
    pub needs_confirm_count: usize,
    pub confirmed_count: usize,
    pub header_badge: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ThreadTaskAggregateOverview {
    pub total_tasks: usize,
    pub active_count: usize,
    pub paused_count: usize,
    pub completed_count: usize,
    pub failed_count: usize,
    pub aggregate_pct: u8,
}

pub fn format_elapsed_duration(created_at_ms: Option<u64>, now_ms: u64, show_seconds: bool) -> String {
    let Some(created) = created_at_ms else {
        return "0s".to_string();
    };
    let total_seconds = now_ms.saturating_sub(created) / 1000;
    if total_seconds < 60 {
        return format!("{total_seconds}s");
    }
    let total_minutes = total_seconds / 60;
    let seconds = total_seconds % 60;
    if total_minutes < 60 {
        if show_seconds {
            format!("{total_minutes}m {seconds:02}s")
        } else {
            format!("{total_minutes}m")
        }
    } else {
        let hours = total_minutes / 60;
        let minutes = total_minutes % 60;
        format!("{hours}h {minutes:02}m")
    }
}

pub fn get_task_confirmation_state(task: &BackgroundTask) -> TaskConfirmationState {
    if task.confirmed_at_ms.is_some() {
        return TaskConfirmationState::Confirmed;
    }
    let raw = task.raw_status.as_deref().unwrap_or("");
    if task.status == TaskLifecycleStatus::Completed || raw == "done" {
        if raw == "failed" || raw == "cancelled" {
            return TaskConfirmationState::Open;
        }
        return TaskConfirmationState::NeedsConfirm;
    }
    TaskConfirmationState::Open
}

pub fn get_task_status_display(task: &BackgroundTask) -> TaskStatusDisplay {
    let raw = task.raw_status.as_deref().unwrap_or("");
    if raw == "failed" {
        return TaskStatusDisplay {
            label: "Failed",
            pulse_state: TaskPulseState::Error,
            tone: TaskTone::Rose,
        };
    }
    if raw == "cancelled" || raw == "interrupted" {
        return TaskStatusDisplay {
            label: "Cancelled",
            pulse_state: TaskPulseState::Idle,
            tone: TaskTone::Slate,
        };
    }
    if raw == "iteration_budget_exhausted"
        || task.error_code.as_deref() == Some("iteration_budget_exhausted")
    {
        return TaskStatusDisplay {
            label: "Budget limit",
            pulse_state: TaskPulseState::Waiting,
            tone: TaskTone::Amber,
        };
    }
    match task.status {
        TaskLifecycleStatus::Running => {
            if raw == "queued" {
                TaskStatusDisplay {
                    label: "Queued",
                    pulse_state: TaskPulseState::Thinking,
                    tone: TaskTone::Amber,
                }
            } else {
                TaskStatusDisplay {
                    label: "Working",
                    pulse_state: TaskPulseState::Thinking,
                    tone: TaskTone::Amber,
                }
            }
        }
        TaskLifecycleStatus::Paused => {
            if raw == "waiting" || raw == "waiting_for_approval" {
                TaskStatusDisplay {
                    label: "Waiting",
                    pulse_state: TaskPulseState::Waiting,
                    tone: TaskTone::Amber,
                }
            } else {
                TaskStatusDisplay {
                    label: "Paused",
                    pulse_state: TaskPulseState::Idle,
                    tone: TaskTone::Slate,
                }
            }
        }
        TaskLifecycleStatus::Completed => TaskStatusDisplay {
            label: "Done",
            pulse_state: TaskPulseState::Done,
            tone: TaskTone::Emerald,
        },
    }
}

pub fn resolve_task_step_breakdown(task: &BackgroundTask) -> TaskStepBreakdown {
    let raw = task.raw_status.as_deref().unwrap_or("");
    if !task.steps.is_empty() {
        if task.status == TaskLifecycleStatus::Completed && raw != "failed" && raw != "cancelled" {
            let steps: Vec<ResolvedTaskStep> = task
                .steps
                .iter()
                .map(|s| ResolvedTaskStep {
                    text: s.text.clone(),
                    state: ResolvedStepState::Done,
                })
                .collect();
            let total = steps.len();
            let active_step_text = task
                .last_step
                .clone()
                .or_else(|| steps.last().map(|s| s.text.clone()))
                .unwrap_or_else(|| task.title.clone());
            return TaskStepBreakdown {
                steps,
                completed_count: total,
                total_count: total,
                active_step_text,
                ratio_label: format!("{total}/{total}"),
            };
        }

        let active_idx = task
            .steps
            .iter()
            .position(|s| s.active && !s.done)
            .or_else(|| task.steps.iter().position(|s| !s.done));

        let steps: Vec<ResolvedTaskStep> = task
            .steps
            .iter()
            .enumerate()
            .map(|(idx, s)| {
                let state = if s.done {
                    ResolvedStepState::Done
                } else if Some(idx) == active_idx && raw != "cancelled" && raw != "failed" {
                    ResolvedStepState::Active
                } else {
                    ResolvedStepState::Pending
                };
                ResolvedTaskStep {
                    text: s.text.clone(),
                    state,
                }
            })
            .collect();

        let completed_count = steps.iter().filter(|s| s.state == ResolvedStepState::Done).count();
        let total_count = steps.len();
        let active_step_text = active_idx
            .and_then(|i| steps.get(i))
            .map(|s| s.text.clone())
            .or_else(|| task.last_step.clone())
            .unwrap_or_else(|| task.title.clone());

        return TaskStepBreakdown {
            steps,
            completed_count,
            total_count,
            active_step_text,
            ratio_label: format!("{completed_count}/{total_count}"),
        };
    }

    let parsed_frac = task.progress_label.as_deref().and_then(parse_fraction_label);
    let fallback_text = task
        .last_step
        .clone()
        .unwrap_or_else(|| task.title.clone());
    let is_terminal_failure = raw == "failed" || raw == "cancelled";
    let fallback_state = if task.status == TaskLifecycleStatus::Completed && !is_terminal_failure {
        ResolvedStepState::Done
    } else if task.status == TaskLifecycleStatus::Running {
        ResolvedStepState::Active
    } else {
        ResolvedStepState::Pending
    };

    let (completed_count, total_count, ratio_label) = match parsed_frac {
        Some((done, total)) => (done, total.max(1), format!("{done}/{}", total.max(1))),
        None => (
            if task.status == TaskLifecycleStatus::Completed && !is_terminal_failure {
                1
            } else {
                0
            },
            1,
            format!("{}%", task.progress.round().clamp(0.0, 100.0) as u8),
        ),
    };

    TaskStepBreakdown {
        steps: vec![ResolvedTaskStep {
            text: fallback_text.clone(),
            state: fallback_state,
        }],
        completed_count,
        total_count,
        active_step_text: fallback_text,
        ratio_label,
    }
}

fn parse_fraction_label(label: &str) -> Option<(usize, usize)> {
    let (a, b) = label.trim().split_once('/')?;
    let done: usize = a.trim().parse().ok()?;
    let total: usize = b.trim().parse().ok()?;
    Some((done, total))
}

pub fn resolve_task_progress(task: &BackgroundTask) -> TaskProgressInfo {
    let breakdown = resolve_task_step_breakdown(task);
    let raw = task.raw_status.as_deref().unwrap_or("");
    if task.status == TaskLifecycleStatus::Completed && raw != "failed" && raw != "cancelled" {
        return TaskProgressInfo {
            pct: 100,
            ratio_label: breakdown.ratio_label,
            is_indeterminate: false,
        };
    }

    let mut pct = if task.progress.is_finite() {
        task.progress.round().clamp(0.0, 100.0) as u8
    } else {
        0
    };
    if breakdown.total_count > 1 || !task.steps.is_empty() {
        let step_pct = ((breakdown.completed_count as f32 / breakdown.total_count.max(1) as f32)
            * 100.0)
            .round()
            .clamp(0.0, 100.0) as u8;
        if step_pct > 0 || pct == 0 {
            pct = step_pct;
        }
    }

    TaskProgressInfo {
        pct,
        ratio_label: breakdown.ratio_label,
        is_indeterminate: task.status == TaskLifecycleStatus::Running && pct == 0,
    }
}

pub fn partition_channel_tasks(tasks: &[BackgroundTask], channel_id: &str) -> ChannelTaskPartition {
    let mut running = Vec::new();
    let mut paused = Vec::new();
    let mut completed = Vec::new();

    for t in tasks.iter().filter(|t| t.channel_id == channel_id) {
        match t.status {
            TaskLifecycleStatus::Running => running.push(t.clone()),
            TaskLifecycleStatus::Paused => paused.push(t.clone()),
            TaskLifecycleStatus::Completed => completed.push(t.clone()),
        }
    }

    let recency = |t: &BackgroundTask| t.updated_at_ms.or(t.created_at_ms).unwrap_or(0);
    running.sort_by(|a, b| recency(b).cmp(&recency(a)));
    paused.sort_by(|a, b| recency(b).cmp(&recency(a)));
    completed.sort_by(|a, b| {
        let a_needs = matches!(get_task_confirmation_state(a), TaskConfirmationState::NeedsConfirm);
        let b_needs = matches!(get_task_confirmation_state(b), TaskConfirmationState::NeedsConfirm);
        b_needs.cmp(&a_needs).then_with(|| recency(b).cmp(&recency(a)))
    });

    let mut all = Vec::with_capacity(running.len() + paused.len() + completed.len());
    all.extend(running.iter().cloned());
    all.extend(paused.iter().cloned());
    all.extend(completed.iter().cloned());

    ChannelTaskPartition {
        running,
        paused,
        completed,
        all,
    }
}

pub fn summarize_thread_tasks(
    partition: &ChannelTaskPartition,
    active_is_thinking: bool,
) -> ThreadTasksSummary {
    let has_running = !partition.running.is_empty();
    let synthetic = usize::from(active_is_thinking && !has_running);
    let total_count = partition.all.len() + synthetic;
    let running_count = partition.running.len() + synthetic;
    let paused_count = partition.paused.len();
    let mut needs_confirm_count = 0;
    let mut confirmed_count = 0;

    for t in &partition.completed {
        match get_task_confirmation_state(t) {
            TaskConfirmationState::NeedsConfirm => needs_confirm_count += 1,
            TaskConfirmationState::Confirmed => confirmed_count += 1,
            TaskConfirmationState::Open => {}
        }
    }

    let header_badge = if running_count > 0 {
        format!("{running_count} active")
    } else if paused_count > 0 {
        format!("{paused_count} paused")
    } else if needs_confirm_count > 0 {
        format!("{needs_confirm_count} to confirm")
    } else if total_count > 0 {
        format!("{total_count} done")
    } else {
        String::new()
    };

    ThreadTasksSummary {
        total_count,
        running_count,
        paused_count,
        needs_confirm_count,
        confirmed_count,
        header_badge,
    }
}

pub fn summarize_thread_task_aggregate(
    partition: &ChannelTaskPartition,
    active_is_thinking: bool,
) -> ThreadTaskAggregateOverview {
    let synthetic = usize::from(active_is_thinking && partition.running.is_empty());
    let active_count = partition.running.len() + synthetic;
    let paused_count = partition.paused.len();
    let completed_count = partition.completed.len();
    let failed_count = partition
        .completed
        .iter()
        .filter(|t| matches!(t.raw_status.as_deref(), Some("failed") | Some("cancelled")))
        .count();
    let total_tasks = partition.all.len() + synthetic;

    if total_tasks == 0 {
        return ThreadTaskAggregateOverview {
            total_tasks: 0,
            active_count: 0,
            paused_count: 0,
            completed_count: 0,
            failed_count: 0,
            aggregate_pct: 0,
        };
    }

    let pct_sum: usize = partition
        .all
        .iter()
        .map(|t| resolve_task_progress(t).pct as usize)
        .sum();
    let aggregate_pct = (pct_sum / total_tasks).min(100) as u8;

    ThreadTaskAggregateOverview {
        total_tasks,
        active_count,
        paused_count,
        completed_count,
        failed_count,
        aggregate_pct,
    }
}

pub fn summarize_channel_task_activity(
    tasks: &[BackgroundTask],
    channels: &[ChannelMeta],
    thinking_by_channel: &HashMap<String, bool>,
) -> HashMap<String, ChannelTaskSummary> {
    let mut map: HashMap<String, ChannelTaskSummary> = HashMap::new();

    let ensure = |map: &mut HashMap<String, ChannelTaskSummary>, id: &str| {
        if !map.contains_key(id) {
            let thinking = thinking_by_channel.get(id).copied().unwrap_or(false);
            map.insert(
                id.to_string(),
                ChannelTaskSummary {
                    channel_id: id.to_string(),
                    running_count: 0,
                    paused_count: 0,
                    completed_count: 0,
                    is_thinking: thinking,
                    has_active_task: thinking,
                    primary_title: None,
                    started_at_ms: None,
                },
            );
        }
    };

    for ch in channels {
        ensure(&mut map, &ch.id);
    }
    for id in thinking_by_channel.keys() {
        ensure(&mut map, id);
    }

    for task in tasks {
        ensure(&mut map, &task.channel_id);
        let entry = map.get_mut(&task.channel_id).expect("inserted above");
        match task.status {
            TaskLifecycleStatus::Running => {
                entry.running_count += 1;
                entry.has_active_task = true;
                if entry.primary_title.is_none() {
                    entry.primary_title = Some(task.title.clone());
                }
                if let Some(created) = task.created_at_ms {
                    entry.started_at_ms = Some(match entry.started_at_ms {
                        Some(prev) => prev.min(created),
                        None => created,
                    });
                }
            }
            TaskLifecycleStatus::Paused => entry.paused_count += 1,
            TaskLifecycleStatus::Completed => entry.completed_count += 1,
        }
    }

    map
}

pub fn derive_turn_task_title(prompt: &str, fallback_label: Option<&str>) -> String {
    let stripped = prompt
        .replace("https://www.", "")
        .replace("http://www.", "")
        .replace("https://", "")
        .replace("http://", "");
    let normalized: String = stripped.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return fallback_label
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Active session turn")
            .to_string();
    }
    if normalized.chars().count() <= 64 {
        return normalized;
    }
    let clipped: String = normalized.chars().take(61).collect();
    if let Some(idx) = clipped.rfind(' ') {
        if clipped[..idx].chars().count() > 36 {
            return format!("{}…", clipped[..idx].trim_end());
        }
    }
    format!("{}…", clipped.trim_end())
}

fn is_vague_prompt(raw: &str) -> bool {
    let lower = raw.trim().to_ascii_lowercase();
    let trimmed = lower.trim_end_matches(['.', '!', '?']).trim();
    matches!(
        trimmed,
        "go" | "yes"
            | "yep"
            | "ok"
            | "okay"
            | "sure"
            | "continue"
            | "next"
            | "proceed"
            | "try again"
            | "retry"
            | "check"
            | "status"
            | "what do you suggest"
            | "what should we do"
            | "any thoughts"
    )
}

fn is_bootstrap_or_composing_step(text: &str) -> bool {
    let lower = text.trim().to_ascii_lowercase();
    lower.starts_with("working in ")
        || lower.starts_with("routing ")
        || lower == "composing response"
}

pub fn resolve_task_display_title(task: &BackgroundTask) -> String {
    let raw = task.title.trim();
    if raw.is_empty() {
        return "Active task".to_string();
    }
    if !is_vague_prompt(raw) {
        return raw.to_string();
    }
    for s in &task.steps {
        let txt = s.text.trim();
        let lower = txt.to_ascii_lowercase();
        if !txt.is_empty()
            && !lower.starts_with("running ")
            && !is_bootstrap_or_composing_step(txt)
            && lower != "completed response"
        {
            return derive_turn_task_title(txt, Some(raw));
        }
    }
    if let Some(last) = task.last_step.as_deref() {
        let lower = last.trim().to_ascii_lowercase();
        if !lower.starts_with("running ") && !is_bootstrap_or_composing_step(last) {
            return derive_turn_task_title(last, Some(raw));
        }
    }
    raw.to_string()
}

fn extract_tool_needle_from_text(text: &str) -> String {
    let trimmed = text.trim().to_ascii_lowercase();
    if let Some(rest) = trimmed.strip_prefix("running ") {
        return rest.split([' ', ':']).next().unwrap_or("").to_string();
    }
    if let Some(colon) = trimmed.find(':') {
        if colon > 0 && colon < 32 {
            return trimmed[..colon].trim().to_string();
        }
    }
    if let Some(dash) = trimmed.find(" — ") {
        if dash > 0 && dash < 32 {
            return trimmed[..dash].trim().to_string();
        }
    }
    trimmed.split_whitespace().next().unwrap_or("").to_string()
}

fn is_terminal_tool_done(status: &str) -> bool {
    matches!(
        status,
        "done" | "completed" | "complete" | "finished" | "finish" | "success" | "succeeded" | "passed" | "pass" | "ok"
    )
}

fn is_terminal_tool_error(status: &str) -> bool {
    matches!(status, "error" | "failed" | "cancelled" | "canceled" | "stopped")
}

pub fn apply_tool_progress_to_steps(
    prev_steps: &[TaskStepItem],
    tool_name: &str,
    label: Option<&str>,
    status: &str,
    summary: Option<&str>,
) -> (Vec<TaskStepItem>, String) {
    let norm = status.trim().to_ascii_lowercase();
    let is_done = is_terminal_tool_done(&norm);
    let is_err = is_terminal_tool_error(&norm);
    let step_text = summary
        .or(label)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(if tool_name.is_empty() { "tool" } else { tool_name })
        .trim()
        .to_string();
    let tool_needle = tool_name.trim().to_ascii_lowercase();
    let is_generic_placeholder = step_text.to_ascii_lowercase().starts_with("running ");

    let mut next: Vec<TaskStepItem> = prev_steps.to_vec();

    if !is_done && !is_err {
        let upgrade_idx = if !is_generic_placeholder && !tool_needle.is_empty() {
            next.iter().position(|s| {
                !s.done
                    && s.text.trim().to_ascii_lowercase().starts_with("running ")
                    && extract_tool_needle_from_text(&s.text) == tool_needle
            })
        } else {
            None
        };

        if let Some(idx) = upgrade_idx {
            for (i, item) in next.iter_mut().enumerate() {
                if i != idx && !item.done && (item.active || is_bootstrap_or_composing_step(&item.text)) {
                    item.done = true;
                    item.active = false;
                }
            }
            next[idx] = TaskStepItem {
                text: step_text,
                done: false,
                active: true,
            };
        } else {
            for item in &mut next {
                if !item.done && (item.active || is_bootstrap_or_composing_step(&item.text)) {
                    item.done = true;
                    item.active = false;
                }
            }
            next.push(TaskStepItem {
                text: step_text,
                done: false,
                active: true,
            });
        }
    } else {
        let match_idx = next.iter().rposition(|s| {
            !s.done
                && ((!tool_needle.is_empty()
                    && s.text.to_ascii_lowercase().contains(&tool_needle))
                    || s.active)
        });

        if let Some(idx) = match_idx {
            let existing = &next[idx];
            let prefer_new = !is_generic_placeholder
                && (step_text.len() > existing.text.len()
                    || existing.text.trim().to_ascii_lowercase().starts_with("running "));
            next[idx] = TaskStepItem {
                text: if prefer_new {
                    step_text
                } else {
                    existing.text.clone()
                },
                done: !is_err,
                active: false,
            };
        } else {
            let upgrade_last = next.last().is_some_and(|last| {
                !is_generic_placeholder
                    && last.text.trim().to_ascii_lowercase().starts_with("running ")
                    && !tool_needle.is_empty()
                    && extract_tool_needle_from_text(&last.text) == tool_needle
            });
            if upgrade_last {
                if let Some(last) = next.last_mut() {
                    *last = TaskStepItem {
                        text: step_text,
                        done: !is_err,
                        active: false,
                    };
                }
            } else {
                next.push(TaskStepItem {
                    text: step_text,
                    done: !is_err,
                    active: false,
                });
            }
        }
    }

    let done_count = next.iter().filter(|s| s.done).count();
    let ratio = format!("{done_count}/{}", next.len().max(1));
    (next, ratio)
}

pub fn apply_streaming_delta_to_steps(prev_steps: &[TaskStepItem]) -> (Vec<TaskStepItem>, String, bool) {
    if let Some(last) = prev_steps.last() {
        if !last.done && last.active && last.text == "Composing response" {
            let done_count = prev_steps.iter().filter(|s| s.done).count();
            return (
                prev_steps.to_vec(),
                format!("{done_count}/{}", prev_steps.len().max(1)),
                false,
            );
        }
    }
    let mut next: Vec<TaskStepItem> = prev_steps
        .iter()
        .map(|s| TaskStepItem {
            text: s.text.clone(),
            done: true,
            active: false,
        })
        .collect();
    next.push(TaskStepItem {
        text: "Composing response".to_string(),
        done: false,
        active: true,
    });
    let done_count = next.iter().filter(|s| s.done).count();
    let ratio = format!("{done_count}/{}", next.len());
    (next, ratio, true)
}

pub fn dedupe_activity_entries(activities: &[TerminalEntry]) -> Vec<TerminalEntry> {
    let mut result: Vec<TerminalEntry> = Vec::with_capacity(activities.len());
    for entry in activities {
        let trimmed = entry.text.trim();
        let is_generic = trimmed.to_ascii_lowercase().starts_with("running ");
        let needle = extract_tool_needle_from_text(trimmed);

        if let Some(prev) = result.last() {
            if !needle.is_empty()
                && entry.activity_kind != Some(ActivityKind::Reasoning)
                && prev.activity_kind != Some(ActivityKind::Reasoning)
            {
                let prev_trimmed = prev.text.trim();
                let prev_generic = prev_trimmed.to_ascii_lowercase().starts_with("running ");
                let prev_needle = extract_tool_needle_from_text(prev_trimmed);

                if prev_generic && prev_needle == needle && !is_generic {
                    *result.last_mut().expect("non-empty") = entry.clone();
                    continue;
                }
                if !prev_generic
                    && is_generic
                    && prev_needle == needle
                    && prev.activity_status.as_deref() != Some("done")
                {
                    continue;
                }
            }
        }
        result.push(entry.clone());
    }
    result
}

pub fn is_activity_entry_running(entry: &TerminalEntry) -> bool {
    if entry.role != EntryRole::Activity {
        return false;
    }
    if let Some(status) = entry.activity_status.as_deref() {
        let s = status.trim().to_ascii_lowercase();
        if is_terminal_tool_done(&s) || is_terminal_tool_error(&s) {
            return false;
        }
        if matches!(s.as_str(), "running" | "queued" | "thinking") {
            return true;
        }
    }
    entry.text.trim().to_ascii_lowercase().starts_with("running ")
}

pub fn merge_tasks_with_session_activity(
    tasks: &[BackgroundTask],
    entries: &[TerminalEntry],
    sessions: &[HermesAgentSession],
    thinking_by_channel: &HashMap<String, bool>,
    channels: &[ChannelMeta],
    now_ms: u64,
) -> Vec<BackgroundTask> {
    let running_channels: HashSet<&str> = tasks
        .iter()
        .filter(|t| t.status == TaskLifecycleStatus::Running)
        .map(|t| t.channel_id.as_str())
        .collect();

    let mut candidate_channels: HashSet<String> = HashSet::new();
    for (ch_id, thinking) in thinking_by_channel {
        if *thinking {
            candidate_channels.insert(ch_id.clone());
        }
    }
    for s in sessions {
        if matches!(
            s.status,
            SessionStatus::Thinking | SessionStatus::Speaking | SessionStatus::Running
        ) {
            candidate_channels.insert(s.channel_id.clone());
        }
    }
    for e in entries {
        candidate_channels.insert(e.channel_id.clone());
    }

    let mut synthetic = Vec::new();
    for ch_id in candidate_channels {
        if running_channels.contains(ch_id.as_str()) {
            continue;
        }
        let ch_entries: Vec<TerminalEntry> = entries
            .iter()
            .filter(|e| e.channel_id == ch_id)
            .cloned()
            .collect();
        let session = sessions.iter().find(|s| s.channel_id == ch_id);
        let meta = channels.iter().find(|c| c.id == ch_id);

        let mut latest_prompt = String::new();
        let mut last_settled_idx: Option<usize> = None;
        let mut last_user_idx: Option<usize> = None;
        for (i, e) in ch_entries.iter().enumerate() {
            if matches!(e.role, EntryRole::User | EntryRole::Command) {
                last_user_idx = Some(i);
                if !e.text.trim().starts_with('/') {
                    latest_prompt = e.text.trim().to_string();
                }
            } else if e.role == EntryRole::Hermes && !e.streaming {
                last_settled_idx = Some(i);
            }
        }
        let start = match (last_settled_idx, last_user_idx) {
            (Some(a), Some(b)) => a.max(b) + 1,
            (Some(a), None) => a + 1,
            (None, Some(b)) => b + 1,
            (None, None) => 0,
        };
        let trailing_activities: Vec<TerminalEntry> = ch_entries[start.min(ch_entries.len())..]
            .iter()
            .filter(|e| e.role == EntryRole::Activity)
            .cloned()
            .collect();
        let has_active_activity = trailing_activities.iter().any(is_activity_entry_running);

        let is_busy = thinking_by_channel.get(&ch_id).copied().unwrap_or(false)
            || session.is_some_and(|s| {
                matches!(
                    s.status,
                    SessionStatus::Thinking | SessionStatus::Speaking | SessionStatus::Running
                )
            })
            || has_active_activity;

        if !is_busy {
            continue;
        }

        let session_id = session
            .map(|s| s.session_id.clone())
            .or_else(|| meta.map(|m| m.session_id.clone()))
            .unwrap_or_else(|| format!("hermes-{ch_id}"));
        let title_seed = if !latest_prompt.is_empty() {
            latest_prompt
        } else {
            session
                .map(|s| s.last_message.clone())
                .or_else(|| meta.map(|m| m.description.clone()))
                .unwrap_or_default()
        };
        let title = derive_turn_task_title(&title_seed, Some(&format!("#{ch_id}")));
        let deduped = dedupe_activity_entries(&trailing_activities);
        let steps: Vec<TaskStepItem> = if deduped.is_empty() {
            vec![TaskStepItem {
                text: format!("Working in {session_id}"),
                done: false,
                active: true,
            }]
        } else {
            let last_idx = deduped.len() - 1;
            deduped
                .iter()
                .enumerate()
                .map(|(i, e)| {
                    let active = i == last_idx && (is_activity_entry_running(e) || e.activity_status.is_none());
                    TaskStepItem {
                        text: e.text.trim().to_string(),
                        done: !active,
                        active,
                    }
                })
                .collect()
        };
        let done_count = steps.iter().filter(|s| s.done).count();
        let pct = ((done_count as f32 / steps.len().max(1) as f32) * 100.0).round();
        let last_step = steps
            .iter()
            .rev()
            .find(|s| s.active)
            .or_else(|| steps.last())
            .map(|s| s.text.clone());

        synthetic.push(BackgroundTask {
            id: format!("live-turn-{ch_id}"),
            channel_id: ch_id,
            session_id,
            kind: Some("In chat".to_string()),
            background: Some(false),
            title,
            status: TaskLifecycleStatus::Running,
            raw_status: Some("running".to_string()),
            progress: pct,
            progress_label: Some(format!("{done_count}/{}", steps.len())),
            last_step,
            steps,
            result: None,
            error_code: None,
            created_at_ms: Some(now_ms),
            updated_at_ms: Some(now_ms),
            agent_done_at_ms: None,
            confirmed_at_ms: None,
            updated_at: "live".to_string(),
        });
    }

    let mut merged = tasks.to_vec();
    merged.extend(synthetic);
    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_task(status: TaskLifecycleStatus) -> BackgroundTask {
        BackgroundTask {
            id: "t1".into(),
            channel_id: "ch1".into(),
            session_id: "s1".into(),
            kind: Some("Background".into()),
            background: Some(true),
            title: "Build RUNE client".into(),
            status,
            raw_status: None,
            progress: 0.0,
            progress_label: None,
            last_step: None,
            steps: vec![
                TaskStepItem { text: "Parse schema".into(), done: true, active: false },
                TaskStepItem { text: "Compile".into(), done: false, active: true },
            ],
            result: None,
            error_code: None,
            created_at_ms: Some(1_000),
            updated_at_ms: Some(5_000),
            agent_done_at_ms: None,
            confirmed_at_ms: None,
            updated_at: "now".into(),
        }
    }

    #[test]
    fn formats_durations() {
        assert_eq!(format_elapsed_duration(Some(1000), 42_000, true), "41s");
        assert_eq!(format_elapsed_duration(Some(0), 248_000, true), "4m 08s");
        assert_eq!(format_elapsed_duration(Some(0), 4_020_000, true), "1h 07m");
    }

    #[test]
    fn upgrades_generic_running_placeholder_in_place() {
        let initial = vec![TaskStepItem {
            text: "Running terminal".into(),
            done: false,
            active: true,
        }];
        let (steps, ratio) = apply_tool_progress_to_steps(
            &initial,
            "terminal",
            Some("terminal: cargo test"),
            "running",
            None,
        );
        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0].text, "terminal: cargo test");
        assert_eq!(ratio, "0/1");

        let (done_steps, done_ratio) = apply_tool_progress_to_steps(
            &steps,
            "terminal",
            None,
            "done",
            Some("terminal: cargo test passed"),
        );
        assert_eq!(done_steps.len(), 1);
        assert!(done_steps[0].done);
        assert_eq!(done_ratio, "1/1");
    }

    #[test]
    fn resolves_progress_and_display_title() {
        let mut t = sample_task(TaskLifecycleStatus::Running);
        let p = resolve_task_progress(&t);
        assert_eq!(p.pct, 50);
        assert_eq!(p.ratio_label, "1/2");

        t.title = "go".into();
        t.steps[0].text = "Run gateway check".into();
        assert_eq!(resolve_task_display_title(&t), "Run gateway check");
    }
}
