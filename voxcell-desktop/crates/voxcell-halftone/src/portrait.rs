use image::ImageFormat;
use std::sync::OnceLock;
use voxcell_core::{ExpressionMood, EyeState, MouthViseme};

#[derive(Clone, Debug)]
pub struct PortraitSourceField {
    pub width: usize,
    pub height: usize,
    pub base_lum: Vec<f32>,
    pub ink_mask: Vec<f32>,
    pub min_ux: f32,
    pub max_ux: f32,
    pub min_uy: f32,
    pub max_uy: f32,
}

#[derive(Clone, Debug)]
pub struct PortraitMotionState {
    pub blink: f32,
    pub squint: f32,
    pub wide: f32,
    pub gaze_x: f32,
    pub gaze_y: f32,
    pub brow_lift: f32,
    pub mouth_open: f32,
    pub mouth_width: f32,
    pub mouth_round: f32,
    pub jaw_drop: f32,
    pub smile: f32,
    pub tongue_lift: f32,
    pub tongue_show: f32,
    pub teeth_top: f32,
    pub teeth_bottom: f32,
    pub lip_press: f32,
    pub lip_bite: f32,
    pub rest_part: f32,
    pub pucker_ring: f32,
    pub head_yaw: f32,
    pub head_pitch: f32,
    pub head_tilt: f32,
    pub head_sway_x: f32,
    pub head_nod_y: f32,
    pub hair_lag_x: f32,
    pub hair_lag_y: f32,
    pub shoulder_y: f32,
    pub listen_pulse: f32,
}

impl Default for PortraitMotionState {
    fn default() -> Self {
        Self {
            blink: 0.0,
            squint: 0.0,
            wide: 0.0,
            gaze_x: 0.0,
            gaze_y: 0.0,
            brow_lift: 0.0,
            mouth_open: 0.0,
            mouth_width: 1.0,
            mouth_round: 0.0,
            jaw_drop: 0.0,
            smile: 0.0,
            tongue_lift: 0.0,
            tongue_show: 0.0,
            teeth_top: 0.0,
            teeth_bottom: 0.0,
            lip_press: 0.0,
            lip_bite: 0.0,
            rest_part: 0.0,
            pucker_ring: 0.0,
            head_yaw: 0.0,
            head_pitch: 0.0,
            head_tilt: 0.0,
            head_sway_x: 0.0,
            head_nod_y: 0.0,
            hair_lag_x: 0.0,
            hair_lag_y: 0.0,
            shoulder_y: 0.0,
            listen_pulse: 0.0,
        }
    }
}

#[derive(Clone, Debug)]
pub struct PortraitAnimatorInput {
    pub time: f32,
    pub mood: ExpressionMood,
    pub eye_state: EyeState,
    pub viseme: MouthViseme,
    pub energy: f32,
    pub is_speaking: bool,
    pub is_listening: bool,
    pub pointer_x: Option<f32>,
    pub pointer_y: Option<f32>,
    pub tap_impulse: f32,
}

#[derive(Clone, Debug)]
pub struct PortraitAnimator {
    state: PortraitMotionState,
    yaw_vel: f32,
    pitch_vel: f32,
    tilt_vel: f32,
    hair_x_vel: f32,
    hair_y_vel: f32,
    nod_vel: f32,
    shoulder_vel: f32,
    mouth_vel: f32,
    jaw_vel: f32,
    prev_mood: ExpressionMood,
    micro_nudge: f32,
}

impl Default for PortraitAnimator {
    fn default() -> Self {
        Self::new()
    }
}

impl PortraitAnimator {
    pub fn new() -> Self {
        Self {
            state: PortraitMotionState::default(),
            yaw_vel: 0.0,
            pitch_vel: 0.0,
            tilt_vel: 0.0,
            hair_x_vel: 0.0,
            hair_y_vel: 0.0,
            nod_vel: 0.0,
            shoulder_vel: 0.0,
            mouth_vel: 0.0,
            jaw_vel: 0.0,
            prev_mood: ExpressionMood::Calm,
            micro_nudge: 0.0,
        }
    }

    pub fn state(&self) -> &PortraitMotionState {
        &self.state
    }

