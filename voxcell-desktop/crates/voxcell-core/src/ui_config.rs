use crate::types::{
    DensityMode, DotProfile, HorizonMode, SidebarPosition, UiCustomizationConfig,
};

#[derive(Clone, Debug, PartialEq)]
pub struct UiPreset {
    pub id: &'static str,
    pub name: &'static str,
    pub accent_hex: &'static str,
    pub bg_hex: &'static str,
    pub surface_hex: &'static str,
    pub dot_profile: DotProfile,
    pub bloom: f32,
    pub horizon_mode: HorizonMode,
}

pub const BUILT_IN_PRESETS: &[UiPreset] = &[
    UiPreset {
        id: "abyss",
        name: "Voxcell Abyss",
        accent_hex: "#34D399",
        bg_hex: "#050C0A",
        surface_hex: "#0A1410",
        dot_profile: DotProfile::Balanced,
        bloom: 0.38,
        horizon_mode: HorizonMode::Silk,
    },
    UiPreset {
        id: "amber-ops",
        name: "Amber Ops",
        accent_hex: "#F59E0B",
        bg_hex: "#0C0904",
        surface_hex: "#151008",
        dot_profile: DotProfile::Phosphor,
        bloom: 0.52,
        horizon_mode: HorizonMode::Peaks,
    },
    UiPreset {
        id: "cyan-wire",
        name: "Cyan Wire",
        accent_hex: "#22D3EE",
        bg_hex: "#040A0E",
        surface_hex: "#08131A",
        dot_profile: DotProfile::Crisp,
        bloom: 0.24,
        horizon_mode: HorizonMode::Pulse,
    },
    UiPreset {
        id: "obsidian-mono",
        name: "Obsidian Mono",
        accent_hex: "#E2E8F0",
        bg_hex: "#07080A",
        surface_hex: "#101216",
        dot_profile: DotProfile::Crisp,
        bloom: 0.16,
        horizon_mode: HorizonMode::Ribbon,
    },
];

#[derive(Clone, Debug, Default, PartialEq)]
pub struct UiCustomizationPatch {
    pub accent_hex: Option<String>,
    pub surface_hex: Option<String>,
    pub bg_hex: Option<String>,
    pub portrait_tint_hex: Option<Option<String>>,
    pub dot_profile: Option<DotProfile>,
    pub bloom: Option<f32>,
    pub horizon_mode: Option<HorizonMode>,
    pub density: Option<DensityMode>,
    pub sidebar_position: Option<SidebarPosition>,
    pub sidebar_width: Option<f32>,
    pub reduced_motion: Option<bool>,
    pub preset_name: Option<String>,
}

pub fn sanitize_hex_color(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_start_matches('#');
    if trimmed.len() == 3 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        let expanded: String = trimmed
            .chars()
            .flat_map(|c| [c, c])
            .collect::<String>()
            .to_ascii_uppercase();
        return Some(format!("#{expanded}"));
    }
    if trimmed.len() == 6 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        return Some(format!("#{}", trimmed.to_ascii_uppercase()));
    }
    None
}

pub fn apply_ui_customization_patch(
    cfg: &mut UiCustomizationConfig,
    patch: &UiCustomizationPatch,
) {
    if let Some(hex) = &patch.accent_hex {
        if let Some(clean) = sanitize_hex_color(hex) {
            cfg.accent_hex = clean;
        }
    }
    if let Some(hex) = &patch.surface_hex {
        if let Some(clean) = sanitize_hex_color(hex) {
            cfg.surface_hex = clean;
        }
    }
    if let Some(hex) = &patch.bg_hex {
        if let Some(clean) = sanitize_hex_color(hex) {
            cfg.bg_hex = clean;
        }
    }
    if let Some(tint) = &patch.portrait_tint_hex {
        cfg.portrait_tint_hex = tint.as_deref().and_then(sanitize_hex_color);
    }
    if let Some(dp) = patch.dot_profile {
        cfg.dot_profile = dp;
    }
    if let Some(b) = patch.bloom {
        if b.is_finite() {
            cfg.bloom = b.clamp(0.0, 1.0);
        }
    }
    if let Some(hm) = patch.horizon_mode {
        cfg.horizon_mode = hm;
    }
    if let Some(d) = patch.density {
        cfg.density = d;
    }
    if let Some(sp) = patch.sidebar_position {
        cfg.sidebar_position = sp;
    }
    if let Some(w) = patch.sidebar_width {
        if w.is_finite() {
            cfg.sidebar_width = w.clamp(220.0, 420.0);
        }
    }
    if let Some(rm) = patch.reduced_motion {
        cfg.reduced_motion = rm;
    }
    if let Some(name) = &patch.preset_name {
        cfg.preset_name = name.clone();
    }
}

pub fn apply_preset(cfg: &mut UiCustomizationConfig, preset_id: &str) -> bool {
    let needle = preset_id.trim().to_ascii_lowercase();
    let Some(preset) = BUILT_IN_PRESETS.iter().find(|p| {
        p.id == needle || p.name.to_ascii_lowercase() == needle
    }) else {
        return false;
    };
    cfg.accent_hex = preset.accent_hex.to_string();
    cfg.bg_hex = preset.bg_hex.to_string();
    cfg.surface_hex = preset.surface_hex.to_string();
    cfg.dot_profile = preset.dot_profile;
    cfg.bloom = preset.bloom;
    cfg.horizon_mode = preset.horizon_mode;
    cfg.preset_name = preset.name.to_string();
    true
}

