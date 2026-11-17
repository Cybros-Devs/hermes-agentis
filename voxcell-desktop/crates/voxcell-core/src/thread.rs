use crate::tasks::dedupe_activity_entries;
use crate::types::{ActivityKind, EntryRole, TerminalEntry, TerminalOutcome};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TraceStepIcon {
    Reasoning,
    Commentary,
    Spawn,
    Tool,
    Link,
    Status,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClassifiedTraceStep {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub timestamp: String,
    pub icon: TraceStepIcon,
    pub is_reasoning: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ThreadTimelineBlock {
    Entry {
        id: String,
        entry: TerminalEntry,
    },
    Trace {
        id: String,
        items: Vec<ClassifiedTraceStep>,
        is_live: bool,
    },
}

pub fn classify_trace_step(entry: &TerminalEntry) -> ClassifiedTraceStep {
    let raw = entry.text.trim();
    let lower = raw.to_ascii_lowercase();

    if entry.activity_kind == Some(ActivityKind::Reasoning) {
        let stripped = raw
            .strip_prefix("reasoning:")
            .or_else(|| raw.strip_prefix("Reasoning:"))
            .or_else(|| raw.strip_prefix("reasoning —"))
            .or_else(|| raw.strip_prefix("Reasoning —"))
            .unwrap_or(raw)
            .trim();
        let detail = entry
            .reasoning_detail
            .as_deref()
            .unwrap_or(stripped)
            .trim()
            .to_string();
        return ClassifiedTraceStep {
            id: entry.id.clone(),
            label: "Reasoning".to_string(),
            detail,
            timestamp: entry.timestamp.clone(),
            icon: TraceStepIcon::Reasoning,
            is_reasoning: true,
        };
    }

    if entry.activity_kind == Some(ActivityKind::Commentary) {
        let detail = raw
            .strip_prefix("commentary:")
            .or_else(|| raw.strip_prefix("Commentary:"))
            .unwrap_or(raw)
            .trim()
            .to_string();
        return ClassifiedTraceStep {
            id: entry.id.clone(),
            label: "Commentary".to_string(),
            detail,
            timestamp: entry.timestamp.clone(),
            icon: TraceStepIcon::Commentary,
            is_reasoning: false,
        };
    }

    let icon = match entry.activity_kind {
        Some(ActivityKind::Subagent) => TraceStepIcon::Spawn,
        Some(ActivityKind::Tool) => TraceStepIcon::Tool,
        _ => {
            if lower.starts_with("reasoning:") || lower.starts_with("reasoning —") {
                TraceStepIcon::Reasoning
            } else if lower.contains("spawn") || lower.contains("agent") || lower.contains("session") {
                TraceStepIcon::Spawn
            } else if lower.contains("link")
                || lower.contains("http")
                || lower.contains("tab")
                || lower.contains("mcp")
                || lower.contains("gateway")
            {
                TraceStepIcon::Link
            } else if lower.contains("run")
                || lower.contains("exec")
                || lower.contains("tool")
                || lower.contains("read")
                || lower.contains("write")
                || lower.contains("search")
                || lower.contains("brief")
            {
                TraceStepIcon::Tool
            } else {
                TraceStepIcon::Status
            }
        }
    };

    let (label, detail) = if let Some(idx) = raw.find(':') {
        if idx > 2 && idx < 28 {
            (raw[..idx].trim().to_string(), raw[idx + 1..].trim().to_string())
        } else {
            (raw.to_string(), String::new())
        }
    } else if let Some(idx) = raw.find(" — ") {
        if idx > 2 && idx < 28 {
            (raw[..idx].trim().to_string(), raw[idx + " — ".len()..].trim().to_string())
        } else {
            (raw.to_string(), String::new())
        }
    } else {
        (raw.to_string(), String::new())
    };

    ClassifiedTraceStep {
        id: entry.id.clone(),
        label: if label.is_empty() {
            "Activity".to_string()
        } else {
            label
        },
        detail,
        timestamp: entry.timestamp.clone(),
        icon,
        is_reasoning: icon == TraceStepIcon::Reasoning,
    }
}

pub fn is_terminal_diagnostic_activity(entry: &TerminalEntry) -> bool {
    if entry.role != EntryRole::Activity {
        return false;
    }
    if matches!(
        entry.activity_kind,
        Some(
            ActivityKind::Tool
                | ActivityKind::Reasoning
                | ActivityKind::Subagent
                | ActivityKind::Commentary
        )
    ) {
        return false;
    }
    entry.error_code.is_some()
        || matches!(
            entry.terminal_outcome,
            Some(
                TerminalOutcome::Failed
                    | TerminalOutcome::Cancelled
                    | TerminalOutcome::AdmissionConflict
            )
        )
        || entry.activity_status.as_deref() == Some("error")
}

pub fn group_thread_timeline(
    entries: &[TerminalEntry],
    is_thinking: bool,
    include_live_placeholder: bool,
) -> Vec<ThreadTimelineBlock> {
    let mut blocks = Vec::new();
    let mut pending_raw: Vec<TerminalEntry> = Vec::new();
    let mut pending_first_id = String::new();

    let flush_trace = |live: bool,
                       pending: &mut Vec<TerminalEntry>,
                       first_id: &mut String,
                       out: &mut Vec<ThreadTimelineBlock>| {
        let deduped = dedupe_activity_entries(pending);
        if deduped.is_empty() && !live {
            pending.clear();
            first_id.clear();
            return;
        }
        out.push(ThreadTimelineBlock::Trace {
            id: if first_id.is_empty() {
                "trace-live".to_string()
            } else {
                first_id.clone()
            },
            items: deduped.iter().map(classify_trace_step).collect(),
            is_live: live,
        });
        pending.clear();
        first_id.clear();
    };

    for entry in entries {
        if entry.role == EntryRole::Activity && !is_terminal_diagnostic_activity(entry) {
            if pending_raw.is_empty() {
                pending_first_id = format!("trace-{}", entry.id);
            }
            pending_raw.push(entry.clone());
        } else {
            flush_trace(false, &mut pending_raw, &mut pending_first_id, &mut blocks);
            blocks.push(ThreadTimelineBlock::Entry {
                id: entry.id.clone(),
                entry: entry.clone(),
            });
        }
    }

    if !pending_raw.is_empty() || (is_thinking && include_live_placeholder) {
        flush_trace(is_thinking, &mut pending_raw, &mut pending_first_id, &mut blocks);
    }

    blocks
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScrollAnchorState {
    pub scroll_y: f32,
    pub content_h: f32,
    pub viewport_h: f32,
    pub pinned_to_bottom: bool,
}

impl ScrollAnchorState {
    pub fn max_scroll(&self) -> f32 {
        (self.content_h - self.viewport_h).max(0.0)
    }

    pub fn is_near_bottom(&self, threshold: f32) -> bool {
        self.max_scroll() - self.scroll_y <= threshold.max(1.0)
    }

    pub fn on_content_grow(&mut self) -> f32 {
        if self.pinned_to_bottom {
            self.scroll_y = self.max_scroll();
        }
        self.scroll_y
    }

    pub fn on_user_scroll(&mut self, next_y: f32) {
        self.scroll_y = next_y.clamp(0.0, self.max_scroll());
        self.pinned_to_bottom = self.is_near_bottom(28.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_consecutive_activities_and_keeps_terminal_errors_visible() {
        let mut a1 = TerminalEntry::new("1", "ch", EntryRole::Activity, "terminal: ls", "12:00");
        a1.activity_kind = Some(ActivityKind::Tool);
        let mut a2 = TerminalEntry::new("2", "ch", EntryRole::Activity, "Reasoning: plan step", "12:00");
        a2.activity_kind = Some(ActivityKind::Reasoning);
        let mut err = TerminalEntry::new("3", "ch", EntryRole::Activity, "gateway_offline", "12:01");
        err.error_code = Some("gateway_offline".into());
        let reply = TerminalEntry::new("4", "ch", EntryRole::Hermes, "Done", "12:02");

        let blocks = group_thread_timeline(&[a1, a2, err, reply], false, true);
        assert_eq!(blocks.len(), 3);
        assert!(matches!(&blocks[0], ThreadTimelineBlock::Trace { items, .. } if items.len() == 2));
        assert!(matches!(&blocks[1], ThreadTimelineBlock::Entry { id, .. } if id == "3"));
        assert!(matches!(&blocks[2], ThreadTimelineBlock::Entry { id, .. } if id == "4"));
    }

    #[test]
    fn maintains_bottom_scroll_pin_until_user_scrolls_up() {
        let mut s = ScrollAnchorState {
            scroll_y: 400.0,
            content_h: 800.0,
            viewport_h: 400.0,
            pinned_to_bottom: true,
        };
        s.content_h = 960.0;
        assert_eq!(s.on_content_grow(), 560.0);

        s.on_user_scroll(200.0);
        assert!(!s.pinned_to_bottom);
        s.content_h = 1100.0;
        assert_eq!(s.on_content_grow(), 200.0);
    }
}