    pub fn step(&mut self, input: &PortraitAnimatorInput, dt: f32, reduced_motion: bool) -> &PortraitMotionState {
        let clamped_dt = dt.clamp(0.004, 0.05);
        if input.mood != self.prev_mood {
            self.micro_nudge += 0.35;
            self.prev_mood = input.mood;
        }
        if input.tap_impulse > 0.05 {
            self.nod_vel += input.tap_impulse * 0.16;
            self.tilt_vel -= input.tap_impulse * 0.18;
            self.micro_nudge += input.tap_impulse * 0.25;
        }
        self.micro_nudge *= (-5.5 * clamped_dt).exp();

        let vis = viseme_target(input.viseme, input.energy, input.is_speaking);
        let natural_blink = if reduced_motion {
            0.0
        } else {
            evaluate_natural_blink_curve(input.time, 0.4, 3)
        };
        let target_blink = match input.eye_state {
            EyeState::Blink => 1.0,
            EyeState::Half => 0.45_f32.max(natural_blink),
            EyeState::Wide | EyeState::Open => natural_blink,
        };
        let target_squint = match input.mood {
            ExpressionMood::Focused => 0.48,
            ExpressionMood::Happy if !input.is_speaking => 0.14,
            _ => 0.0,
        };
        let target_wide = if input.eye_state == EyeState::Wide || input.mood == ExpressionMood::Alert {
            0.85
        } else {
            0.0
        };

        let blink_rate = if target_blink > self.state.blink { 44.0 } else { 18.0 };
        self.state.blink = exp_approach(self.state.blink, target_blink, blink_rate, clamped_dt);
        self.state.squint = exp_approach(self.state.squint, target_squint, 10.0, clamped_dt);
        self.state.wide = exp_approach(self.state.wide, target_wide, 12.0, clamped_dt);

        let ptr_x = input.pointer_x.unwrap_or(0.0).clamp(-1.0, 1.0);
        let ptr_y = input.pointer_y.unwrap_or(0.0).clamp(-1.0, 1.0);
        let has_pointer = input.pointer_x.is_some() || input.pointer_y.is_some();

        let (t_gaze_x, t_gaze_y) = if has_pointer {
            (ptr_x * 0.72, ptr_y * 0.58)
        } else if input.mood == ExpressionMood::Thinking {
            let phase = (input.time * 1.1).floor();
            ((phase * 1.7).sin() * 0.48, -0.32 + (phase * 1.3).cos() * 0.08)
        } else {
            let fix = (input.time * 0.48).floor() as i32;
            let gx = if (fix * 7).rem_euclid(3) == 0 {
                ((fix as f32) * 2.1).sin() * 0.18
            } else {
                0.0
            };
            let gy = if (fix * 5).rem_euclid(4) == 0 { -0.06 } else { 0.02 };
            (gx, gy)
        };

        self.state.gaze_x = exp_approach(self.state.gaze_x, t_gaze_x, 14.0, clamped_dt);
        self.state.gaze_y = exp_approach(self.state.gaze_y, t_gaze_y, 14.0, clamped_dt);

        let t_brow = match input.mood {
            ExpressionMood::Alert => 0.72,
            ExpressionMood::Thinking => 0.35,
            ExpressionMood::Focused => -0.32,
            ExpressionMood::Listening => 0.20,
            _ => input.energy * 0.25,
        };
        self.state.brow_lift = exp_approach(self.state.brow_lift, t_brow, 10.0, clamped_dt);

        // Mouth and viseme spring kinematics
        let m_stiff = if vis.open > self.state.mouth_open { 105.0 } else { 82.0 };
        self.mouth_vel += ((vis.open - self.state.mouth_open) * m_stiff - self.mouth_vel * 19.0) * clamped_dt;
        self.state.mouth_open = (self.state.mouth_open + self.mouth_vel * clamped_dt).clamp(0.0, 1.0);
        self.jaw_vel += ((vis.jaw_drop - self.state.jaw_drop) * 88.0 - self.jaw_vel * 17.5) * clamped_dt;
        self.state.jaw_drop = (self.state.jaw_drop + self.jaw_vel * clamped_dt).clamp(0.0, 1.0);

        self.state.mouth_width = exp_approach(self.state.mouth_width, vis.width, 16.0, clamped_dt);
        self.state.mouth_round = exp_approach(self.state.mouth_round, vis.round, 16.0, clamped_dt);
        let mood_smile: f32 = match input.mood {
            ExpressionMood::Happy => 0.85,
            ExpressionMood::Calm => 0.26,
            _ if input.is_speaking => 0.22,
            _ => 0.14,
        };
        let target_smile = mood_smile.max(vis.smile);
        self.state.smile = exp_approach(self.state.smile, target_smile, 9.0, clamped_dt);
        self.state.tongue_lift = exp_approach(self.state.tongue_lift, vis.tongue_lift, 16.0, clamped_dt);
        self.state.tongue_show = exp_approach(self.state.tongue_show, vis.tongue_show, 14.0, clamped_dt);
        self.state.teeth_top = exp_approach(self.state.teeth_top, vis.teeth_top, 16.0, clamped_dt);
        self.state.teeth_bottom = exp_approach(self.state.teeth_bottom, vis.teeth_bottom, 16.0, clamped_dt);
        self.state.lip_press = exp_approach(self.state.lip_press, vis.lip_press, 16.0, clamped_dt);
        self.state.lip_bite = exp_approach(self.state.lip_bite, vis.lip_bite, 16.0, clamped_dt);
        self.state.rest_part = exp_approach(self.state.rest_part, vis.rest_part, 12.0, clamped_dt);
        self.state.pucker_ring = exp_approach(self.state.pucker_ring, vis.pucker_ring, 14.0, clamped_dt);

        if reduced_motion {
            self.state.head_yaw = 0.0;
            self.state.head_pitch = 0.0;
            self.state.head_tilt = 0.0;
            self.state.head_sway_x = 0.0;
            self.state.head_nod_y = 0.0;
            self.state.hair_lag_x = 0.0;
            self.state.hair_lag_y = 0.0;
            self.state.shoulder_y = 0.0;
            self.state.listen_pulse = if input.is_listening || input.is_speaking { 0.45 } else { 0.0 };
            return &self.state;
        }

        let t = input.time;
        let idle_yaw = (t * 0.42).sin() * 0.065 + (t * 0.19).cos() * 0.032;
        let mood_yaw = match input.mood {
            ExpressionMood::Thinking => -0.14,
            ExpressionMood::Listening => 0.09,
            ExpressionMood::Alert => -0.05,
            _ => 0.0,
        };
        let ptr_yaw = if has_pointer { ptr_x * 0.18 } else { 0.0 };
        let speak_yaw = if input.is_speaking { (t * 2.1).sin() * (0.04 + input.energy * 0.06) } else { 0.0 };
        let target_yaw = (idle_yaw + mood_yaw + ptr_yaw + speak_yaw).clamp(-0.34, 0.34);

        let idle_pitch = (t * 0.61).sin() * 0.045;
        let mood_pitch = match input.mood {
            ExpressionMood::Thinking => -0.08,
            ExpressionMood::Speaking => (t * 3.4).sin() * 0.03 * input.energy,
            _ => 0.0,
        };
        let ptr_pitch = if has_pointer { ptr_y * 0.14 } else { 0.0 };
        let target_pitch = (idle_pitch + mood_pitch + ptr_pitch).clamp(-0.24, 0.24);

        let target_tilt = match input.mood {
            ExpressionMood::Thinking => 0.055 + (t * 1.1).sin() * 0.02,
            ExpressionMood::Happy => -0.03 + (t * 1.5).sin() * 0.018,
            ExpressionMood::Listening => 0.038,
            _ => (t * 0.8).sin() * 0.015,
        } + if input.is_speaking {
            (t * 3.8).sin() * (0.025 * input.energy)
        } else {
            0.0
        };

        self.yaw_vel += ((target_yaw - self.state.head_yaw) * 48.0 - self.yaw_vel * 11.5) * clamped_dt;
        self.state.head_yaw = (self.state.head_yaw + self.yaw_vel * clamped_dt).clamp(-0.38, 0.38);

        self.pitch_vel += ((target_pitch - self.state.head_pitch) * 48.0 - self.pitch_vel * 11.5) * clamped_dt;
        self.state.head_pitch = (self.state.head_pitch + self.pitch_vel * clamped_dt).clamp(-0.28, 0.28);

        self.tilt_vel += ((target_tilt - self.state.head_tilt) * 56.0 - self.tilt_vel * 12.0) * clamped_dt;
        self.state.head_tilt = (self.state.head_tilt + self.tilt_vel * clamped_dt).clamp(-0.18, 0.18);

        let target_sway_x = (t * 1.25).sin() * 0.008 + if input.is_speaking { (t * 4.8).sin() * 0.007 * input.energy } else { 0.0 };
        self.state.head_sway_x = exp_approach(self.state.head_sway_x, target_sway_x, 8.0, clamped_dt);

        let target_nod = (t * 1.75).cos() * 0.007
            - if input.is_speaking { (t * 6.5).sin().abs() * 0.011 * input.energy } else { 0.0 }
            + self.micro_nudge * 0.01;
        self.nod_vel += ((target_nod - self.state.head_nod_y) * 90.0 - self.nod_vel * 15.0) * clamped_dt;
        self.state.head_nod_y = (self.state.head_nod_y + self.nod_vel * clamped_dt).clamp(-0.04, 0.04);

        let target_shoulder = (t * 1.75 - 0.3).cos() * 0.006;
        self.shoulder_vel += ((target_shoulder - self.state.shoulder_y) * 52.0 - self.shoulder_vel * 11.0) * clamped_dt;
        self.state.shoulder_y = (self.state.shoulder_y + self.shoulder_vel * clamped_dt).clamp(-0.03, 0.03);

        // Secondary hair lag follows inverse angular/linear velocities
        let desired_hair_x = (-self.yaw_vel * 0.028 - self.tilt_vel * 0.032 + (t * 1.4 - 0.6).sin() * 0.006).clamp(-0.03, 0.03);
        let desired_hair_y = (-self.nod_vel * 0.045 + (t * 1.75 - 0.8).cos() * 0.004).clamp(-0.025, 0.025);
        self.hair_x_vel += ((desired_hair_x - self.state.hair_lag_x) * 64.0 - self.hair_x_vel * 9.5) * clamped_dt;
        self.hair_y_vel += ((desired_hair_y - self.state.hair_lag_y) * 64.0 - self.hair_y_vel * 9.5) * clamped_dt;
        self.state.hair_lag_x = (self.state.hair_lag_x + self.hair_x_vel * clamped_dt).clamp(-0.035, 0.035);
        self.state.hair_lag_y = (self.state.hair_lag_y + self.hair_y_vel * clamped_dt).clamp(-0.03, 0.03);

        let target_pulse = if input.is_speaking || input.is_listening {
            (0.42 + input.energy * 0.58).clamp(0.0, 1.0)
        } else if input.mood == ExpressionMood::Thinking {
            0.22 + 0.14 * (t * 2.6).sin().abs()
        } else {
            0.0
        };
        self.state.listen_pulse = exp_approach(self.state.listen_pulse, target_pulse, 8.0, clamped_dt);

        &self.state
    }
}

