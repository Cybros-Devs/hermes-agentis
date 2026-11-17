use crate::tasks::ChannelTaskSummary;
use crate::types::{ChannelMeta, SessionOrigin, SessionScopeTab};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SidebarSessionBucket {
    Workspace,
    External,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SidebarSessionItem {
    pub channel: ChannelMeta,
    pub bucket: SidebarSessionBucket,
    pub is_active_work: bool,
    pub activity_label: Option<String>,
}

pub fn classify_sidebar_session(ch: &ChannelMeta) -> SidebarSessionBucket {
    match ch.origin {
        SessionOrigin::External => SidebarSessionBucket::External,
        SessionOrigin::Workspace => SidebarSessionBucket::Workspace,
    }
}

pub fn build_sidebar_session_list(
    channels: &[ChannelMeta],
    scope: SessionScopeTab,
    search_query: &str,
    task_summary_by_channel: &HashMap<String, ChannelTaskSummary>,
) -> Vec<SidebarSessionItem> {
    let q = search_query.trim().to_ascii_lowercase();
    let target_bucket = match scope {
        SessionScopeTab::Sessions => SidebarSessionBucket::Workspace,
        SessionScopeTab::Gateway => SidebarSessionBucket::External,
    };

    let mut items: Vec<SidebarSessionItem> = channels
        .iter()
        .filter(|ch| classify_sidebar_session(ch) == target_bucket)
        .filter(|ch| {
            if q.is_empty() {
                return true;
            }
            ch.name.to_ascii_lowercase().contains(&q)
                || ch.description.to_ascii_lowercase().contains(&q)
                || ch.session_id.to_ascii_lowercase().contains(&q)
        })
        .map(|ch| {
            let summary = task_summary_by_channel.get(&ch.id);
            let is_active_work = summary.is_some_and(|s| s.has_active_task || s.paused_count > 0);
            let activity_label = summary.and_then(|s| {
                if s.running_count > 0 {
                    Some(format!("{} running", s.running_count))
                } else if s.paused_count > 0 {
                    Some(format!("{} waiting", s.paused_count))
                } else if s.is_thinking {
                    Some("thinking".to_string())
                } else {
                    None
                }
            });
            SidebarSessionItem {
                channel: ch.clone(),
                bucket: target_bucket,
                is_active_work,
                activity_label,
            }
        })
        .collect();

    items.sort_by(|a, b| {
        b.is_active_work
            .cmp(&a.is_active_work)
            .then_with(|| {
                b.channel
                    .updated_at_ms
                    .unwrap_or(0)
                    .cmp(&a.channel.updated_at_ms.unwrap_or(0))
            })
            .then_with(|| a.channel.name.cmp(&b.channel.name))
    });
    items
}

pub fn count_sidebar_buckets(channels: &[ChannelMeta]) -> (usize, usize) {
    let mut workspace = 0;
    let mut external = 0;
    for ch in channels {
        match classify_sidebar_session(ch) {
            SidebarSessionBucket::Workspace => workspace += 1,
            SidebarSessionBucket::External => external += 1,
        }
    }
    (workspace, external)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk(id: &str, name: &str, origin: SessionOrigin, updated: u64) -> ChannelMeta {
        ChannelMeta {
            id: id.into(),
            name: name.into(),
            category: "hermes".into(),
            description: String::new(),
            session_id: format!("s-{id}"),
            unread: 0,
            origin,
            has_local_history: origin == SessionOrigin::Workspace,
            model: None,
            updated_at_ms: Some(updated),
        }
    }

    #[test]
    fn separates_workspace_and_external_gateway_sessions() {
        let channels = vec![
            mk("1", "Home Chat", SessionOrigin::Workspace, 10),
            mk("2", "Cron Sync", SessionOrigin::External, 20),
            mk("3", "Rune Port", SessionOrigin::Workspace, 30),
        ];
        assert_eq!(count_sidebar_buckets(&channels), (2, 1));
        let ws = build_sidebar_session_list(&channels, SessionScopeTab::Sessions, "", &HashMap::new());
        assert_eq!(ws.len(), 2);
        assert_eq!(ws[0].channel.id, "3");

        let gw = build_sidebar_session_list(&channels, SessionScopeTab::Gateway, "cron", &HashMap::new());
        assert_eq!(gw.len(), 1);
        assert_eq!(gw[0].channel.id, "2");
    }
}
