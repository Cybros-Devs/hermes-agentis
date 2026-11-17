pub mod ascii3d;
pub mod horizon;
pub mod portrait;
pub mod raster;
pub mod shapes;

pub use ascii3d::*;
pub use horizon::*;
pub use portrait::*;
pub use raster::*;
pub use shapes::*;

#[cfg(test)]
mod tests {
    use super::*;
    use voxcell_core::canvas::CanvasShapeKind;
    use voxcell_core::{
        AsciiShaderMode, DotProfile, ExpressionMood, EyeState, HorizonMode, MouthViseme,
        PhosphorTheme,
    };

    #[test]
    fn loads_embedded_portrait_and_12_panel_sprite_bank() {
        let assets = portrait_assets();
        assert!(assets.reference.width > 100);
        assert!(assets.reference.height > 100);
        assert_eq!(assets.sprite_bank.len(), 12);
        for panel in &assets.sprite_bank {
            assert_eq!(panel.width, 160);
            assert_eq!(panel.height, 160);
            let non_zero = panel.base_lum.iter().filter(|&&v| v > 0.05).count();
            assert!(non_zero > 200, "expected populated silhouette pixels, got {non_zero}");
        }
    }

    #[test]
    fn natural_blink_curve_stays_bounded_and_triggers_periodically() {
        let mut max_blink = 0.0_f32;
        let mut min_blink = 1.0_f32;
        for step in 0..400 {
            let t = step as f32 * 0.01;
            let b = evaluate_natural_blink_curve(t, 0.0, 3);
            assert!((0.0..=1.0).contains(&b));
            max_blink = max_blink.max(b);
            min_blink = min_blink.min(b);
        }
        assert!(max_blink > 0.9, "expected blink peak > 0.9, got {max_blink}");
        assert!(min_blink < 0.05);
    }

    #[test]
    fn portrait_renders_distinct_moods_and_eye_states() {
        let mut anim = PortraitAnimator::new();
        let m_calm = anim
            .step(
                &PortraitAnimatorInput {
                    time: 1.0,
                    mood: ExpressionMood::Calm,
                    eye_state: EyeState::Open,
                    viseme: MouthViseme::Closed,
                    energy: 0.0,
                    is_speaking: false,
                    is_listening: false,
                    pointer_x: None,
                    pointer_y: None,
                    tap_impulse: 0.0,
                },
                0.016,
                false,
            )
            .clone();

        let calm_rgba = render_portrait_rgba(
            &m_calm,
            &PortraitRenderOptions {
                pixel_w: 160,
                pixel_h: 148,
                cols: 42,
                rows: 20,
                time: 1.0,
                mood: ExpressionMood::Calm,
                viseme: MouthViseme::Closed,
                energy: 0.0,
                is_speaking: false,
                is_listening: false,
                is_loading: false,
                is_thumb: false,
                dot_profile: DotProfile::Balanced,
                bloom: 0.38,
                tint_hex: None,
            },
        );
        assert_eq!(calm_rgba.len(), 160 * 148 * 4);
        assert!(calm_rgba.iter().skip(3).step_by(4).any(|&a| a > 120));

        let m_think = anim
            .step(
                &PortraitAnimatorInput {
                    time: 2.35,
                    mood: ExpressionMood::Thinking,
                    eye_state: EyeState::Blink,
                    viseme: MouthViseme::Wide,
                    energy: 0.85,
                    is_speaking: true,
                    is_listening: false,
                    pointer_x: Some(0.5),
                    pointer_y: Some(-0.2),
                    tap_impulse: 0.6,
                },
                0.016,
                false,
            )
            .clone();
        let think_rgba = render_portrait_rgba(
            &m_think,
            &PortraitRenderOptions {
                pixel_w: 160,
                pixel_h: 148,
                cols: 42,
                rows: 20,
                time: 2.35,
                mood: ExpressionMood::Thinking,
                viseme: MouthViseme::Wide,
                energy: 0.85,
                is_speaking: true,
                is_listening: false,
                is_loading: false,
                is_thumb: false,
                dot_profile: DotProfile::Phosphor,
                bloom: 0.55,
                tint_hex: None,
            },
        );
        let diff_bytes: usize = calm_rgba
            .iter()
            .zip(think_rgba.iter())
            .filter(|(a, b)| a.abs_diff(**b) > 12)
            .count();
        assert!(diff_bytes > 500, "expected visible pixel diff, got {diff_bytes}");
    }

    #[test]
    fn renders_all_four_horizon_modes_and_nine_canvas_shapes() {
        let mut h_anim = HorizonAnimator::new();
        let bands = [0.2, 0.5, 0.8, 0.6, 0.4, 0.7, 0.5, 0.3, 0.6, 0.4, 0.2, 0.1];
        let h_state = h_anim.step(0.65, 0.25, -0.1, &bands, 0.016, false).clone();

        for mode in [
            HorizonMode::Silk,
            HorizonMode::Peaks,
            HorizonMode::Pulse,
            HorizonMode::Ribbon,
        ] {
            let rgba = render_horizon_rgba(
                240,
                64,
                48,
                8,
                1.5,
                &h_state,
                mode,
                "#34D399",
                DotProfile::Balanced,
                0.35,
            );
            assert_eq!(rgba.len(), 240 * 64 * 4);
            let lit = rgba.iter().skip(3).step_by(4).filter(|&&a| a > 20).count();
            assert!(lit > 40, "horizon mode {mode:?} had too few lit pixels ({lit})");
        }

        for &shape in CanvasShapeKind::all() {
            let rgba = render_canvas_dot_rgba(
                96,
                96,
                22,
                11,
                shape,
                1.2,
                ExpressionMood::Happy,
                MouthViseme::Smile,
                0.4,
                false,
                false,
                false,
                None,
                DotProfile::Balanced,
                0.35,
            );
            assert_eq!(rgba.len(), 96 * 96 * 4);
            let lit = rgba.iter().skip(3).step_by(4).filter(|&&a| a > 40).count();
            assert!(lit > 80, "shape {shape:?} had too few lit pixels ({lit})");
        }
    }

    #[test]
    fn renders_3d_ascii_sdf_shaders() {
        for mode in [
            AsciiShaderMode::Solid,
            AsciiShaderMode::Wire,
            AsciiShaderMode::Depth,
            AsciiShaderMode::Holo,
            AsciiShaderMode::Norm,
        ] {
            let frame = render_ascii3d_frame(&Ascii3DParams {
                cols: 44,
                rows: 22,
                time: 1.0,
                yaw: 0.2,
                pitch: 0.05,
                zoom: 1.0,
                mood: ExpressionMood::Speaking,
                viseme: MouthViseme::Mid,
                eye_state: EyeState::Open,
                energy: 0.6,
                is_speaking: true,
                is_listening: false,
                shader_mode: mode,
                bands: [0.4; 12],
            });
            let active = frame.cells.iter().filter(|c| c.ch != ' ').count();
            assert!(active > 50, "ascii3d shader {mode:?} had only {active} cells");
            let rgba = render_ascii3d_rgba(220, 176, &frame, PhosphorTheme::Emerald);
            assert!(rgba.iter().skip(3).step_by(4).any(|&a| a > 100));
        }
    }
}