struct VisemeShape {
    open: f32,
    width: f32,
    round: f32,
    jaw_drop: f32,
    smile: f32,
    tongue_lift: f32,
    tongue_show: f32,
    teeth_top: f32,
    teeth_bottom: f32,
    lip_press: f32,
    lip_bite: f32,
    rest_part: f32,
    pucker_ring: f32,
}

fn viseme_target(viseme: MouthViseme, energy: f32, is_speaking: bool) -> VisemeShape {
    let e = energy.clamp(0.0, 1.0);
    let mut s = VisemeShape {
        open: 0.0,
        width: 1.0,
        round: 0.0,
        jaw_drop: 0.0,
        smile: 0.0,
        tongue_lift: 0.0,
        tongue_show: 0.0,
        teeth_top: 0.0,
        teeth_bottom: 0.0,
        lip_press: 0.0,
        lip_bite: 0.0,
        rest_part: 0.0,
        pucker_ring: 0.0,
    };
    if !is_speaking && viseme == MouthViseme::Closed {
        return s;
    }
    match viseme {
        MouthViseme::Closed => {}
        MouthViseme::Rest => {
            s.open = 0.09;
            s.rest_part = 0.85;
            s.teeth_top = 0.25;
        }
        MouthViseme::Mbp => {
            s.lip_press = 0.92;
            s.width = 0.96;
        }
        MouthViseme::Fv => {
            s.open = 0.22 + e * 0.08;
            s.lip_bite = 0.86;
            s.teeth_top = 0.82;
        }
        MouthViseme::Lth => {
            s.open = 0.44 + e * 0.14;
            s.tongue_lift = 0.85;
            s.tongue_show = 0.72;
            s.teeth_top = 0.65;
            s.jaw_drop = 0.35;
        }
        MouthViseme::Smile => {
            s.smile = 0.95;
            s.width = 1.24;
        }
        MouthViseme::Small => {
            s.open = 0.30 + e * 0.14;
            s.teeth_top = 0.52;
            s.jaw_drop = 0.22;
        }
        MouthViseme::Mid => {
            s.open = 0.56 + e * 0.16;
            s.teeth_top = 0.72;
            s.tongue_show = 0.32;
            s.jaw_drop = 0.48;
        }
        MouthViseme::Round => {
            s.open = 0.62 + e * 0.20;
            s.round = 0.92;
            s.width = 0.72;
            s.pucker_ring = 0.75;
            s.jaw_drop = 0.44;
        }
        MouthViseme::Ee => {
            s.open = 0.42 + e * 0.16;
            s.width = 1.32;
            s.teeth_top = 0.86;
            s.teeth_bottom = 0.64;
            s.jaw_drop = 0.28;
        }
        MouthViseme::Wide => {
            s.open = (0.86 + e * 0.14).clamp(0.0, 1.0);
            s.width = 1.12;
            s.teeth_top = 0.78;
            s.tongue_show = 0.46;
            s.jaw_drop = 0.82;
        }
    }
    s
}

/// Evaluates natural asymmetric blink envelope `[0..1]` with ~3.2s cadence and occasional double-blink.
pub fn evaluate_natural_blink_curve(time: f32, phase_offset: f32, cadence_hint: u32) -> f32 {
    let cycle_dur = match cadence_hint % 3 {
        0 => 3.45_f32,
        1 => 3.85_f32,
        _ => 3.15_f32,
    };
    let shifted = (time + phase_offset).max(0.0);
    let cycle_idx = (shifted / cycle_dur).floor() as u32;
    let t = shifted - (cycle_idx as f32) * cycle_dur;

    let single = eval_single_blink(t, 0.22);
    let has_double = cycle_idx % 4 == 2;
    let double = if has_double { eval_single_blink(t, 0.56) } else { 0.0 };
    single.max(double).clamp(0.0, 1.0)
}

fn eval_single_blink(t: f32, start: f32) -> f32 {
    let dt = t - start;
    if !(0.0..=0.26).contains(&dt) {
        return 0.0;
    }
    if dt < 0.075 {
        smoothstep(0.0, 0.075, dt)
    } else if dt < 0.115 {
        1.0
    } else {
        1.0 - smoothstep(0.115, 0.26, dt)
    }
}

#[derive(Clone, Debug)]
pub struct ReferencePoseBlend {
    pub mouth_index_a: usize,
    pub mouth_index_b: usize,
    pub mouth_blend: f32,
    pub eye_index: usize,
    pub eye_blend: f32,
    pub eye_half_index: usize,
    pub eye_half_weight: f32,
    pub eye_closed_index: usize,
    pub eye_closed_weight: f32,
    pub blink_amount: f32,
}

pub fn resolve_reference_pose_blend(
    motion: &PortraitMotionState,
    viseme: MouthViseme,
    mood: ExpressionMood,
    is_speaking: bool,
) -> ReferencePoseBlend {
    let open = clamp01(motion.mouth_open);
    let round_amt = clamp01(motion.mouth_round);
    let smile_amt = clamp01(motion.smile);
    let blink_amt = clamp01(motion.blink);

    let (mouth_index_a, mouth_index_b, mouth_blend) =
        if !is_speaking && open < 0.08 && motion.lip_press < 0.2 && motion.lip_bite < 0.2 {
            (0, 11, smoothstep(0.15, 0.85, smile_amt))
        } else if viseme == MouthViseme::Round || round_amt > 0.45 {
            if open < 0.48 {
                (9, 7, smoothstep(0.12, 0.48, open))
            } else {
                (7, 6, smoothstep(0.48, 0.88, open))
            }
        } else if viseme == MouthViseme::Fv || motion.lip_bite > 0.42 {
            (1, 9, clamp01(motion.lip_bite))
        } else if viseme == MouthViseme::Lth || motion.tongue_lift > 0.42 {
            (8, 2, 0.45)
        } else if viseme == MouthViseme::Ee || (motion.mouth_width > 1.15 && open > 0.24) {
            (2, 8, clamp01((open - 0.24) * 1.15))
        } else if motion.lip_press > 0.45 && open < 0.14 {
            (0, 9, clamp01(motion.lip_press * 0.65))
        } else if open < 0.12 {
            (if smile_amt > 0.45 { 11 } else { 0 }, 1, smoothstep(0.02, 0.12, open))
        } else if open < 0.34 {
            (1, 2, (open - 0.12) / 0.22)
        } else if open < 0.66 {
            (2, if mood == ExpressionMood::Thinking { 8 } else { 3 }, (open - 0.34) / 0.32)
        } else {
            (2, 3, clamp01((open - 0.56) / 0.36))
        };

    let eye_half_index = if open > 0.52 { 4 } else { 6 };
    let eye_closed_index = if smile_amt > 0.45 || mood == ExpressionMood::Happy { 10 } else { 5 };
    let focused_squint = if mood == ExpressionMood::Focused {
        clamp01((motion.squint - 0.36) * 2.2)
    } else {
        0.0
    };
    let eff_blink = blink_amt.max(focused_squint * 0.52);

    let eye_half_weight = if eff_blink <= 0.5 {
        smoothstep(0.06, 0.48, eff_blink)
    } else {
        1.0 - smoothstep(0.46, 0.86, eff_blink)
    };
    let eye_closed_weight = smoothstep(0.42, 0.88, eff_blink);

    let mut eye_index = mouth_index_b;
    let mut eye_blend = clamp01(eye_half_weight + eye_closed_weight);
    if eye_closed_weight >= eye_half_weight && eye_closed_weight > 0.04 {
        eye_index = eye_closed_index;
    } else if eye_half_weight > 0.04 {
        eye_index = eye_half_index;
    } else if is_speaking && open > 0.50 {
        eye_index = 3;
        eye_blend = smoothstep(0.50, 0.85, open) * 0.58;
    }

    ReferencePoseBlend {
        mouth_index_a,
        mouth_index_b,
        mouth_blend: clamp01(mouth_blend),
        eye_index,
        eye_blend: clamp01(eye_blend),
        eye_half_index,
        eye_half_weight: clamp01(eye_half_weight),
        eye_closed_index,
        eye_closed_weight: clamp01(eye_closed_weight),
        blink_amount: blink_amt,
    }
}

