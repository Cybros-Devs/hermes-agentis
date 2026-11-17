use crate::state::{AppState, UiCommand};
use crate::theme::VoxcellTheme;
use rune::{Cx, El, SurfaceFit, TextStyle, col, el, row, text};
use rune_kit::{Button, ButtonVariant, ControlSize};

pub fn render_phone_widget(state: &AppState, theme: &VoxcellTheme, _cx: &mut Cx<AppState>) -> El {
    let k = &theme.kit;
    let is_speaking = state.audio.is_speaking || state.stage_mood == voxcell_core::ExpressionMood::Speaking;
    let mic_on = state.voice.hands_free_vad || state.audio.is_listening;

    let mut spectrum = row().key("phone-spectrum").w_full().h(32.0).gap(4.0).items_end().justify_center();
    for (idx, &band) in state.audio.bands.iter().enumerate() {
        let lvl = if is_speaking || mic_on {
            band.clamp(0.08, 1.0)
        } else {
            0.08 + ((state.time_s * 2.0 + idx as f32 * 0.45).sin().abs() * 0.14)
        };
        spectrum = spectrum.child(
            el().w(14.0)
                .h(4.0 + lvl * 26.0)
                .radius(2.0)
                .fill(if is_speaking {
                    theme.accent
                } else if mic_on {
                    theme.amber
                } else {
                    theme.accent.alpha(0.45)
                }),
        );
    }

    col()
        .key("phone-widget-window")
        .w_full()
        .h_full()
        .padding(12.0)
        .gap(10.0)
        .fill(theme.bg)
        .border(1.0, theme.border_strong)
        .child(
            row()
                .w_full()
                .justify_between()
                .items_center()
                .child(
                    row()
                        .gap(6.0)
                        .items_center()
                        .child(
                            el().w(8.0)
                                .h(8.0)
                                .radius(4.0)
                                .fill(if is_speaking { theme.accent } else { theme.amber }),
                        )
                        .child(
                            text("CYBER COMMS // HUD")
                                .font(TextStyle::new(11.0, 700.0).tracking(0.8).mono())
                                .color(theme.text),
                        ),
                )
                .child(
                    Button::new("Close")
                        .variant(ButtonVariant::Ghost)
                        .control_size(ControlSize::Mini)
                        .on_press(|s: &mut AppState| {
                            s.phone_widget_open = false;
                            s.pending_commands.push(UiCommand::TogglePhoneWindow(false));
                        })
                        .build(k),
                ),
        )
        .child(
            el().key("phone-portrait-box")
                .w_full()
                .grow(1.0)
                .min_h(0.0)
                .radius(12.0)
                .fill(theme.surface)
                .border(1.0, theme.border)
                .center()
                .on_press(|s: &mut AppState| s.toggle_stage_mood())
                .child(
                    el().w(240.0)
                        .h(210.0)
                        .pixels_fit(&state.phone_pixels, SurfaceFit::Fit),
                ),
        )
        .child(spectrum)
        .child(
            row()
                .w_full()
                .justify_between()
                .gap(6.0)
                .child(
                    Button::new(if mic_on { "PTT Active" } else { "Talk (PTT)" })
                        .variant(if mic_on {
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
                    Button::new(if state.voice.muted { "Unmute" } else { "Mute TTS" })
                        .variant(ButtonVariant::Neutral)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            let next = !s.voice.muted;
                            s.voice.muted = next;
                            s.pending_commands.push(UiCommand::ToggleMute(next));
                        })
                        .build(k),
                ),
        )
}
