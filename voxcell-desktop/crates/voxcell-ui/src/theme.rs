use rune::{Color, El, TextStyle, el};
use rune_kit::{Kit, PaletteFocus, PaletteSeed};
use voxcell_core::{BackgroundPresetId, BackgroundSettings, UiCustomizationConfig};

pub const fn rgba(r: f32, g: f32, b: f32, a: f32) -> Color {
    Color { r, g, b, a }
}

pub fn parse_hex_color(hex: &str, fallback: Color) -> Color {
    let clean = hex.trim().trim_start_matches('#');
    if clean.len() == 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (
            u8::from_str_radix(&clean[0..2], 16),
            u8::from_str_radix(&clean[2..4], 16),
            u8::from_str_radix(&clean[4..6], 16),
        ) {
            return rgba(r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, 1.0);
        }
    }
    fallback
}

#[derive(Clone)]
pub struct VoxcellTheme {
    pub kit: Kit,
    pub bg: Color,
    pub surface: Color,
    pub surface_elevated: Color,
    pub accent: Color,
    pub amber: Color,
    pub rose: Color,
    pub text: Color,
    pub text_muted: Color,
    pub text_faint: Color,
    pub border: Color,
    pub border_strong: Color,
    pub glass_fill: Color,
    pub card_fill: Color,
    pub mono: TextStyle,
    pub mono_sm: TextStyle,
    pub heading: TextStyle,
    pub title: TextStyle,
}

impl VoxcellTheme {
    pub fn from_config(cfg: &UiCustomizationConfig) -> Self {
        let bg = parse_hex_color(&cfg.bg_hex, rgba(0.02, 0.047, 0.039, 1.0)); // #050C0A
        let surface = parse_hex_color(&cfg.surface_hex, rgba(0.039, 0.078, 0.063, 1.0)); // #0A1410
        let fg = parse_hex_color(&cfg.text_hex, rgba(0.925, 0.953, 0.941, 1.0)); // #ECF3F0
        let accent = parse_hex_color(&cfg.accent_hex, rgba(0.204, 0.827, 0.60, 1.0)); // #34D399
        let amber = parse_hex_color(&cfg.amber_hex, rgba(0.961, 0.620, 0.043, 1.0)); // #F59E0B
        let rose = parse_hex_color(&cfg.rose_hex, rgba(0.957, 0.247, 0.369, 1.0)); // #F43F5E

        let mut kit = Kit::from_palette_focus(
            PaletteSeed { bg, fg, accent },
            PaletteFocus::Accent,
        );
        kit.c.layer_01 = surface;
        kit.c.layer_02 = rgba(
            (surface.r + 0.02).min(1.0),
            (surface.g + 0.028).min(1.0),
            (surface.b + 0.024).min(1.0),
            1.0,
        );
        kit.c.layer_03 = rgba(
            (surface.r + 0.045).min(1.0),
            (surface.g + 0.055).min(1.0),
            (surface.b + 0.05).min(1.0),
            1.0,
        );
        kit.c.warning.fg = amber;
        kit.c.danger.fg = rose;
        kit.c.success.fg = accent;
        kit.c.text_base = fg;
        kit.c.text_accent = accent;

        let alpha = cfg.glass_opacity.clamp(0.55, 0.98);
        let glass_fill = rgba(surface.r, surface.g, surface.b, alpha);
        let card_fill = rgba(
            (surface.r + 0.025).min(1.0),
            (surface.g + 0.036).min(1.0),
            (surface.b + 0.030).min(1.0),
            (alpha * 0.88).clamp(0.45, 0.96),
        );
        let border = fg.alpha(0.11);
        let border_strong = accent.alpha(0.32);

        Self {
            text_muted: kit.c.text_muted,
            text_faint: kit.c.text_faint,
            surface_elevated: kit.c.layer_02,
            kit,
            bg,
            surface,
            accent,
            amber,
            rose,
            text: fg,
            border,
            border_strong,
            glass_fill,
            card_fill,
            mono: TextStyle::new(12.5, 400.0).lh(18.0).mono(),
            mono_sm: TextStyle::new(11.0, 400.0).lh(15.0).mono(),
            heading: TextStyle::new(16.0, 700.0).lh(22.0),
            title: TextStyle::new(20.0, 700.0).lh(26.0),
        }
    }
}

pub fn render_ambient_backdrop(
    theme: &VoxcellTheme,
    bg_settings: &BackgroundSettings,
    time_s: f32,
    reduced_motion: bool,
) -> El {
    let t = if reduced_motion {
        0.0
    } else {
        time_s * bg_settings.motion_speed.clamp(0.1, 2.5)
    };
    let op = bg_settings.opacity.clamp(0.1, 1.0);
    let inten = bg_settings.intensity.clamp(0.1, 1.5);

    let (primary, secondary, drift_x, drift_y) = match bg_settings.preset {
        BackgroundPresetId::EmeraldAurora => (
            theme.accent.alpha(0.18 * op * inten),
            rgba(0.05, 0.42, 0.34, 0.14 * op * inten),
            0.52 + (t * 0.22).sin() * 0.08,
            0.34 + (t * 0.17).cos() * 0.06,
        ),
        BackgroundPresetId::AbyssGrid => (
            theme.accent.alpha(0.12 * op * inten),
            rgba(0.07, 0.18, 0.24, 0.15 * op * inten),
            0.50,
            0.48,
        ),
        BackgroundPresetId::CyberMist => (
            rgba(0.13, 0.82, 0.93, 0.17 * op * inten),
            theme.accent.alpha(0.12 * op * inten),
            0.44 + (t * 0.28).sin() * 0.10,
            0.32 + (t * 0.21).cos() * 0.08,
        ),
        BackgroundPresetId::SolarFlare => (
            theme.amber.alpha(0.18 * op * inten),
            theme.rose.alpha(0.12 * op * inten),
            0.56 + (t * 0.24).cos() * 0.09,
            0.30 + (t * 0.19).sin() * 0.07,
        ),
        BackgroundPresetId::MidnightPulse => (
            rgba(0.39, 0.40, 0.95, 0.18 * op * inten),
            theme.accent.alpha(0.11 * op * inten),
            0.48 + (t * 0.32).sin() * 0.07,
            0.42 + (t * 0.27).cos() * 0.07,
        ),
        BackgroundPresetId::ObsidianSilk => (
            rgba(0.85, 0.90, 0.94, 0.08 * op * inten),
            theme.accent.alpha(0.06 * op * inten),
            0.50 + (t * 0.14).sin() * 0.04,
            0.38,
        ),
        BackgroundPresetId::PhosphorGrain => (
            theme.accent.alpha(0.22 * op * inten),
            theme.amber.alpha(0.09 * op * inten),
            0.50 + (t * 0.35).sin() * 0.05,
            0.45 + (t * 0.25).cos() * 0.05,
        ),
    };

    el().key("ambient-backdrop")
        .absolute(0.0, 0.0)
        .w_full()
        .h_full()
        .fill(theme.bg)
        .radial_gradient(
            [drift_x, drift_y],
            560.0,
            [
                (0.0, primary),
                (0.45, secondary),
                (1.0, theme.bg.alpha(0.0)),
            ],
        )
        .a11y_hidden()
}