pub fn build_portrait_source_from_rgba(rgba: &[u8], width: usize, height: usize) -> PortraitSourceField {
    let total = width * height;
    let mut outside = vec![0u8; total];
    let mut queue = Vec::with_capacity(total / 4);

    let is_bright_bg = |idx: usize| -> bool {
        let off = idx * 4;
        rgba[off + 3] < 24 || (rgba[off] > 235 && rgba[off + 1] > 235 && rgba[off + 2] > 235)
    };

    let push_out = |x: usize, y: usize, outside: &mut [u8], queue: &mut Vec<usize>| {
        let idx = y * width + x;
        if outside[idx] == 0 && is_bright_bg(idx) {
            outside[idx] = 1;
            queue.push(idx);
        }
    };

    if width > 0 && height > 0 {
        for x in 0..width {
            push_out(x, 0, &mut outside, &mut queue);
            if x < width / 4 || x > (width * 3) / 4 {
                push_out(x, height - 1, &mut outside, &mut queue);
            }
        }
        for y in 0..height {
            push_out(0, y, &mut outside, &mut queue);
            push_out(width - 1, y, &mut outside, &mut queue);
        }
    }

    let mut head = 0usize;
    while head < queue.len() {
        let p = queue[head];
        head += 1;
        let x = p % width;
        let y = p / width;
        if x > 0 {
            push_out(x - 1, y, &mut outside, &mut queue);
        }
        if x + 1 < width {
            push_out(x + 1, y, &mut outside, &mut queue);
        }
        if y > 0 {
            push_out(x, y - 1, &mut outside, &mut queue);
        }
        if y + 1 < height {
            push_out(x, y + 1, &mut outside, &mut queue);
        }
    }

    let mut base_lum = vec![0.0_f32; total];
    let mut ink_mask = vec![0.0_f32; total];
    let mut min_x = width;
    let mut max_x = 0usize;
    let mut min_y = height;
    let mut max_y = 0usize;
    let mut any_active = false;

    for y in 0..height {
        let uy = y as f32 / (height.saturating_sub(1).max(1)) as f32;
        let bottom_fade = 1.0 - smoothstep(0.84, 0.99, uy);
        for x in 0..width {
            let ux = x as f32 / (width.saturating_sub(1).max(1)) as f32;
            let idx = y * width + x;
            if outside[idx] != 0 {
                continue;
            }
            let off = idx * 4;
            let alpha = rgba[off + 3] as f32 / 255.0;
            let r = rgba[off] as f32;
            let g = rgba[off + 1] as f32;
            let b = rgba[off + 2] as f32;
            let rgb_bright = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
            let ink = alpha * (1.0 - rgb_bright * 0.85);
            ink_mask[idx] = ink;

            let near_out = (x > 0 && outside[idx - 1] != 0)
                || (x + 1 < width && outside[idx + 1] != 0)
                || (y > 0 && outside[idx - width] != 0)
                || (y + 1 < height && outside[idx + width] != 0)
                || (x > 1 && outside[idx - 2] != 0)
                || (x + 2 < width && outside[idx + 2] != 0);

            let lum = if ink > 0.35 {
                let crown_sheen = (-((uy - 0.14) * 5.0).powi(2)).exp() * 0.14;
                let strand_wave = if ux > 0.48 && ux < 0.85 && uy > 0.25 && uy < 0.88 {
                    ((ux - uy * 0.22) * 34.0).sin().max(0.0) * 0.085 * (1.0 - smoothstep(0.75, 0.92, uy))
                } else {
                    0.0
                };
                let curl_sheen = if uy > 0.56 {
                    (-((ux - 0.72) * 4.5).powi(2)).exp() * 0.09
                } else {
                    0.0
                };
                let rim_glow = if near_out { 0.46 } else { 0.0 };
                clamp01((0.03 + crown_sheen + strand_wave + curl_sheen + rim_glow) * bottom_fade)
            } else if uy < 0.36 {
                let band_sheen = 0.85 + (-((ux - 0.52) * 4.0).powi(2)).exp() * 0.12;
                clamp01(band_sheen * bottom_fade)
            } else {
                let is_eye_zone = ux > 0.16 && ux < 0.45 && uy > 0.39 && uy < 0.475;
                let cheek_spec = (-((ux - 0.24) * 7.2).powi(2) - ((uy - 0.535) * 7.8).powi(2)).exp() * 0.12;
                let nose_spec = (-((ux - 0.21) * 15.0).powi(2) - ((uy - 0.495) * 8.5).powi(2)).exp() * 0.14;
                let cheek_shadow = smoothstep(0.285, 0.50, ux) * 0.36;
                let bang_shadow = (1.0 - smoothstep(0.35, 0.39, uy)) * 0.16;
                let chin_shadow = smoothstep(0.62, 0.87, uy) * 0.24;
                let eye_boost = if is_eye_zone { 0.15 } else { 0.0 };
                let face_lum = 0.62 + cheek_spec + nose_spec + eye_boost - cheek_shadow - bang_shadow - chin_shadow;
                clamp01(face_lum.min(0.86) * (1.0 - ink * 0.94) * bottom_fade)
            };

            base_lum[idx] = lum;
            if lum > 0.015 || ink > 0.015 {
                any_active = true;
                min_x = min_x.min(x);
                max_x = max_x.max(x);
                min_y = min_y.min(y);
                max_y = max_y.max(y);
            }
        }
    }

    let inv_w = 1.0 / width.saturating_sub(1).max(1) as f32;
    let inv_h = 1.0 / height.saturating_sub(1).max(1) as f32;
    let (min_ux, max_ux, min_uy, max_uy) = if any_active {
        (min_x as f32 * inv_w, max_x as f32 * inv_w, min_y as f32 * inv_h, max_y as f32 * inv_h)
    } else {
        (0.0, 1.0, 0.0, 1.0)
    };

    PortraitSourceField {
        width,
        height,
        base_lum,
        ink_mask,
        min_ux,
        max_ux,
        min_uy,
        max_uy,
    }
}

