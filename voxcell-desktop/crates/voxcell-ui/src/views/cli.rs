use crate::state::AppState;
use crate::theme::VoxcellTheme;
use rune::{Cx, El, ScrollSpec, TextStyle, col, el, row, text};
use rune_kit::{Button, ButtonVariant, ControlSize, Divider, TextInput};
use voxcell_core::cli::{SLASH_COMMANDS, autocomplete_slash_commands};

pub fn render_cli(state: &AppState, theme: &VoxcellTheme, _cx: &mut Cx<AppState>) -> El {
    let k = &theme.kit;

    let suggestions = if state.cli_edit.text.trim().starts_with('/') {
        autocomplete_slash_commands(&state.cli_edit.text)
    } else {
        SLASH_COMMANDS.iter().take(6).collect()
    };

    let mut chips = row().key("cli-autocomplete").w_full().gap(6.0).items_center();
    for spec in suggestions.into_iter().take(6) {
        let cmd_name = spec.name.to_string();
        chips = chips.child(
            Button::new(spec.name)
                .variant(ButtonVariant::Neutral)
                .control_size(ControlSize::Mini)
                .on_press(move |s: &mut AppState| {
                    s.cli_edit.replace_text(format!("{cmd_name} "));
                })
                .build(k),
        );
    }

    let mut log_col = col().key("cli-log-lines").w_full().gap(4.0).padding(12.0);
    for (idx, line) in state.cli_log.iter().enumerate() {
        let color = if line.starts_with('>') {
            theme.accent
        } else if line.starts_with("[gateway error]") || line.starts_with("Unknown") {
            theme.rose
        } else {
            theme.text_muted
        };
        log_col = log_col.child(
            text(line.clone())
                .key(format!("cli-line-{idx}"))
                .font(theme.mono)
                .color(color),
        );
    }

    let header = row()
        .key("cli-header")
        .w_full()
        .justify_between()
        .items_center()
        .child(
            text("Hermes Duet CLI // Native Slash Terminal")
                .font(TextStyle::new(13.5, 700.0).mono())
                .color(theme.text),
        )
        .child(
            row()
                .gap(6.0)
                .child(
                    Button::new("/help")
                        .variant(ButtonVariant::Neutral)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| s.execute_cli_line("/help"))
                        .build(k),
                )
                .child(
                    Button::new("Clear")
                        .variant(ButtonVariant::Ghost)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| s.cli_log.clear())
                        .build(k),
                ),
        );

    let input_bar = row()
        .key("cli-input-bar")
        .w_full()
        .padding(8.0)
        .gap(8.0)
        .radius(8.0)
        .fill(theme.card_fill)
        .border(1.0, theme.border_strong)
        .items_center()
        .child(text("$").font(theme.mono).color(theme.accent))
        .child(
            el().grow(1.0).min_w(0.0).child(
                TextInput::new(&state.cli_edit)
                    .placeholder("Enter /command or prompt...")
                    .label("CLI command")
                    .plain()
                    .width(None)
                    .on_edit(|s: &mut AppState| &mut s.cli_edit)
                    .on_submit(|s: &mut AppState, _tx| {
                        let line = s.cli_edit.text.clone();
                        s.cli_edit.clear();
                        s.execute_cli_line(&line);
                    })
                    .build(k),
            ),
        )
        .child(
            Button::new("Run")
                .variant(ButtonVariant::Submit)
                .control_size(ControlSize::Small)
                .on_press(|s: &mut AppState| {
                    let line = s.cli_edit.text.clone();
                    s.cli_edit.clear();
                    s.execute_cli_line(&line);
                })
                .build(k),
        );

    col()
        .key("cli-view")
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .h_full()
        .padding(14.0)
        .gap(10.0)
        .child(header)
        .child(
            col()
                .key("cli-scroll")
                .grow(1.0)
                .min_h(0.0)
                .w_full()
                .radius(10.0)
                .fill(theme.bg.alpha(0.78))
                .border(1.0, theme.border)
                .scroll(ScrollSpec { stick_bottom: true })
                .child(log_col),
        )
        .child(chips)
        .child(Divider::horizontal().build(k))
        .child(input_bar)
}
