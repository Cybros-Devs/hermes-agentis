use crate::types::{ChannelMeta, SessionOrigin};
use serde::{Deserialize, Serialize};
use std::f32::consts::TAU;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CanvasFormation {
    #[default]
    Constellation,
    Orbit,
    Grid,
}

impl CanvasFormation {
    pub fn label(self) -> &'static str {
        match self {
            Self::Constellation => "Constellation",
            Self::Orbit => "Orbit",
            Self::Grid => "Grid",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CanvasShapeKind {
    #[default]
    HermesOrb,
    CatBot,
    AngelBot,
    CyberSkull,
    LotusCore,
    GhostShell,
    FoxSpirit,
    MechaHelm,
    PrismCore,
}

impl CanvasShapeKind {
    pub fn all() -> &'static [Self] {
        &[
            Self::HermesOrb,
            Self::CatBot,
            Self::AngelBot,
            Self::CyberSkull,
            Self::LotusCore,
            Self::GhostShell,
            Self::FoxSpirit,
            Self::MechaHelm,
            Self::PrismCore,
        ]
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::HermesOrb => "Hermes",
            Self::CatBot => "Neko",
            Self::AngelBot => "Seraph",
            Self::CyberSkull => "Skull",
            Self::LotusCore => "Lotus",
            Self::GhostShell => "Phantom",
            Self::FoxSpirit => "Kitsune",
            Self::MechaHelm => "Mecha",
            Self::PrismCore => "Prism",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CanvasDotData {
    pub id: String,
    pub channel_id: String,
    pub label: String,
    pub shape: CanvasShapeKind,
    pub x: f32,
    pub y: f32,
    pub pinned: bool,
    pub color_hex: String,
}

pub fn slugify_session_id(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut prev_dash = false;
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "session".to_string()
    } else {
        trimmed.chars().take(40).collect()
    }
}

pub fn create_home_session_channel(prompt: &str, counter: usize, now_ms: u64) -> ChannelMeta {
    let slug = slugify_session_id(prompt);
    let short_name: String = prompt.split_whitespace().take(4).collect::<Vec<_>>().join(" ");
    let name = if short_name.is_empty() {
        format!("Session {counter}")
    } else {
        short_name
    };
    let id = format!("local-{slug}-{counter}");
    ChannelMeta {
        id: id.clone(),
        name,
        category: "workspace".to_string(),
        description: prompt.trim().to_string(),
        session_id: id,
        unread: 0,
        origin: SessionOrigin::Workspace,
        has_local_history: true,
        model: None,
        updated_at_ms: Some(now_ms),
    }
}

pub fn resolve_formation_positions(
    count: usize,
    formation: CanvasFormation,
    width: f32,
    height: f32,
) -> Vec<(f32, f32)> {
    if count == 0 {
        return Vec::new();
    }
    let cx = width * 0.5;
    let cy = height * 0.5;
    match formation {
        CanvasFormation::Constellation => {
            let rx = (width * 0.34).max(120.0);
            let ry = (height * 0.30).max(95.0);
            (0..count)
                .map(|i| {
                    let t = i as f32 / count as f32;
                    let angle = t * TAU - std::f32::consts::FRAC_PI_2;
                    let ring_scale = if i % 2 == 0 { 1.0 } else { 0.62 };
                    (
                        cx + angle.cos() * rx * ring_scale,
                        cy + angle.sin() * ry * ring_scale,
                    )
                })
                .collect()
        }
        CanvasFormation::Orbit => {
            let base_r = (width.min(height) * 0.28).max(110.0);
            (0..count)
                .map(|i| {
                    if i == 0 && count > 2 {
                        (cx, cy)
                    } else {
                        let idx = if count > 2 { i - 1 } else { i };
                        let total = if count > 2 { count - 1 } else { count };
                        let angle = (idx as f32 / total.max(1) as f32) * TAU - std::f32::consts::FRAC_PI_2;
                        (cx + angle.cos() * base_r, cy + angle.sin() * base_r * 0.82)
                    }
                })
                .collect()
        }
        CanvasFormation::Grid => {
            let cols = (count as f32).sqrt().ceil().max(1.0) as usize;
            let rows = count.div_ceil(cols).max(1);
            let cell_w = 210.0_f32;
            let cell_h = 160.0_f32;
            let start_x = cx - ((cols as f32 - 1.0) * cell_w) * 0.5;
            let start_y = cy - ((rows as f32 - 1.0) * cell_h) * 0.5;
            (0..count)
                .map(|i| {
                    let r = i / cols;
                    let c = i % cols;
                    (start_x + c as f32 * cell_w, start_y + r as f32 * cell_h)
                })
                .collect()
        }
    }
}

pub fn apply_formation(dots: &mut [CanvasDotData], formation: CanvasFormation, width: f32, height: f32) {
    let coords = resolve_formation_positions(dots.len(), formation, width, height);
    for (dot, (x, y)) in dots.iter_mut().zip(coords) {
        dot.x = x;
        dot.y = y;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugifies_and_creates_home_session() {
        assert_eq!(slugify_session_id("Fix RUNE!! Audio 2026"), "fix-rune-audio-2026");
        let ch = create_home_session_channel("Inspect hermes gateway runs", 1, 9000);
        assert_eq!(ch.origin, SessionOrigin::Workspace);
        assert!(ch.id.starts_with("local-inspect-hermes"));
    }

    #[test]
    fn computes_distinct_formation_positions() {
        let grid = resolve_formation_positions(4, CanvasFormation::Grid, 900.0, 600.0);
        assert_eq!(grid.len(), 4);
        assert!(grid[1].0 > grid[0].0);
        assert!(grid[2].1 > grid[0].1);

        let orbit = resolve_formation_positions(4, CanvasFormation::Orbit, 900.0, 600.0);
        assert_eq!(orbit[0], (450.0, 300.0));
    }
}