pub fn parse_natural_language_ui_request(prompt: &str) -> UiCustomizationPatch {
    let lower = prompt.trim().to_ascii_lowercase();
    let mut patch = UiCustomizationPatch::default();

    for preset in BUILT_IN_PRESETS {
        if lower.contains(preset.id) || lower.contains(&preset.name.to_ascii_lowercase()) {
            patch.accent_hex = Some(preset.accent_hex.to_string());
            patch.bg_hex = Some(preset.bg_hex.to_string());
            patch.surface_hex = Some(preset.surface_hex.to_string());
            patch.dot_profile = Some(preset.dot_profile);
            patch.bloom = Some(preset.bloom);
            patch.horizon_mode = Some(preset.horizon_mode);
            patch.preset_name = Some(preset.name.to_string());
        }
    }

    for token in lower.split_whitespace() {
        if token.starts_with('#') {
            if let Some(clean) = sanitize_hex_color(token) {
                patch.accent_hex = Some(clean.clone());
                patch.portrait_tint_hex = Some(Some(clean));
            }
        }
    }

    if lower.contains("emerald") || lower.contains("green") {
        patch.accent_hex = Some("#34D399".to_string());
    } else if lower.contains("amber") || lower.contains("gold") || lower.contains("orange") {
        patch.accent_hex = Some("#F59E0B".to_string());
    } else if lower.contains("cyan") || lower.contains("blue") {
        patch.accent_hex = Some("#22D3EE".to_string());
    } else if lower.contains("rose") || lower.contains("red") || lower.contains("pink") {
        patch.accent_hex = Some("#F43F5E".to_string());
    }

    if lower.contains("crisp") || lower.contains("sharp") {
        patch.dot_profile = Some(DotProfile::Crisp);
    } else if lower.contains("phosphor") || lower.contains("glow") {
        patch.dot_profile = Some(DotProfile::Phosphor);
        patch.bloom = Some(0.62);
    } else if lower.contains("balanced") {
        patch.dot_profile = Some(DotProfile::Balanced);
    }

    if lower.contains("no bloom") || lower.contains("less glow") {
        patch.bloom = Some(0.05);
    } else if lower.contains("high bloom") || lower.contains("more glow") {
        patch.bloom = Some(0.75);
    }

    if lower.contains("peaks") {
        patch.horizon_mode = Some(HorizonMode::Peaks);
    } else if lower.contains("pulse") {
        patch.horizon_mode = Some(HorizonMode::Pulse);
    } else if lower.contains("ribbon") {
        patch.horizon_mode = Some(HorizonMode::Ribbon);
    } else if lower.contains("silk") {
        patch.horizon_mode = Some(HorizonMode::Silk);
    }

    if lower.contains("compact") {
        patch.density = Some(DensityMode::Compact);
    } else if lower.contains("airy") || lower.contains("spacious") {
        patch.density = Some(DensityMode::Airy);
    } else if lower.contains("comfortable") {
        patch.density = Some(DensityMode::Comfortable);
    }

    if lower.contains("sidebar right") || lower.contains("right sidebar") {
        patch.sidebar_position = Some(SidebarPosition::Right);
    } else if lower.contains("sidebar left") || lower.contains("left sidebar") {
        patch.sidebar_position = Some(SidebarPosition::Left);
    }

    if lower.contains("reduce motion") || lower.contains("less motion") {
        patch.reduced_motion = Some(true);
    } else if lower.contains("full motion") {
        patch.reduced_motion = Some(false);
    }

    patch
}

pub fn decode_frontier_step(target: &str, progress: f32) -> String {
    const GLYPHS: &[char] = &['⠁', '⠃', '⠇', '⠏', '⠟', '⠿', '⣿', '⠛', '⠉'];
    let clamped = progress.clamp(0.0, 1.0);
    let chars: Vec<char> = target.chars().collect();
    let reveal = ((chars.len() as f32) * clamped).floor() as usize;
    chars
        .iter()
        .enumerate()
        .map(|(i, &ch)| {
            if i < reveal || ch.is_whitespace() {
                ch
            } else if i == reveal && clamped > 0.0 && clamped < 1.0 {
                let idx = ((clamped * 37.0) as usize + i) % GLYPHS.len();
                GLYPHS[idx]
            } else {
                ' '
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_hex_and_parses_natural_language_request() {
        assert_eq!(sanitize_hex_color("#3f9"), Some("#33FF99".into()));
        assert_eq!(sanitize_hex_color("not-hex"), None);

        let mut cfg = UiCustomizationConfig::default();
        let patch = parse_natural_language_ui_request("switch to cyan crisp peaks compact sidebar right");
        apply_ui_customization_patch(&mut cfg, &patch);
        assert_eq!(cfg.accent_hex, "#22D3EE");
        assert_eq!(cfg.dot_profile, DotProfile::Crisp);
        assert_eq!(cfg.horizon_mode, HorizonMode::Peaks);
        assert_eq!(cfg.density, DensityMode::Compact);
        assert_eq!(cfg.sidebar_position, SidebarPosition::Right);
    }
}
