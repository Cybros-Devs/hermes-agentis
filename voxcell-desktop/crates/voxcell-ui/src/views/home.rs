use crate::state::{AppState, UiCommand};
use crate::theme::VoxcellTheme;
use rune::{Cx, El, SurfaceFit, col, el, row, text};
use rune_kit::{Button, ButtonVariant, ControlSize, TextInput};
use voxcell_core::{ActiveView, AsciiShaderMode, AvatarMode};

pub fn render_home(state: &AppState, theme: &VoxcellTheme, _cx: &mut Cx<AppState>) -> El {
    let k = &theme.kit;

    // 1. Portrait Stage Header Strip (Renderer toggle + shader pills + mood readout)
    let mut mode_bar = row()
        .key("home-stage-controls")
        .gap(6.0)
        .items_center()
        .child(
            Button::new(match state.avatar_mode {
                AvatarMode::Halftone => "Mode: Halftone",
                AvatarMode::Ascii3d => "Mode: 3D ASCII",
            })
            .variant(ButtonVariant::Neutral)
            .control_size(ControlSize::Small)
            .on_press(|s: &mut AppState| {
                s.avatar_mode = match s.avatar_mode {
                    AvatarMode::Halftone => AvatarMode::Ascii3d,
                    AvatarMode::Ascii3d => AvatarMode::Halftone,
                };
                s.step_animations(0.016);
            })
            .build(k),
        );

    if state.avatar_mode == AvatarMode::Ascii3d {
        for (shader, label) in [
            (AsciiShaderMode::Solid, "Solid"),
            (AsciiShaderMode::Wire, "Wire"),
            (AsciiShaderMode::Depth, "Depth"),
            (AsciiShaderMode::Holo, "Holo"),
            (AsciiShaderMode::Norm, "Norm"),
        ] {
            let active = state.shader_mode == shader;
            mode_bar = mode_bar.child(
                Button::new(label)
                    .variant(if active {
                        ButtonVariant::Submit
                    } else {
                        ButtonVariant::Ghost
                    })
                    .control_size(ControlSize::Mini)
                    .on_press(move |s: &mut AppState| {
                        s.shader_mode = shader;
                        s.step_animations(0.016);
                    })
                    .build(k),
            );
        }
    }

    // 2. Centered Interactive Bayer Halftone / 3D ASCII Portrait
    let stage_portrait = el()
        .key("home-portrait-stage")
        .w(320.0)
        .h(294.0)
        .radius(16.0)
        .fill(theme.bg.alpha(0.35))
        .border(
            1.0,
            if state.active_is_thinking() {
                theme.amber.alpha(0.35)
            } else {
                theme.accent.alpha(0.22)
            },
        )
        .radial_gradient(
            [0.5, 0.45],
            165.0,
            [
                (0.0, theme.accent.alpha(0.14)),
                (0.7, theme.accent.alpha(0.03)),
                (1.0, theme.bg.alpha(0.0)),
            ],
        )
        .on_pointer_move_local(|s: &mut AppState, ev, _tx| {
            let nx = ((ev.x / 320.0) * 2.0 - 1.0).clamp(-1.0, 1.0);
            let ny = ((ev.y / 294.0) * 2.0 - 1.0).clamp(-1.0, 1.0);
            let inside = ev.x >= 0.0 && ev.x <= 320.0 && ev.y >= 0.0 && ev.y <= 294.0;
            s.pointer_stage = if inside { Some((nx, ny)) } else { None };
        })
        .on_press(|s: &mut AppState| {
            s.toggle_stage_mood();
        })
        .child(
            el().key("home-portrait-pixels")
                .w(320.0)
                .h(294.0)
                .pixels_fit(&state.stage_pixels, SurfaceFit::Fit),
        );

    let mood_line = row()
        .key("home-mood-readout")
        .gap(8.0)
        .items_center()
        .child(
            el().w(7.0)
                .h(7.0)
                .radius(3.5)
                .fill(if state.active_is_thinking() {
                    theme.amber
                } else {
                    theme.accent
                }),
        )
        .child(
            text(format!(
                "{} · {} · click portrait to cycle expression",
                state.stage_mood.label(),
                state.active_channel().map(|c| c.name.as_str()).unwrap_or("Home Stage")
            ))
            .font(theme.mono_sm)
            .color(theme.text_muted),
        );

    // 3. Pointer & Audio Reactive Halftone Horizon Wave Strip
    let horizon_strip = el()
        .key("home-horizon-strip")
        .w(680.0)
        .h(88.0)
        .radius(10.0)
        .on_pointer_move_local(|s: &mut AppState, ev, _tx| {
            let nx = ((ev.x / 680.0) * 2.0 - 1.0).clamp(-1.0, 1.0);
            let ny = ((ev.y / 88.0) * 2.0 - 1.0).clamp(-1.0, 1.0);
            s.pointer_horizon = (nx, ny);
        })
        .child(
            el().key("home-horizon-pixels")
                .w(680.0)
                .h(88.0)
                .pixels_fit(&state.horizon_pixels, SurfaceFit::Fill),
        );

    // 4. Unified Composer Bar (Prompt + Mic + Send + Open Thread)
    let mic_active = state.voice.hands_free_vad || state.audio.is_listening;
    let composer = row()
        .key("home-composer")
        .w(680.0)
        .padding(8.0)
        .gap(8.0)
        .radius(10.0)
        .fill(theme.card_fill)
        .backdrop_blur(10.0)
        .border(1.0, theme.border_strong)
        .items_center()
        .child(
            el().grow(1.0).min_w(0.0).child(
                TextInput::new(&state.composer_edit)
                    .placeholder("Ask Hermes anything, or type /help...")
                    .label("Prompt Hermes")
                    .plain()
                    .width(None)
                    .on_edit(|s: &mut AppState| &mut s.composer_edit)
                    .on_submit(|s: &mut AppState, _tx| s.submit_composer_prompt())
                    .build(k),
            ),
        )
        .child(
            Button::new(if mic_active { "Mic ON" } else { "Mic" })
                .variant(if mic_active {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Neutral
                })
                .control_size(ControlSize::Small)
                .on_press(|s: &mut AppState| {
                    let next = !s.voice.hands_free_vad;
                    s.voice.hands_free_vad = next;
                    s.pending_commands.push(UiCommand::ToggleMic(next));
                })
                .build(k),
        )
        .child(
            Button::new("Send")
                .variant(ButtonVariant::Submit)
                .control_size(ControlSize::Small)
                .on_press(|s: &mut AppState| s.submit_composer_prompt())
                .build(k),
        )
        .child(
            Button::new("Thread")
                .variant(ButtonVariant::Ghost)
                .control_size(ControlSize::Small)
                .on_press(|s: &mut AppState| s.active_view = ActiveView::Thread)
                .build(k),
        );

    col()
        .key("home-view")
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .h_full()
        .padding(16.0)
        .gap(12.0)
        .items_center()
        .justify_between()
        .child(mode_bar)
        .child(
            col()
                .grow(1.0)
                .min_h(0.0)
                .items_center()
                .justify_center()
                .gap(10.0)
                .child(stage_portrait)
                .child(mood_line),
        )
        .child(
            col()
                .gap(10.0)
                .items_center()
                .child(horizon_strip)
                .child(composer),
        )
}
