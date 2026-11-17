use crate::types::{BackgroundTask, ExpressionMood, EyeState, MouthViseme, TaskLifecycleStatus};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SidebarWorkTone {
    Emerald,
    Amber,
    Rose,
    Slate,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SidebarCharacterInput {
    pub connected: bool,
    pub is_speaking: bool,
    pub is_listening: bool,
    pub active_channel_thinking: bool,
    pub any_thinking: bool,
    pub running_task_count: usize,
    pub pending_approval_count: usize,
    pub voice_amplitude: f32,
    pub active_task_progress: Option<f32>,
    pub active_task_title: Option<String>,
    pub look_x: f32,
    pub look_y: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SidebarCharacterPresentation {
    pub mood: ExpressionMood,
    pub eye_state: EyeState,
    pub viseme: MouthViseme,
    pub is_speaking: bool,
    pub is_listening: bool,
    pub energy: f32,
    pub tone: SidebarWorkTone,
    pub status_label: String,
    pub status_detail: String,
    pub look_x: f32,
    pub look_y: f32,
}

pub fn resolve_sidebar_look_target(norm_x: f32, norm_y: f32, inside: bool) -> (f32, f32) {
    if !inside {
        return (0.0, 0.0);
    }
    (norm_x.clamp(-1.0, 1.0), norm_y.clamp(-1.0, 1.0))
}

pub fn amplitude_to_viseme(amp: f32) -> MouthViseme {
    if amp < 0.06 {
        MouthViseme::Closed
    } else if amp < 0.16 {
        MouthViseme::Small
    } else if amp < 0.32 {
        MouthViseme::Mid
    } else if amp < 0.54 {
        MouthViseme::Round
    } else if amp < 0.76 {
        MouthViseme::Ee
    } else {
        MouthViseme::Wide
    }
}

pub fn derive_sidebar_character_state(input: &SidebarCharacterInput) -> SidebarCharacterPresentation {
    let lx = input.look_x.clamp(-1.0, 1.0);
    let ly = input.look_y.clamp(-1.0, 1.0);

    if !input.connected {
        return SidebarCharacterPresentation {
            mood: ExpressionMood::Calm,
            eye_state: EyeState::Half,
            viseme: MouthViseme::Closed,
            is_speaking: false,
            is_listening: false,
            energy: 0.08,
            tone: SidebarWorkTone::Rose,
            status_label: "Offline".to_string(),
            status_detail: "gateway unreachable".to_string(),
            look_x: lx,
            look_y: ly,
        };
    }

    if input.pending_approval_count > 0 {
        return SidebarCharacterPresentation {
            mood: ExpressionMood::Alert,
            eye_state: EyeState::Wide,
            viseme: MouthViseme::Closed,
            is_speaking: false,
            is_listening: false,
            energy: 0.55,
            tone: SidebarWorkTone::Amber,
            status_label: "Approval needed".to_string(),
            status_detail: format!("{} waiting", input.pending_approval_count),
            look_x: lx,
            look_y: ly,
        };
    }

    if input.is_speaking {
        let amp = input.voice_amplitude.clamp(0.18, 1.0);
        return SidebarCharacterPresentation {
            mood: ExpressionMood::Speaking,
            eye_state: EyeState::Open,
            viseme: amplitude_to_viseme(amp),
            is_speaking: true,
            is_listening: false,
            energy: amp,
            tone: SidebarWorkTone::Emerald,
            status_label: "Speaking".to_string(),
            status_detail: "voice stream active".to_string(),
            look_x: lx,
            look_y: ly,
        };
    }

    if input.is_listening {
        let amp = input.voice_amplitude.clamp(0.0, 1.0);
        return SidebarCharacterPresentation {
            mood: ExpressionMood::Listening,
            eye_state: EyeState::Open,
            viseme: if amp > 0.12 {
                MouthViseme::Small
            } else {
                MouthViseme::Rest
            },
            is_speaking: false,
            is_listening: true,
            energy: (0.28 + amp * 0.55).clamp(0.0, 1.0),
            tone: SidebarWorkTone::Emerald,
            status_label: "Listening".to_string(),
            status_detail: "mic open".to_string(),
            look_x: lx,
            look_y: ly,
        };
    }

    if input.running_task_count > 0 || input.active_channel_thinking || input.any_thinking {
        let detail = if let Some(title) = input.active_task_title.as_deref() {
            if let Some(pct) = input.active_task_progress {
                format!("{title} · {}%", pct.round().clamp(0.0, 100.0) as u8)
            } else {
                title.to_string()
            }
        } else if input.running_task_count > 1 {
            format!("{} tasks running", input.running_task_count)
        } else {
            "working on turn".to_string()
        };

        return SidebarCharacterPresentation {
            mood: ExpressionMood::Thinking,
            eye_state: EyeState::FocusedOpen(),
            viseme: MouthViseme::Rest,
            is_speaking: false,
            is_listening: false,
            energy: 0.62,
            tone: SidebarWorkTone::Amber,
            status_label: "Working".to_string(),
            status_detail: detail,
            look_x: lx,
            look_y: ly,
        };
    }

    SidebarCharacterPresentation {
        mood: ExpressionMood::Calm,
        eye_state: EyeState::Open,
        viseme: MouthViseme::Closed,
        is_speaking: false,
        is_listening: false,
        energy: 0.16,
        tone: SidebarWorkTone::Emerald,
        status_label: "Online".to_string(),
        status_detail: "hermes ready".to_string(),
        look_x: lx,
        look_y: ly,
    }
}

trait EyeStateExt {
    #[allow(non_snake_case)]
    fn FocusedOpen() -> Self;
}

impl EyeStateExt for EyeState {
    fn FocusedOpen() -> Self {
        EyeState::Open
    }
}

pub fn lead_running_task(tasks: &[BackgroundTask]) -> Option<&BackgroundTask> {
    tasks.iter().find(|t| t.status == TaskLifecycleStatus::Running)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prioritizes_offline_then_approval_then_voice_then_working() {
        let mut inp = SidebarCharacterInput {
            connected: false,
            is_speaking: true,
            is_listening: false,
            active_channel_thinking: true,
            any_thinking: true,
            running_task_count: 2,
            pending_approval_count: 1,
            voice_amplitude: 0.6,
            active_task_progress: Some(50.0),
            active_task_title: Some("Build".into()),
            look_x: 0.2,
            look_y: -0.3,
        };
        assert_eq!(derive_sidebar_character_state(&inp).tone, SidebarWorkTone::Rose);

        inp.connected = true;
        let approval_state = derive_sidebar_character_state(&inp);
        assert_eq!(approval_state.mood, ExpressionMood::Alert);
        assert_eq!(approval_state.eye_state, EyeState::Wide);

        inp.pending_approval_count = 0;
        let speaking_state = derive_sidebar_character_state(&inp);
        assert_eq!(speaking_state.mood, ExpressionMood::Speaking);
        assert_eq!(speaking_state.tone, SidebarWorkTone::Emerald);

        inp.is_speaking = false;
        let working_state = derive_sidebar_character_state(&inp);
        assert_eq!(working_state.mood, ExpressionMood::Thinking);
        assert_eq!(working_state.tone, SidebarWorkTone::Amber);
    }
}