fn detect_axis_segments<F>(is_divider: F, total: usize, expected_count: usize) -> Vec<(usize, usize)>
where
    F: Fn(usize) -> bool,
{
    let mut dividers: Vec<(usize, usize)> = Vec::new();
    let mut in_div = false;
    let mut div_start = 0usize;
    let min_scan = (total as f32 * 0.08).floor() as usize;
    let max_scan = (total as f32 * 0.92).ceil() as usize;

    for p in min_scan..max_scan.min(total) {
        let hit = is_divider(p);
        if hit && !in_div {
            in_div = true;
            div_start = p;
        } else if !hit && in_div {
            in_div = false;
            dividers.push((div_start, p.saturating_sub(1)));
        }
    }

    if dividers.len() >= expected_count.saturating_sub(1) {
        let mut selected = Vec::new();
        for k in 1..expected_count {
            let target = (total * k) as f32 / expected_count as f32;
            let mut best = dividers[0];
            let mut best_dist = f32::INFINITY;
            for &d in &dividers {
                let mid = (d.0 + d.1) as f32 * 0.5;
                let dist = (mid - target).abs();
                if dist < best_dist {
                    best_dist = dist;
                    best = d;
                }
            }
            if best_dist < (total as f32 * 0.08) {
                selected.push(best);
            }
        }
        if selected.len() == expected_count - 1 {
            let mut segments = Vec::with_capacity(expected_count);
            let mut cur = 2usize;
            for (d0, d1) in selected {
                let end = d0.saturating_sub(2).max(cur + 8).min(total.saturating_sub(1));
                segments.push((cur, end));
                cur = (d1 + 2).min(total.saturating_sub(1));
            }
            let end = total.saturating_sub(3).max(cur + 8).min(total.saturating_sub(1));
            segments.push((cur, end));
            return segments;
        }
    }

    (0..expected_count)
        .map(|k| {
            let s = (total * k) / expected_count + 2;
            let e = ((total * (k + 1)) / expected_count).saturating_sub(2);
            (s, e.max(s + 8).min(total.saturating_sub(1)))
        })
        .collect()
}

pub fn build_portrait_bank_from_sprite_sheet(
    rgba: &[u8],
    width: usize,
    height: usize,
    target_size: usize,
) -> Vec<PortraitSourceField> {
    let lum_at = |x: usize, y: usize| -> f32 {
        let i = (y * width + x) * 4;
        (0.299 * rgba[i] as f32 + 0.587 * rgba[i + 1] as f32 + 0.114 * rgba[i + 2] as f32) / 255.0
    };

    let row_segments = detect_axis_segments(
        |y| {
            let mut dark = 0usize;
            let mut count = 0usize;
            let mut x = 0usize;
            while x < width {
                if lum_at(x, y) < 0.92 {
                    dark += 1;
                }
                count += 1;
                x += 2;
            }
            (dark as f32 / count.max(1) as f32) > 0.72
        },
        height,
        3,
    );

    let col_segments = detect_axis_segments(
        |x| {
            let mut dark = 0usize;
            let mut count = 0usize;
            let mut y = 0usize;
            while y < height {
                if lum_at(x, y) < 0.92 {
                    dark += 1;
                }
                count += 1;
                y += 2;
            }
            (dark as f32 / count.max(1) as f32) > 0.72
        },
        width,
        4,
    );

    let mut bank = Vec::with_capacity(12);
    for &(y0, y1) in &row_segments {
        for &(x0, x1) in &col_segments {
            let cw = x1.saturating_sub(x0) + 1;
            let ch = y1.saturating_sub(y0) + 1;
            let c_total = cw * ch;
            let mut cell_rgb = vec![255u8; c_total * 3];
            for ry in 0..ch {
                for rx in 0..cw {
                    let src_idx = ((y0 + ry) * width + (x0 + rx)) * 4;
                    let dst_idx = (ry * cw + rx) * 3;
                    let a = rgba[src_idx + 3] as f32 / 255.0;
                    cell_rgb[dst_idx] = (rgba[src_idx] as f32 * a + 255.0 * (1.0 - a)).round() as u8;
                    cell_rgb[dst_idx + 1] = (rgba[src_idx + 1] as f32 * a + 255.0 * (1.0 - a)).round() as u8;
                    cell_rgb[dst_idx + 2] = (rgba[src_idx + 2] as f32 * a + 255.0 * (1.0 - a)).round() as u8;
                }
            }

            // Strip panel numbers ("01".."12") in top-left corner
            let mut visited = vec![0u8; c_total];
            let mut queue = Vec::with_capacity(c_total / 8);
            let label_max_x = (cw as f32 * 0.24).floor() as usize;
            let label_max_y = (ch as f32 * 0.20).floor() as usize;
            let bound_max_x = (cw as f32 * 0.27).floor() as usize;
            let bound_max_y = (ch as f32 * 0.23).floor() as usize;

            let is_label_cand = |idx: usize, rgb: &[u8]| -> bool {
                rgb[idx * 3] <= 236 || rgb[idx * 3 + 1] <= 236 || rgb[idx * 3 + 2] <= 236
            };

            for sy in 0..label_max_y.min(ch) {
                for sx in 0..label_max_x.min(cw) {
                    let seed = sy * cw + sx;
                    if visited[seed] != 0 || !is_label_cand(seed, &cell_rgb) {
                        continue;
                    }
                    queue.clear();
                    visited[seed] = 1;
                    queue.push(seed);
                    let mut q_head = 0usize;
                    let mut comp_max_x = sx;
                    let mut comp_max_y = sy;
                    while q_head < queue.len() {
                        let p = queue[q_head];
                        q_head += 1;
                        let px = p % cw;
                        let py = p / cw;
                        comp_max_x = comp_max_x.max(px);
                        comp_max_y = comp_max_y.max(py);
                        let nbs = [
                            if px > 0 { Some(p - 1) } else { None },
                            if px + 1 < cw { Some(p + 1) } else { None },
                            if py > 0 { Some(p - cw) } else { None },
                            if py + 1 < ch { Some(p + cw) } else { None },
                        ];
                        for nb in nbs.into_iter().flatten() {
                            if visited[nb] == 0 && is_label_cand(nb, &cell_rgb) {
                                visited[nb] = 1;
                                queue.push(nb);
                            }
                        }
                    }
                    if comp_max_x < bound_max_x && comp_max_y < bound_max_y {
                        for &p in &queue {
                            let px = p % cw;
                            let py = p / cw;
                            for dy in -1_isize..=1 {
                                let ny = py as isize + dy;
                                if ny < 0 || ny >= ch as isize {
                                    continue;
                                }
                                for dx in -1_isize..=1 {
                                    let nx = px as isize + dx;
                                    if nx < 0 || nx >= cw as isize {
                                        continue;
                                    }
                                    let np = ny as usize * cw + nx as usize;
                                    cell_rgb[np * 3] = 255;
                                    cell_rgb[np * 3 + 1] = 255;
                                    cell_rgb[np * 3 + 2] = 255;
                                }
                            }
                        }
                    }
                }
            }

            // Exterior flood-fill
            let mut outside = vec![0u8; c_total];
            queue.clear();
            let push_out = |rx: usize, ry: usize, outside: &mut [u8], queue: &mut Vec<usize>, rgb: &[u8]| {
                let idx = ry * cw + rx;
                if outside[idx] == 0 && rgb[idx * 3] > 234 && rgb[idx * 3 + 1] > 234 && rgb[idx * 3 + 2] > 234 {
                    outside[idx] = 1;
                    queue.push(idx);
                }
            };
            for rx in 0..cw {
                push_out(rx, 0, &mut outside, &mut queue, &cell_rgb);
                if (rx as f32) < cw as f32 * 0.25 || (rx as f32) > cw as f32 * 0.74 {
                    push_out(rx, ch - 1, &mut outside, &mut queue, &cell_rgb);
                }
            }
            for ry in 0..ch {
                push_out(0, ry, &mut outside, &mut queue, &cell_rgb);
                push_out(cw - 1, ry, &mut outside, &mut queue, &cell_rgb);
            }
            let mut o_head = 0usize;
            while o_head < queue.len() {
                let p = queue[o_head];
                o_head += 1;
                let px = p % cw;
                let py = p / cw;
                if px > 0 {
                    push_out(px - 1, py, &mut outside, &mut queue, &cell_rgb);
                }
                if px + 1 < cw {
                    push_out(px + 1, py, &mut outside, &mut queue, &cell_rgb);
                }
                if py > 0 {
                    push_out(px, py - 1, &mut outside, &mut queue, &cell_rgb);
                }
                if py + 1 < ch {
                    push_out(px, py + 1, &mut outside, &mut queue, &cell_rgb);
                }
            }

            // Anchor crown Y & upper-hair X centroid
            let mut crown_y = (ch as f32 * 0.06).floor() as usize;
            let mut found_crown = false;
            let mut sum_x = 0.0_f32;
            let mut cnt_x = 0usize;
            for ry in 0..ch {
                for rx in 0..cw {
                    let idx = ry * cw + rx;
                    let avg = (cell_rgb[idx * 3] as u32 + cell_rgb[idx * 3 + 1] as u32 + cell_rgb[idx * 3 + 2] as u32) / 3;
                    if outside[idx] == 0 && avg < 195 {
                        if !found_crown && (rx as f32) > cw as f32 * 0.22 && (rx as f32) < cw as f32 * 0.78 {
                            crown_y = ry;
                            found_crown = true;
                        }
                        if (ry as f32) >= ch as f32 * 0.10 && (ry as f32) <= ch as f32 * 0.48 {
                            sum_x += rx as f32;
                            cnt_x += 1;
                        }
                    }
                }
            }

            let anchor_cx = if cnt_x > 0 { sum_x / cnt_x as f32 } else { cw as f32 * 0.5 };
            let anchor_crown_y = if found_crown { crown_y as f32 } else { ch as f32 * 0.06 };
            let mut aligned = vec![0u8; target_size * target_size * 4];
            let scale = cw.min(ch) as f32 * 0.94;
            let dst_cx = target_size as f32 * 0.505;
            let dst_crown_y = target_size as f32 * 0.055;

            for ty in 0..target_size {
                let src_y = anchor_crown_y + ((ty as f32 - dst_crown_y) / target_size as f32) * scale;
                for tx in 0..target_size {
                    let src_x = anchor_cx + ((tx as f32 - dst_cx) / target_size as f32) * scale;
                    let out_idx = (ty * target_size + tx) * 4;
                    if src_x < 0.0 || src_x >= (cw - 1) as f32 || src_y < 0.0 || src_y >= (ch - 1) as f32 {
                        continue;
                    }
                    let sx = src_x.round() as usize;
                    let sy = src_y.round() as usize;
                    let s_idx = sy * cw + sx;
                    if outside[s_idx] != 0 {
                        continue;
                    }
                    aligned[out_idx] = cell_rgb[s_idx * 3];
                    aligned[out_idx + 1] = cell_rgb[s_idx * 3 + 1];
                    aligned[out_idx + 2] = cell_rgb[s_idx * 3 + 2];
                    aligned[out_idx + 3] = 255;
                }
            }
            bank.push(build_portrait_source_from_rgba(&aligned, target_size, target_size));
        }
    }
    bank
}

