use crate::state::{AppState, UiCommand};
use crate::theme::VoxcellTheme;
use rune::{El, ScrollSpec, TextStyle, col, row, text};
use rune_kit::{Button, ButtonVariant, ControlSize, Dialog, Divider, Switch, TextInput};
use voxcell_core::ui_config::BUILT_IN_PRESETS;
use voxcell_core::{BackgroundPresetId, DensityMode, DotProfile, HorizonMode, SidebarPosition};

pub fn render_settings_dialog(
    state: &AppState,
    theme: &VoxcellTheme,
    overlay_layer: &mut Vec<El>,
) {
    if !state.settings_open {
        return;
    }
    let k = &theme.kit;

    // 1. Built-in UI Presets
    let mut presets_row = row().gap(6.0).items_center();
    for preset in BUILT_IN_PRESETS {
        let active = state.ui_config.preset_name == preset.name;
        let pid = preset.id.to_string();
        presets_row = presets_row.child(
            Button::new(preset.name)
                .variant(if active {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Neutral
                })
                .control_size(ControlSize::Mini)
                .on_press(move |s: &mut AppState| s.apply_ui_prompt(&pid))
                .build(k),
        );
    }

    // 2. Natural Language UI Customizer
    let nl_customizer = row()
        .w_full()
        .gap(8.0)
        .items_center()
        .child(
            rune::el().grow(1.0).min_w(0.0).child(
                TextInput::new(&state.ui_prompt_edit)
                    .placeholder("e.g. 'cyan crisp peaks compact sidebar right'")
                    .label("Natural language UI tweak")
                    .width(None)
                    .on_edit(|s: &mut AppState| &mut s.ui_prompt_edit)
                    .on_submit(|s: &mut AppState, _tx| {
                        let req = s.ui_prompt_edit.text.clone();
                        s.apply_ui_prompt(&req);
                    })
                    .build(k),
            ),
        )
        .child(
            Button::new("Apply Style")
                .variant(ButtonVariant::Submit)
                .control_size(ControlSize::Small)
                .on_press(|s: &mut AppState| {
                    let req = s.ui_prompt_edit.text.clone();
                    s.apply_ui_prompt(&req);
                })
                .build(k),
        );

    // 3. Dot Profile & Horizon Mode
    let dot_row = row()
        .gap(6.0)
        .items_center()
        .child(text("Dot Profile:").font(theme.mono_sm).color(theme.text_muted))
        .child(
            Button::new("Crisp")
                .variant(if state.ui_config.dot_profile == DotProfile::Crisp {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Mini)
                .on_press(|s: &mut AppState| {
                    s.ui_config.dot_profile = DotProfile::Crisp;
                    s.ui_config.bloom = 0.22;
                    s.pending_commands.push(UiCommand::PersistUiConfig);
                    s.step_animations(0.016);
                })
                .build(k),
        )
        .child(
            Button::new("Balanced")
                .variant(if state.ui_config.dot_profile == DotProfile::Balanced {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Mini)
                .on_press(|s: &mut AppState| {
                    s.ui_config.dot_profile = DotProfile::Balanced;
                    s.ui_config.bloom = 0.38;
                    s.pending_commands.push(UiCommand::PersistUiConfig);
                    s.step_animations(0.016);
                })
                .build(k),
        )
        .child(
            Button::new("Phosphor")
                .variant(if state.ui_config.dot_profile == DotProfile::Phosphor {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Mini)
                .on_press(|s: &mut AppState| {
                    s.ui_config.dot_profile = DotProfile::Phosphor;
                    s.ui_config.bloom = 0.65;
                    s.pending_commands.push(UiCommand::PersistUiConfig);
                    s.step_animations(0.016);
                })
                .build(k),
        );

    let horizon_row = row()
        .gap(6.0)
        .items_center()
        .child(text("Horizon:").font(theme.mono_sm).color(theme.text_muted))
        .child(
            Button::new("Silk")
                .variant(if state.ui_config.horizon_mode == HorizonMode::Silk {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Mini)
                .on_press(|s: &mut AppState| {
                    s.ui_config.horizon_mode = HorizonMode::Silk;
                    s.pending_commands.push(UiCommand::PersistUiConfig);
                    s.step_animations(0.016);
                })
                .build(k),
        )
        .child(
            Button::new("Peaks")
                .variant(if state.ui_config.horizon_mode == HorizonMode::Peaks {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Mini)
                .on_press(|s: &mut AppState| {
                    s.ui_config.horizon_mode = HorizonMode::Peaks;
                    s.pending_commands.push(UiCommand::PersistUiConfig);
                    s.step_animations(0.016);
                })
                .build(k),
        )
        .child(
            Button::new("Pulse")
                .variant(if state.ui_config.horizon_mode == HorizonMode::Pulse {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Mini)
                .on_press(|s: &mut AppState| {
                    s.ui_config.horizon_mode = HorizonMode::Pulse;
                    s.pending_commands.push(UiCommand::PersistUiConfig);
                    s.step_animations(0.016);
                })
                .build(k),
        )
        .child(
            Button::new("Ribbon")
                .variant(if state.ui_config.horizon_mode == HorizonMode::Ribbon {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Mini)
                .on_press(|s: &mut AppState| {
                    s.ui_config.horizon_mode = HorizonMode::Ribbon;
                    s.pending_commands.push(UiCommand::PersistUiConfig);
                    s.step_animations(0.016);
                })
                .build(k),
        );

    let layout_row = row()
        .gap(10.0)
        .items_center()
        .child(
            Button::new(match state.ui_config.sidebar_position {
                SidebarPosition::Left => "Sidebar: Left",
                SidebarPosition::Right => "Sidebar: Right",
            })
            .variant(ButtonVariant::Neutral)
            .control_size(ControlSize::Mini)
            .on_press(|s: &mut AppState| {
                s.ui_config.sidebar_position = match s.ui_config.sidebar_position {
                    SidebarPosition::Left => SidebarPosition::Right,
                    SidebarPosition::Right => SidebarPosition::Left,
                };
                s.pending_commands.push(UiCommand::PersistUiConfig);
            })
            .build(k),
        )
        .child(
            Button::new(match state.ui_config.density {
                DensityMode::Compact => "Density: Compact",
                DensityMode::Comfortable => "Density: Comfortable",
                DensityMode::Airy => "Density: Airy",
            })
            .variant(ButtonVariant::Neutral)
            .control_size(ControlSize::Mini)
            .on_press(|s: &mut AppState| {
                s.ui_config.density = match s.ui_config.density {
                    DensityMode::Compact => DensityMode::Comfortable,
                    DensityMode::Comfortable => DensityMode::Airy,
                    DensityMode::Airy => DensityMode::Compact,
                };
                s.pending_commands.push(UiCommand::PersistUiConfig);
            })
            .build(k),
        )
        .child(
            Switch::new(state.ui_config.reduced_motion)
                .label("Reduced Motion")
                .web()
                .on_toggle(|s: &mut AppState| {
                    s.ui_config.reduced_motion = !s.ui_config.reduced_motion;
                    s.pending_commands.push(UiCommand::PersistUiConfig);
                })
                .build(k),
        );

    // 4. 7 Ambient Background Presets
    let mut bg_row = row().gap(6.0).items_center();
    for &preset in BackgroundPresetId::all().iter().take(4) {
        let active = state.bg_settings.preset == preset;
        bg_row = bg_row.child(
            Button::new(preset.label())
                .variant(if active {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Mini)
                .on_press(move |s: &mut AppState| {
                    s.bg_settings.preset = preset;
                    s.pending_commands.push(UiCommand::PersistBackgroundSettings);
                })
                .build(k),
        );
    }
    let mut bg_row_2 = row().gap(6.0).items_center();
    for &preset in BackgroundPresetId::all().iter().skip(4) {
        let active = state.bg_settings.preset == preset;
        bg_row_2 = bg_row_2.child(
            Button::new(preset.label())
                .variant(if active {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Ghost
                })
                .control_size(ControlSize::Mini)
                .on_press(move |s: &mut AppState| {
                    s.bg_settings.preset = preset;
                    s.pending_commands.push(UiCommand::PersistBackgroundSettings);
                })
                .build(k),
        );
    }

    // 5. Gateway + Voice Credentials
    let gateway_section = col()
        .w_full()
        .gap(8.0)
        .child(
            text("Hermes Gateway & Deepgram Voice Credentials")
                .font(TextStyle::new(13.0, 700.0))
                .color(theme.text),
        )
        .child(
            TextInput::new(&state.gateway_url_edit)
                .placeholder("http://127.0.0.1:8642")
                .label("Hermes Gateway URL")
                .width(None)
                .on_edit(|s: &mut AppState| &mut s.gateway_url_edit)
                .build(k),
        )
        .child(
            row()
                .w_full()
                .gap(8.0)
                .child(
                    rune::el().grow(1.0).min_w(0.0).child(
                        TextInput::new(&state.hermes_key_edit)
                            .placeholder(if state.has_hermes_key {
                                "HERMES_API_KEY configured (enter to replace)"
                            } else {
                                "HERMES_API_KEY (optional)"
                            })
                            .label("Hermes API Key")
                            .width(None)
                            .on_edit(|s: &mut AppState| &mut s.hermes_key_edit)
                            .build(k),
                    ),
                )
                .child(
                    rune::el().grow(1.0).min_w(0.0).child(
                        TextInput::new(&state.deepgram_key_edit)
                            .placeholder(if state.has_deepgram_key {
                                "DEEPGRAM_API_KEY configured (enter to replace)"
                            } else {
                                "DEEPGRAM_API_KEY (Aura-2 TTS / Nova-2 STT)"
                            })
                            .label("Deepgram API Key")
                            .width(None)
                            .on_edit(|s: &mut AppState| &mut s.deepgram_key_edit)
                            .build(k),
                    ),
                ),
        )
        .child(
            row()
                .w_full()
                .justify_between()
                .items_center()
                .child(
                    row()
                        .gap(12.0)
                        .child(
                            Switch::new(state.voice.tts_enabled)
                                .label("Aura-2 TTS")
                                .web()
                                .on_toggle(|s: &mut AppState| {
                                    s.voice.tts_enabled = !s.voice.tts_enabled;
                                    s.pending_commands.push(UiCommand::PersistVoiceSettings);
                                })
                                .build(k),
                        )
                        .child(
                            Switch::new(state.voice.hands_free_vad)
                                .label("Hands-Free VAD")
                                .web()
                                .on_toggle(|s: &mut AppState| {
                                    let next = !s.voice.hands_free_vad;
                                    s.voice.hands_free_vad = next;
                                    s.pending_commands.push(UiCommand::ToggleMic(next));
                                    s.pending_commands.push(UiCommand::PersistVoiceSettings);
                                })
                                .build(k),
                        ),
                )
                .child(
                    Button::new("Save & Reconnect")
                        .variant(ButtonVariant::Submit)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            let base_url = s.gateway_url_edit.text.trim().to_string();
                            let hermes_api_key = s.hermes_key_edit.text.trim().to_string();
                            let deepgram_api_key = s.deepgram_key_edit.text.trim().to_string();
                            if !base_url.is_empty() {
                                s.gateway_base_url = base_url.clone();
                                s.gateway.base_url = base_url.clone();
                            }
                            if !hermes_api_key.is_empty() {
                                s.has_hermes_key = true;
                            }
                            if !deepgram_api_key.is_empty() {
                                s.has_deepgram_key = true;
                            }
                            s.pending_commands.push(UiCommand::SaveGatewaySettings {
                                base_url,
                                hermes_api_key,
                                deepgram_api_key,
                            });
                            s.pending_commands.push(UiCommand::RefreshGateway);
                            s.settings_open = false;
                        })
                        .build(k),
                ),
        );

    let content = col()
        .w_full()
        .padding(16.0)
        .gap(12.0)
        .child(
            text("Appearance Studio & Natural Language Styler")
                .font(TextStyle::new(13.0, 700.0))
                .color(theme.accent),
        )
        .child(presets_row)
        .child(nl_customizer)
        .child(dot_row)
        .child(horizon_row)
        .child(layout_row)
        .child(Divider::horizontal().build(k))
        .child(
            text("Ambient Glass Backdrop")
                .font(TextStyle::new(12.5, 600.0))
                .color(theme.text),
        )
        .child(bg_row)
        .child(bg_row_2)
        .child(Divider::horizontal().build(k))
        .child(gateway_section);

    Dialog::new("settings", "Voxcell Settings & UI Customizer")
        .open(true)
        .description("Tune Bayer halftone shaders, glass backdrop presets, voice, and Hermes gateway auth.")
        .width(680.0)
        .child(
            col()
                .w_full()
                .grow(1.0)
                .min_h(0.0)
                .scroll(ScrollSpec { stick_bottom: false })
                .child(content),
        )
        .on_close(|s: &mut AppState| s.settings_open = false)
        .build(k, overlay_layer);
}
