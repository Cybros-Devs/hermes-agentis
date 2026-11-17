use crate::state::{AppState, UiCommand};
use crate::theme::{VoxcellTheme, parse_hex_color};
use rune::{Cx, El, SurfaceFit, TextStyle, col, el, row, text};
use rune_kit::{Button, ButtonVariant, ControlSize, Dialog, TextInput};
use voxcell_core::canvas::{CanvasFormation, CanvasShapeKind, apply_formation};
use voxcell_core::{ActiveView, TaskLifecycleStatus};

pub fn render_canvas(state: &AppState, theme: &VoxcellTheme, _cx: &mut Cx<AppState>) -> El {
    let k = &theme.kit;

    // 1. Canvas Toolbar: Formations + Add Dot + Pin info
    let toolbar = row()
        .key("canvas-toolbar")
        .w_full()
        .justify_between()
        .items_center()
        .padding(10.0)
        .radius(10.0)
        .fill(theme.card_fill)
        .border(1.0, theme.border)
        .child(
            row()
                .gap(8.0)
                .items_center()
                .child(
                    text("Hermes Dots")
                        .font(TextStyle::new(14.0, 700.0))
                        .color(theme.text),
                )
                .child(
                    text(format!("{} spatial nodes", state.dots.len()))
                        .font(theme.mono_sm)
                        .color(theme.text_muted),
                ),
        )
        .child(
            row()
                .gap(6.0)
                .items_center()
                .child(
                    Button::new("Constellation")
                        .variant(if state.canvas_formation == CanvasFormation::Constellation {
                            ButtonVariant::Submit
                        } else {
                            ButtonVariant::Ghost
                        })
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            s.canvas_formation = CanvasFormation::Constellation;
                            apply_formation(&mut s.dots, CanvasFormation::Constellation, 860.0, 520.0);
                            s.pending_commands.push(UiCommand::PersistDots);
                        })
                        .build(k),
                )
                .child(
                    Button::new("Orbit")
                        .variant(if state.canvas_formation == CanvasFormation::Orbit {
                            ButtonVariant::Submit
                        } else {
                            ButtonVariant::Ghost
                        })
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            s.canvas_formation = CanvasFormation::Orbit;
                            apply_formation(&mut s.dots, CanvasFormation::Orbit, 860.0, 520.0);
                            s.pending_commands.push(UiCommand::PersistDots);
                        })
                        .build(k),
                )
                .child(
                    Button::new("Grid")
                        .variant(if state.canvas_formation == CanvasFormation::Grid {
                            ButtonVariant::Submit
                        } else {
                            ButtonVariant::Ghost
                        })
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            s.canvas_formation = CanvasFormation::Grid;
                            apply_formation(&mut s.dots, CanvasFormation::Grid, 860.0, 520.0);
                            s.pending_commands.push(UiCommand::PersistDots);
                        })
                        .build(k),
                )
                .child(
                    Button::new("+ Add Dot")
                        .variant(ButtonVariant::Neutral)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            s.add_dot_modal_open = true;
                            s.step_animations(0.016);
                        })
                        .build(k),
                ),
        );

    // 2. Spatial Canvas Field
    let mut field = el()
        .key("canvas-field")
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .radius(12.0)
        .fill(theme.bg.alpha(0.55))
        .border(1.0, theme.border);

    if state.dots.is_empty() {
        field = field.center().child(
            col()
                .items_center()
                .gap(10.0)
                .padding(24.0)
                .radius(12.0)
                .fill(theme.card_fill)
                .border(1.0, theme.border)
                .child(
                    text("No spatial character nodes on Canvas yet")
                        .font(TextStyle::new(14.0, 600.0))
                        .color(theme.text),
                )
                .child(
                    text("Click + Add Dot to spawn an interactive character node, or Pin to Canvas from the sidebar.")
                        .font(theme.mono_sm)
                        .color(theme.text_muted),
                )
                .child(
                    Button::new("Spawn First Character Dot")
                        .variant(ButtonVariant::Submit)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            s.add_dot_modal_open = true;
                            s.step_animations(0.016);
                        })
                        .build(k),
                ),
        );
    } else {
        for dot in &state.dots {
            let selected = state.selected_dot_id.as_deref() == Some(dot.id.as_str());
            let busy = state
                .thinking_by_channel
                .get(&dot.channel_id)
                .copied()
                .unwrap_or(false)
                || state.tasks.iter().any(|t| {
                    t.channel_id == dot.channel_id && t.status == TaskLifecycleStatus::Running
                });
            let accent = parse_hex_color(&dot.color_hex, theme.accent);
            let ring = if busy {
                theme.amber
            } else if selected {
                accent
            } else {
                theme.border
            };

            let dot_id_drag = dot.id.clone();
            let dot_id_select = dot.id.clone();
            let ch_id_open = dot.channel_id.clone();

            let x = (dot.x - 68.0).clamp(12.0, 740.0);
            let y = (dot.y - 68.0).clamp(12.0, 410.0);

            let sprite = state
                .dot_pixels
                .get(&dot.id)
                .map(|px| el().w(84.0).h(84.0).pixels_fit(px, SurfaceFit::Fit))
                .unwrap_or_else(|| el().w(84.0).h(84.0).radius(42.0).fill(accent.alpha(0.25)));

            let node = col()
                .key(format!("canvas-node-{}", dot.id))
                .absolute(x, y)
                .w(136.0)
                .padding(8.0)
                .gap(4.0)
                .items_center()
                .radius(12.0)
                .fill(if selected {
                    theme.card_fill
                } else {
                    theme.surface.alpha(0.85)
                })
                .border(if selected || busy { 1.25 } else { 0.75 }, ring)
                .on_press(move |s: &mut AppState| {
                    s.selected_dot_id = Some(dot_id_select.clone());
                    s.active_channel_id = ch_id_open.clone();
                })
                .on_drag(move |s: &mut AppState, drag, _tx| {
                    if let Some(d) = s.dots.iter_mut().find(|item| item.id == dot_id_drag) {
                        if drag.phase == rune::Phase::Down {
                            drag.data = d.x;
                        }
                        d.x = (drag.x + drag.dx).clamp(80.0, 820.0);
                        d.y = (drag.y + drag.dy).clamp(80.0, 480.0);
                        if drag.phase == rune::Phase::Up {
                            s.pending_commands.push(UiCommand::PersistDots);
                        }
                    }
                })
                .child(sprite)
                .child(
                    text(dot.label.clone())
                        .font(TextStyle::new(12.0, 600.0).lh(15.0))
                        .color(theme.text),
                )
                .child(
                    text(if busy {
                        "thinking..."
                    } else {
                        dot.shape.label()
                    })
                    .font(theme.mono_sm)
                    .color(if busy { theme.amber } else { accent }),
                );

            field = field.child(node);
        }
    }

    // 3. Selected Node Quick Action Bar
    let action_bar = if let Some(sel) = state
        .selected_dot_id
        .as_deref()
        .and_then(|id| state.dots.iter().find(|d| d.id == id))
    {
        let ch_id_prompt = sel.channel_id.clone();
        let ch_id_thread = sel.channel_id.clone();
        row()
            .key("canvas-selected-bar")
            .w_full()
            .padding(8.0)
            .gap(8.0)
            .radius(10.0)
            .fill(theme.card_fill)
            .border(1.0, theme.border_strong)
            .items_center()
            .child(
                text(format!("Selected: {} ({})", sel.label, sel.shape.label()))
                    .font(theme.mono_sm)
                    .color(theme.accent),
            )
            .child(
                el().grow(1.0).min_w(0.0).child(
                    TextInput::new(&state.canvas_prompt_edit)
                        .placeholder("Dispatch quick prompt to this character node...")
                        .label("Node prompt")
                        .width(None)
                        .on_edit(|s: &mut AppState| &mut s.canvas_prompt_edit)
                        .on_submit(move |s: &mut AppState, _tx| {
                            let txt = s.canvas_prompt_edit.text.trim().to_string();
                            if !txt.is_empty() {
                                s.canvas_prompt_edit.clear();
                                s.active_channel_id = ch_id_prompt.clone();
                                s.dispatch_user_prompt(&txt, false);
                            }
                        })
                        .build(k),
                ),
            )
            .child(
                Button::new("Open Thread")
                    .variant(ButtonVariant::Submit)
                    .control_size(ControlSize::Small)
                    .on_press(move |s: &mut AppState| {
                        s.active_channel_id = ch_id_thread.clone();
                        s.active_view = ActiveView::Thread;
                    })
                    .build(k),
            )
    } else {
        row().key("canvas-selected-bar")
    };

    col()
        .key("canvas-view")
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .h_full()
        .padding(14.0)
        .gap(10.0)
        .child(toolbar)
        .child(field)
        .child(action_bar)
}