pub struct PortraitAssets {
    pub reference: PortraitSourceField,
    pub sprite_bank: Vec<PortraitSourceField>,
}

static PORTRAIT_ASSETS: OnceLock<PortraitAssets> = OnceLock::new();

pub fn portrait_assets() -> &'static PortraitAssets {
    PORTRAIT_ASSETS.get_or_init(|| {
        let base_bytes = include_bytes!("../../../assets/character/portrait_base.png");
        let sheet_bytes = include_bytes!("../../../assets/character/sprite_sheet.png");

        let base_img = image::load_from_memory_with_format(base_bytes, ImageFormat::Png)
            .expect("embedded portrait_base.png must decode")
            .to_rgba8();
        let reference = build_portrait_source_from_rgba(
            base_img.as_raw(),
            base_img.width() as usize,
            base_img.height() as usize,
        );

        let sheet_img = image::load_from_memory_with_format(sheet_bytes, ImageFormat::Png)
            .expect("embedded sprite_sheet.png must decode")
            .to_rgba8();
        let sprite_bank = build_portrait_bank_from_sprite_sheet(
            sheet_img.as_raw(),
            sheet_img.width() as usize,
            sheet_img.height() as usize,
            160,
        );

        PortraitAssets { reference, sprite_bank }
    })
}

pub struct FrameConstants<'a> {
    pub time: f32,
    pub energy: f32,
    pub is_speaking: bool,
    pub is_listening: bool,
    pub has_turn: bool,
    pub has_waveform: bool,
    pub motion: &'a PortraitMotionState,
    pub ct: f32,
    pub st: f32,
    pub glint_sweep: f32,
    pub sin_t38: f32,
    pub cos_t38: f32,
    pub sin_t24: f32,
    pub cos_t24: f32,
    pub sin_t45: f32,
    pub cos_t45: f32,
    pub wave_gain: f32,
    pub wave_amp: f32,
}

impl<'a> FrameConstants<'a> {
    pub fn new(
        time: f32,
        energy: f32,
        is_speaking: bool,
        is_listening: bool,
        motion: &'a PortraitMotionState,
    ) -> Self {
        let has_turn = motion.head_yaw.abs() > 0.004 || motion.head_pitch.abs() > 0.004;
        Self {
            time,
            energy: energy.clamp(0.0, 1.0),
            is_speaking,
            is_listening,
            has_turn,
            has_waveform: (is_speaking || is_listening) && energy > 0.14,
            motion,
            ct: motion.head_tilt.cos(),
            st: motion.head_tilt.sin(),
            glint_sweep: (time * 0.46) % 1.15,
            sin_t38: (time * 3.8).sin(),
            cos_t38: (time * 3.8).cos(),
            sin_t24: (time * 2.4).sin(),
            cos_t24: (time * 2.4).cos(),
            sin_t45: (time * 4.5).sin(),
            cos_t45: (time * 4.5).cos(),
            wave_gain: clamp01(energy * 1.15),
            wave_amp: 0.012 + energy * 0.014,
        }
    }
}

pub fn sample_waveform_halo(ax: f32, ay: f32, fc: &FrameConstants<'_>) -> f32 {
    let adx = ax - 0.47;
    let ady = (ay - 0.43) * 0.92;
    let adist_sq = adx * adx + ady * ady;
    if adist_sq <= 0.172_225 || adist_sq >= 0.245_025 {
        return 0.0;
    }
    let adist = adist_sq.sqrt();
    let inv_r = 1.0 / adist;
    let u = adx * inv_r;
    let v = ady * inv_r;
    let u2 = u * u - v * v;
    let v2 = 2.0 * u * v;
    let u3 = u * (4.0 * u * u - 3.0);
    let v3 = v * (3.0 - 4.0 * v * v);
    let u4 = u2 * u2 - v2 * v2;
    let v4 = 2.0 * v2 * u2;
    let u5 = u2 * u3 - v2 * v3;
    let v5 = v2 * u3 + u2 * v3;
    let wave_r = 0.445
        + (v5 * fc.cos_t38 + u5 * fc.sin_t38) * fc.wave_amp
        + (u3 * fc.cos_t24 + v3 * fc.sin_t24) * 0.008;
    let ring_band = (adist - wave_r).abs();
    if ring_band >= 0.014 {
        return 0.0;
    }
    let arc_pulse = 0.5 + 0.5 * (v4 * fc.cos_t45 - u4 * fc.sin_t45);
    let side_weight = 0.35 + 0.65 * u.abs();
    let env = (1.0 - smoothstep(0.002, 0.014, ring_band))
        * side_weight
        * (0.28 + arc_pulse * 0.48)
        * fc.wave_gain;
    let fade = if ay > 0.74 { 1.0 - smoothstep(0.74, 0.86, ay) } else { 1.0 };
    clamp01(env * fade)
}

#[inline]
fn bilinear(arr: &[f32], i00: usize, i10: usize, i01: usize, i11: usize, w00: f32, w10: f32, w01: f32, w11: f32) -> f32 {
    arr[i00] * w00 + arr[i10] * w10 + arr[i01] * w01 + arr[i11] * w11
}

pub fn sample_sprite_bank_with_expression(
    ux: f32,
    uy: f32,
    fc: &FrameConstants<'_>,
    bank: &[PortraitSourceField],
    pose: &ReferencePoseBlend,
) -> f32 {
    let motion = fc.motion;
    let framed_x = (ux - 0.50) * 1.075 + 0.50;
    let framed_y = (uy - 0.54) * 1.085 + 0.51;
    if framed_x < 0.01 || framed_x > 0.99 || framed_y < 0.005 || framed_y > 0.995 {
        return 0.0;
    }

    let head_mask = 1.0 - smoothstep(0.68, 0.88, framed_y);
    let hx = framed_x - 0.44;
    let hy = framed_y - 0.46;

    let mut z_depth = 0.0_f32;
    let mut face_zone = 0.0_f32;
    if fc.has_turn && head_mask > 0.004 && framed_x > 0.05 && framed_x < 0.92 && framed_y > 0.02 {
        let d_face_x = (hx + 0.12) / 0.26;
        let d_face_y = (hy - 0.02) / 0.29;
        let face_sq = d_face_x * d_face_x + d_face_y * d_face_y;
        let face_dome = if face_sq < 4.5 { (-face_sq).exp() } else { 0.0 };
        let nose_dome = if framed_x < 0.48 && framed_y > 0.25 {
            let ndx = (framed_x - 0.26) / 0.09;
            let ndy = (framed_y - 0.52) / 0.14;
            let n_sq = ndx * ndx + ndy * ndy;
            if n_sq < 8.0 { (-n_sq).exp() } else { 0.0 }
        } else {
            0.0
        };
        let crown_dome = if framed_y < 0.55 {
            let cdx = (framed_x - 0.40) / 0.22;
            let cdy = (framed_y - 0.22) / 0.16;
            let c_sq = cdx * cdx + cdy * cdy;
            if c_sq < 8.0 { (-c_sq).exp() } else { 0.0 }
        } else {
            0.0
        };
        let back_hair = smoothstep(0.06, 0.40, hx) * (1.0 - smoothstep(0.64, 0.90, framed_y));
        z_depth = (face_dome * 1.05 + nose_dome * 0.48 + crown_dome * 0.38 - back_hair * 0.78) * head_mask;
        face_zone = face_dome * head_mask;
    }

    let yaw_px = -motion.head_yaw * (0.095 * z_depth + 0.014 * head_mask);
    let pitch_py = -motion.head_pitch * (0.085 * z_depth + 0.012 * head_mask);
    let foreshorten_x = -hx * motion.head_yaw * 0.14 * face_zone
        + if motion.head_yaw > 0.0 {
            -0.014 * motion.head_yaw * face_zone
        } else {
            0.0
        };

    let lower_factor = smoothstep(0.45, 0.90, framed_y);
    let bang_factor = (1.0 - smoothstep(0.28, 0.42, framed_y)) * smoothstep(0.10, 0.32, framed_x);
    let shoulder_factor = smoothstep(0.70, 0.94, framed_y);

    let local_sway_x = motion.head_sway_x + motion.hair_lag_x * lower_factor + motion.hair_lag_x * 0.38 * bang_factor;
    let local_nod_y = lerp(motion.head_nod_y, motion.shoulder_y, shoulder_factor) + motion.hair_lag_y * lower_factor;

    let pivot_x = 0.42;
    let pivot_y = 0.74;
    let dx = framed_x + yaw_px + foreshorten_x - pivot_x - local_sway_x;
    let dy = framed_y + pitch_py - pivot_y - local_nod_y;

    let ax = pivot_x + dx * fc.ct - dy * fc.st;
    let ay = pivot_y + dx * fc.st + dy * fc.ct;
    if !(0.0..=1.0).contains(&ax) || !(0.0..=1.0).contains(&ay) {
        return 0.0;
    }

    let field_a = &bank[pose.mouth_index_a.min(bank.len() - 1)];
    let field_b = &bank[pose.mouth_index_b.min(bank.len() - 1)];
    let w = field_a.width;
    let max_x = w - 1;
    let max_y = field_a.height - 1;
    let fx = ax * max_x as f32;
    let fy = ay * max_y as f32;
    let x0 = (fx as usize).min(max_x);
    let y0 = (fy as usize).min(max_y);
    let x1 = (x0 + 1).min(max_x);
    let y1 = (y0 + 1).min(max_y);
    let tx = fx - x0 as f32;
    let ty = fy - y0 as f32;

    let w00 = (1.0 - tx) * (1.0 - ty);
    let w10 = tx * (1.0 - ty);
    let w01 = (1.0 - tx) * ty;
    let w11 = tx * ty;
    let i00 = y0 * w + x0;
    let i10 = y0 * w + x1;
    let i01 = y1 * w + x0;
    let i11 = y1 * w + x1;

    let lum_a = bilinear(&field_a.base_lum, i00, i10, i01, i11, w00, w10, w01, w11);
    let lum_b = bilinear(&field_b.base_lum, i00, i10, i01, i11, w00, w10, w01, w11);
    let ink_a = bilinear(&field_a.ink_mask, i00, i10, i01, i11, w00, w10, w01, w11);
    let ink_b = bilinear(&field_b.ink_mask, i00, i10, i01, i11, w00, w10, w01, w11);

    let blend_t = smoothstep(0.06, 0.94, pose.mouth_blend);
    let mut lum = lerp(lum_a, lum_b, blend_t);
    let ink = lerp(ink_a, ink_b, blend_t);

    if pose.mouth_index_a != pose.mouth_index_b
        && (0.04..0.96).contains(&blend_t)
        && (0.22..=0.44).contains(&ax)
        && (0.56..=0.71).contains(&ay)
        && (ink_a > 0.55 || ink_b > 0.55)
    {
        lum = lerp(lum, lum_a.min(lum_b), 0.35);
    }

    if (pose.eye_blend > 0.015 || pose.blink_amount > 0.04)
        && (0.16..=0.53).contains(&ax)
        && (0.38..=0.575).contains(&ay)
    {
        let ex_mask = smoothstep(0.165, 0.198, ax) * (1.0 - smoothstep(0.475, 0.525, ax));
        let ey_mask = smoothstep(0.38, 0.415, ay) * (1.0 - smoothstep(0.545, 0.575, ay));
        let socket_mask = ex_mask * ey_mask;
        if socket_mask > 0.01 {
            let mut target_eye_lum = lum;
            if pose.eye_half_weight > 0.01 || pose.eye_closed_weight > 0.01 {
                let half_field = &bank[pose.eye_half_index.min(bank.len() - 1)];
                let closed_field = &bank[pose.eye_closed_index.min(bank.len() - 1)];
                let half_lum = bilinear(&half_field.base_lum, i00, i10, i01, i11, w00, w10, w01, w11);
                let closed_lum = bilinear(&closed_field.base_lum, i00, i10, i01, i11, w00, w10, w01, w11);
                let total_bw = clamp01(pose.eye_half_weight + pose.eye_closed_weight);
                let stage_mix = if total_bw > 0.001 {
                    lerp(half_lum, closed_lum, pose.eye_closed_weight / total_bw)
                } else {
                    lum
                };
                target_eye_lum = lerp(lum, stage_mix, total_bw);
                if pose.eye_closed_weight > 0.35 {
                    let closed_ink = bilinear(&closed_field.ink_mask, i00, i10, i01, i11, w00, w10, w01, w11);
                    if closed_ink > 0.48 {
                        target_eye_lum = lerp(target_eye_lum, target_eye_lum.min(closed_lum), pose.eye_closed_weight * 0.55);
                    }
                } else if pose.eye_half_weight > 0.35 {
                    let half_ink = bilinear(&half_field.ink_mask, i00, i10, i01, i11, w00, w10, w01, w11);
                    if half_ink > 0.48 {
                        target_eye_lum = lerp(target_eye_lum, target_eye_lum.min(half_lum), pose.eye_half_weight * 0.45);
                    }
                }
            } else if pose.eye_blend > 0.01 {
                let eye_field = &bank[pose.eye_index.min(bank.len() - 1)];
                let el = bilinear(&eye_field.base_lum, i00, i10, i01, i11, w00, w10, w01, w11);
                target_eye_lum = lerp(lum, el, pose.eye_blend);
            }
            lum = lerp(lum, target_eye_lum, socket_mask);
        }
    }

    if ink < 0.35
        && face_zone > 0.1
        && motion.head_yaw.abs() > 0.02
        && (0.36..=0.76).contains(&ay)
        && (0.18..=0.52).contains(&ax)
    {
        let cheek = smoothstep(0.19, 0.48, ax) * smoothstep(0.38, 0.65, ay) * (1.0 - smoothstep(0.65, 0.76, ay));
        lum = clamp01(lum + motion.head_yaw * 0.18 * cheek);
    }

    let aura = motion.listen_pulse;
    if aura > 0.06 && ink < 0.35 && ay < 0.28 && lum > 0.4 {
        let gx = (ax - fc.glint_sweep) * 7.5;
        let g_sq = gx * gx;
        if g_sq < 8.0 {
            lum = clamp01(lum + (-g_sq).exp() * aura * (0.15 + fc.energy * 0.16));
        }
    }

    let bottom_feather = 1.0 - smoothstep(0.83, 0.98, ay);
    let right_feather = 1.0 - smoothstep(0.86, 0.985, ax);
    let left_feather = smoothstep(0.015, 0.085, ax);
    lum *= bottom_feather * right_feather * left_feather;

    if fc.has_waveform && lum < 0.04 && ay < 0.86 {
        let wf = sample_waveform_halo(ax, ay, fc);
        if wf > lum {
            lum = wf;
        }
    }

    clamp01(lum)
}