pub fn render_add_dot_dialog(
    state: &AppState,
    theme: &VoxcellTheme,
    overlay_layer: &mut Vec<El>,
) {
    let k = &theme.kit;
    if !state.add_dot_modal_open {
        return;
    }

    let mut shape_grid = row().w_full().gap(6.0);
    for &shape in CanvasShapeKind::all() {
        let active = state.add_dot_shape == shape;
        shape_grid = shape_grid.child(
            Button::new(shape.label())
                .variant(if active {
                    ButtonVariant::Submit
                } else {
                    ButtonVariant::Neutral
                })
                .control_size(ControlSize::Mini)
                .on_press(move |s: &mut AppState| {
                    s.add_dot_shape = shape;
                    s.step_animations(0.016);
                })
                .build(k),
        );
    }

    let body = col()
        .w_full()
        .padding(16.0)
        .gap(12.0)
        .child(
            row()
                .w_full()
                .gap(14.0)
                .items_center()
                .child(
                    el().w(96.0)
                        .h(96.0)
                        .radius(10.0)
                        .fill(theme.bg)
                        .border(1.0, theme.border_strong)
                        .child(
                            el().w(96.0)
                                .h(96.0)
                                .pixels_fit(&state.add_dot_preview_pixels, SurfaceFit::Fit),
                        ),
                )
                .child(
                    col()
                        .grow(1.0)
                        .min_w(0.0)
                        .gap(8.0)
                        .child(
                            text("Character Node Name")
                                .font(theme.mono_sm)
                                .color(theme.text_muted),
                        )
                        .child(
                            TextInput::new(&state.add_dot_label_edit)
                                .placeholder("e.g. Research Kitsune")
                                .label("Character Name")
                                .width(None)
                                .on_edit(|s: &mut AppState| &mut s.add_dot_label_edit)
                                .build(k),
                        ),
                ),
        )
        .child(
            text("Choose 9-Shape Halftone Form")
                .font(theme.mono_sm)
                .color(theme.text_muted),
        )
        .child(shape_grid)
        .child(
            row()
                .w_full()
                .justify_end()
                .gap(8.0)
                .child(
                    Button::new("Cancel")
                        .variant(ButtonVariant::Ghost)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| s.add_dot_modal_open = false)
                        .build(k),
                )
                .child(
                    Button::new("Create Node")
                        .variant(ButtonVariant::Submit)
                        .control_size(ControlSize::Small)
                        .on_press(|s: &mut AppState| {
                            let label = s.add_dot_label_edit.text.clone();
                            let shape = s.add_dot_shape;
                            s.add_canvas_dot(&label, shape);
                        })
                        .build(k),
                ),
        );

    Dialog::new("add-dot", "Spawn Canvas Character Dot")
        .open(true)
        .description("Pin a draggable halftone character dot bound to its own Hermes session.")
        .width(620.0)
        .fit()
        .child(body)
        .on_close(|s: &mut AppState| s.add_dot_modal_open = false)
        .build(k, overlay_layer);
}