pub fn sample_portrait_luminance_field(
    cols: usize,
    rows: usize,
    time: f32,
    mood: ExpressionMood,
    viseme: MouthViseme,
    energy: f32,
    is_speaking: bool,
    is_listening: bool,
    motion: &PortraitMotionState,
    assets: &PortraitAssets,
) -> Vec<f32> {
    let sub_w = cols * 2;
    let sub_h = rows * 4;
    let mut raw = vec![0.0_f32; sub_w * sub_h];
    let fc = FrameConstants::new(time, energy, is_speaking, is_listening, motion);
    let inv_sub_w = 1.0 / sub_w.max(1) as f32;
    let inv_sub_h = 1.0 / sub_h.max(1) as f32;

    if assets.sprite_bank.len() >= 12 {
        let pose = resolve_reference_pose_blend(motion, viseme, mood, is_speaking);
        let bounds = &assets.sprite_bank[0];
        let x_min_framed = if fc.has_waveform { 0.0 } else { (bounds.min_ux - 0.11).max(0.01) };
        let x_max_framed = if fc.has_waveform { 0.99 } else { (bounds.max_ux + 0.11).min(0.99) };
        let sx_start = (((x_min_framed - 0.50) / 1.075 + 0.50) * sub_w as f32 - 1.0)
            .floor()
            .max(0.0) as usize;
        let sx_end = (((x_max_framed - 0.50) / 1.075 + 0.50) * sub_w as f32 + 1.0)
            .ceil()
            .min(sub_w as f32) as usize;

        for sy in 0..sub_h {
            let uy = (sy as f32 + 0.5) * inv_sub_h;
            let framed_y = (uy - 0.54) * 1.085 + 0.51;
            if !(0.005..=0.995).contains(&framed_y) {
                continue;
            }
            let row_off = sy * sub_w;
            for sx in sx_start..sx_end {
                let ux = (sx as f32 + 0.5) * inv_sub_w;
                raw[row_off + sx] = sample_sprite_bank_with_expression(ux, uy, &fc, &assets.sprite_bank, &pose);
            }
        }
    } else {
        // Bilinear fallback to single reference field
        let src = &assets.reference;
        for sy in 0..sub_h {
            let uy = (sy as f32 + 0.5) * inv_sub_h;
            let row_off = sy * sub_w;
            for sx in 0..sub_w {
                let ux = (sx as f32 + 0.5) * inv_sub_w;
                let ix = ((ux * (src.width - 1) as f32).round() as usize).min(src.width - 1);
                let iy = ((uy * (src.height - 1) as f32).round() as usize).min(src.height - 1);
                raw[row_off + sx] = src.base_lum[iy * src.width + ix];
            }
        }
    }

    raw
}

#[inline]
pub(crate) fn clamp01(v: f32) -> f32 {
    v.clamp(0.0, 1.0)
}

#[inline]
pub(crate) fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

#[inline]
pub(crate) fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let span = edge1 - edge0;
    let t = if span.abs() < 1e-6 { 0.0 } else { clamp01((x - edge0) / span) };
    t * t * (3.0 - 2.0 * t)
}

#[inline]
pub(crate) fn exp_approach(current: f32, target: f32, rate: f32, dt: f32) -> f32 {
    let factor = 1.0 - (-rate * dt.max(0.001)).exp();
    current + (target - current) * factor
}
