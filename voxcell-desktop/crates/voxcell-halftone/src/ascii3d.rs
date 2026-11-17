use crate::raster::parse_hex_rgb;
use std::f32::consts::PI;
use voxcell_core::{AsciiShaderMode, ExpressionMood, EyeState, MouthViseme, PhosphorTheme};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AsciiMaterial {
    Bg,
    Grid,
    Ring,
    Body,
    Hair,
    Wing,
    Eye,
    Mouth,
    Visor,
    Pillar,
    Orb,
    Pulse,
}

#[derive(Clone, Debug)]
pub struct AsciiCell {
    pub ch: char,
    pub intensity: f32,
    pub material: AsciiMaterial,
    pub is_edge: bool,
    pub rgb: Option<[u8; 3]>,
}

#[derive(Clone, Debug)]
pub struct Ascii3DFrame {
    pub cols: usize,
    pub rows: usize,
    pub cells: Vec<AsciiCell>,
}

#[derive(Clone, Debug)]
pub struct Ascii3DParams {
    pub cols: usize,
    pub rows: usize,
    pub time: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub zoom: f32,
    pub mood: ExpressionMood,
    pub viseme: MouthViseme,
    pub eye_state: EyeState,
    pub energy: f32,
    pub is_speaking: bool,
    pub is_listening: bool,
    pub shader_mode: AsciiShaderMode,
    pub bands: [f32; 12],
}

const CLEAN_RAMP: &[char] = &[
    ' ', '.', '\'', '`', '^', ',', ':', ';', '~', '-', '+', '*', 'o', 'O', '0', '#', '%', '@',
];
const HOLO_RAMP: &[char] = &[' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'];
const DEPTH_RAMP: &[char] = &[' ', '.', ':', '+', '*', '#', '%', '@'];

const BAYER_4X4: [f32; 16] = [
    -0.46875, 0.03125, -0.34375, 0.15625,
    0.28125, -0.21875, 0.40625, -0.09375,
    -0.28125, 0.21875, -0.40625, 0.09375,
    0.46875, -0.03125, 0.34375, -0.15625,
];

#[inline]
fn smin(a: f32, b: f32, k: f32) -> f32 {
    let h = (0.5 + 0.5 * (b - a) / k).clamp(0.0, 1.0);
    b * (1.0 - h) + a * h - k * h * (1.0 - h)
}

#[inline]
fn sd_ellipsoid(x: f32, y: f32, z: f32, rx: f32, ry: f32, rz: f32) -> f32 {
    let x0 = x / rx;
    let y0 = y / ry;
    let z0 = z / rz;
    let k0 = (x0 * x0 + y0 * y0 + z0 * z0).sqrt();
    if k0 < 1e-6 {
        return -rx.min(ry).min(rz);
    }
    let x1 = x0 / rx;
    let y1 = y0 / ry;
    let z1 = z0 / rz;
    let k1 = (x1 * x1 + y1 * y1 + z1 * z1).sqrt().max(1e-6);
    k0 * (k0 - 1.0) / k1
}

#[inline]
fn sd_box(x: f32, y: f32, z: f32, bx: f32, by: f32, bz: f32) -> f32 {
    let qx = x.abs() - bx;
    let qy = y.abs() - by;
    let qz = z.abs() - bz;
    let out = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2) + qz.max(0.0).powi(2)).sqrt();
    out + qx.max(qy.max(qz)).min(0.0)
}

#[inline]
fn sd_capsule(px: f32, py: f32, pz: f32, ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32, r: f32) -> f32 {
    let pax = px - ax;
    let pay = py - ay;
    let paz = pz - az;
    let bax = bx - ax;
    let bay = by - ay;
    let baz = bz - az;
    let denom = (bax * bax + bay * bay + baz * baz).max(1e-6);
    let h = ((pax * bax + pay * bay + paz * baz) / denom).clamp(0.0, 1.0);
    let dx = pax - bax * h;
    let dy = pay - bay * h;
    let dz = paz - baz * h;
    (dx * dx + dy * dy + dz * dz).sqrt() - r
}

#[inline]
fn sd_torus(x: f32, y: f32, z: f32, major_r: f32, minor_r: f32) -> f32 {
    let qx = (x * x + z * z).sqrt() - major_r;
    (qx * qx + y * y).sqrt() - minor_r
}

#[inline]
fn sd_octahedron(x: f32, y: f32, z: f32, s: f32) -> f32 {
    (x.abs() + y.abs() + z.abs() - s) * 0.577_350_27
}

struct FramePrecompute {
    time: f32,
    breath_y: f32,
    c_tilt: f32,
    s_tilt: f32,
    c_yaw: f32,
    s_yaw: f32,
    c_talk_x: f32,
    s_talk_x: f32,
    mouth_rx: f32,
    mouth_ry: f32,
    mouth_open: bool,
    is_smile: bool,
    viseme: MouthViseme,
    eye_scale_y: f32,
    eye_gaze_x: f32,
    c_brow: f32,
    s_brow: f32,
    c_wing: f32,
    s_wing: f32,
    c_r1y: f32,
    s_r1y: f32,
    c_r2y: f32,
    s_r2y: f32,
    orb1: [f32; 3],
    orb2: [f32; 3],
    c_orb_spin: f32,
    s_orb_spin: f32,
    pulse_radius: f32,
    pulse_active: bool,
    is_speaking: bool,
    energy: f32,
    pillar_h: [f32; 3],
}

impl FramePrecompute {
    fn new(p: &Ascii3DParams) -> Self {
        let e = p.energy.clamp(0.0, 1.0);
        let boost = e * 0.048;
        let (mouth_rx, mouth_ry) = match p.viseme {
            MouthViseme::Closed => (0.145, 0.020),
            MouthViseme::Rest => (0.150, 0.032),
            MouthViseme::Mbp => (0.165, 0.016),
            MouthViseme::Fv => (0.160, 0.048 + boost * 0.4),
            MouthViseme::Lth => (0.170, 0.085 + boost * 0.7),
            MouthViseme::Smile => (0.195, 0.028),
            MouthViseme::Small => (0.135, 0.062 + boost),
            MouthViseme::Mid => (0.165, 0.102 + boost),
            MouthViseme::Round => (0.112, 0.125 + boost),
            MouthViseme::Ee => (0.235, 0.095 + boost * 0.75),
            MouthViseme::Wide => (0.210, 0.148 + boost),
        };
        let talk_tilt = if p.is_speaking { (p.time * 6.5).sin() * (0.04 + e * 0.05) } else { 0.0 };
        let mood_tilt = match p.mood {
            ExpressionMood::Thinking => 0.14,
            ExpressionMood::Happy => -0.05,
            _ => 0.0,
        };
        let tilt = mood_tilt + talk_tilt * 0.5;
        let talk_x = if p.is_speaking { (p.time * 9.0).sin() * 0.03 * e } else { 0.0 };
        let head_yaw = match p.mood {
            ExpressionMood::Thinking => -0.18,
            ExpressionMood::Listening => 0.12,
            _ => 0.0,
        } + (p.time * 0.78).sin() * 0.11
            + if p.is_speaking { (p.time * 1.65).sin() * 0.08 } else { 0.0 };
        let brow_tilt: f32 = match p.mood {
            ExpressionMood::Alert | ExpressionMood::Focused => -0.25,
            ExpressionMood::Happy => 0.19,
            _ => 0.0,
        };
        let wing_flap = 0.34 + (p.time * if p.is_speaking { 5.4 } else { 2.3 }).sin() * (0.065 + e * 0.09);
        let ring_speed = if p.is_speaking || p.is_listening { 1.85 } else { 0.72 };

        let a1 = p.time * 1.45;
        let a2 = a1 + PI;
        let r_orb = 1.42;
        let ox1 = a1.cos() * r_orb;
        let oz1 = a1.sin() * r_orb;
        let ox2 = a2.cos() * r_orb;
        let oz2 = a2.sin() * r_orb;

        let b0 = p.bands[1].max(e * 0.7);
        let b1 = p.bands[4].max(e * 0.9);
        let b2 = p.bands[7].max(e * 0.6);

        Self {
            time: p.time,
            breath_y: (p.time * 2.1).sin() * 0.025,
            c_tilt: tilt.cos(),
            s_tilt: tilt.sin(),
            c_yaw: head_yaw.cos(),
            s_yaw: head_yaw.sin(),
            c_talk_x: talk_x.cos(),
            s_talk_x: talk_x.sin(),
            mouth_rx,
            mouth_ry,
            mouth_open: !matches!(p.viseme, MouthViseme::Closed | MouthViseme::Smile | MouthViseme::Mbp),
            is_smile: p.viseme == MouthViseme::Smile,
            viseme: p.viseme,
            eye_scale_y: match p.eye_state {
                EyeState::Blink => 0.02,
                EyeState::Half => 0.065,
                EyeState::Wide => 0.135,
                EyeState::Open => 0.105,
            },
            eye_gaze_x: if p.mood == ExpressionMood::Thinking { (p.time * 2.2).sin() * 0.035 } else { 0.0 },
            c_brow: brow_tilt.cos(),
            s_brow: brow_tilt.sin(),
            c_wing: wing_flap.cos(),
            s_wing: wing_flap.sin(),
            c_r1y: (p.time * ring_speed).cos(),
            s_r1y: (p.time * ring_speed).sin(),
            c_r2y: (-p.time * ring_speed * 0.75).cos(),
            s_r2y: (-p.time * ring_speed * 0.75).sin(),
            orb1: [ox1, 0.58 + oz1 * 0.34, oz1 * 0.94],
            orb2: [ox2, 0.58 + oz2 * 0.34, oz2 * 0.94],
            c_orb_spin: (p.time * 2.8).cos(),
            s_orb_spin: (p.time * 2.8).sin(),
            pulse_radius: 0.78 + ((p.time * 1.35) % 1.0) * 0.95,
            pulse_active: p.is_speaking || p.is_listening,
            is_speaking: p.is_speaking,
            energy: e,
            pillar_h: [0.22 + b0 * 0.58, 0.30 + b1 * 0.68, 0.18 + b2 * 0.52],
        }
    }
}

fn eval_sdf(wx: f32, wy: f32, wz: f32, fc: &FramePrecompute, exact: bool) -> (f32, AsciiMaterial) {
    let y0 = wy - fc.breath_y;
    let px = wx * fc.c_tilt - y0 * fc.s_tilt;
    let py1 = wx * fc.s_tilt + y0 * fc.c_tilt;
    let py = py1 * fc.c_talk_x - wz * fc.s_talk_x;
    let pz = py1 * fc.s_talk_x + wz * fc.c_talk_x;
    let ax = px.abs();
    let awx = wx.abs();
    let awy = wy.abs();
    let awz = wz.abs();

    let b_head = (ax + (py - 0.1).abs() + (pz - 0.04).abs()) * 0.577_350_26 - 0.96;
    let b_torso = (ax + (py + 0.85).abs() + (pz + 0.02).abs()) * 0.577_350_26 - 1.12;
    let b_wing = if py < -0.55 || ax < 0.10 {
        99.0
    } else {
        ((ax - 0.92).abs() + (py - 0.32).abs() + (pz + 0.04).abs()) * 0.577_350_26 - 0.78
    };
    let r = (wx * wx + wy * wy + wz * wz).sqrt();
    let b_rings = (r - 1.52).abs() - 0.36;
    let b_pillars = if wy > -0.10 || awx < 0.78 {
        99.0
    } else {
        ((awx - 1.56).abs() + (wy + 0.98).abs() + (wz + 0.68).abs()) * 0.577_350_26 - 0.75
    };
    let _ = awy + awz;

    let min_bound = b_head.min(b_torso).min(b_wing).min(b_rings).min(b_pillars);
    if !exact && min_bound > 0.20 {
        return (min_bound, AsciiMaterial::Bg);
    }

    let mut min_d = 99.0_f32;
    let mut mat = AsciiMaterial::Bg;

    if b_head < min_d {
        let hpx = px * fc.c_yaw + pz * fc.s_yaw;
        let hpz = -px * fc.s_yaw + pz * fc.c_yaw;
        let hax = hpx.abs();

        let cranium = sd_ellipsoid(hpx, py - 0.13, hpz, 0.61, 0.68, 0.58);
        let chin = if py < 0.38 { sd_ellipsoid(hpx, py + 0.26, hpz - 0.09, 0.39, 0.43, 0.45) } else { 99.0 };
        let mut head_dist = smin(cranium, chin, 0.22);
        if hpz > 0.24 && hax < 0.32 && (-0.35..0.32).contains(&py) {
            let nose = sd_capsule(hpx, py, hpz, 0.0, 0.07, 0.54, 0.0, -0.09, 0.62, 0.048);
            head_dist = smin(head_dist, nose, 0.05);
        }
        if hpz > 0.40 && hax < 0.42 && (-0.10..0.26).contains(&py) {
            let socket = sd_ellipsoid(hax - 0.22, py - 0.08, hpz - 0.56, 0.135, 0.125, 0.08);
            if socket < 0.0 {
                head_dist = head_dist.max(-socket * 0.65);
            }
        }
        if hpz > 0.26 && hax < 0.34 && (-0.48..-0.02).contains(&py) {
            let smile_bend = if fc.is_smile { hpx * hpx * 0.42 } else { 0.0 };
            let cavity = sd_ellipsoid(hpx, py + 0.27 - smile_bend, hpz - 0.49, fc.mouth_rx, fc.mouth_ry, 0.16);
            if cavity < 0.0 {
                head_dist = head_dist.max(-cavity);
            }
        }
        if head_dist < min_d {
            min_d = head_dist;
            mat = AsciiMaterial::Body;
        }
        if fc.mouth_open && hpz > 0.10 && hax < 0.42 && (-0.58..0.08).contains(&py) {
            let vocal = sd_ellipsoid(hpx, py + 0.27, hpz - 0.43, fc.mouth_rx * 0.76, fc.mouth_ry * 0.78, 0.09);
            if vocal < min_d {
                min_d = vocal;
                mat = AsciiMaterial::Mouth;
            }
        }

        let mut hair_shell = sd_ellipsoid(hpx, py - 0.16, hpz + 0.14, 0.71, 0.77, 0.64);
        if hpz > -0.20 {
            let face_win = sd_ellipsoid(hpx, py + 0.01, hpz - 0.36, 0.52, 0.56, 0.48);
            hair_shell = hair_shell.max(-face_win);
        }
        let bang_l = if hpx < 0.06 && hpz > 0.04 && py > -0.45 {
            sd_capsule(hpx, py, hpz, -0.22, 0.72, 0.33, -0.56, -0.20, 0.36, 0.125)
        } else { 99.0 };
        let bang_r = if hpx > -0.06 && hpz > 0.04 && py > -0.45 {
            sd_capsule(hpx, py, hpz, 0.22, 0.72, 0.33, 0.56, -0.20, 0.36, 0.125)
        } else { 99.0 };
        let bang_c = if hax < 0.28 && hpz > 0.18 && py > 0.15 {
            sd_capsule(hpx, py, hpz, 0.04, 0.76, 0.44, -0.06, 0.41, 0.52, 0.085)
        } else { 99.0 };
        let hair_dist = smin(hair_shell.min(bang_l).min(bang_r), bang_c, 0.07);
        if hair_dist < min_d {
            min_d = hair_dist;
            mat = AsciiMaterial::Hair;
        }

        if hpz > 0.18 && (-0.22..0.38).contains(&py) && hax < 0.50 {
            let eye_dist = sd_ellipsoid(hax - 0.22 - fc.eye_gaze_x, py - 0.08, hpz - 0.53, 0.115, fc.eye_scale_y, 0.09);
            if eye_dist < min_d {
                min_d = eye_dist;
                mat = AsciiMaterial::Eye;
            }
        }
        if hpz > 0.22 && (0.05..0.48).contains(&py) && hax < 0.50 {
            let bx0 = hax - 0.22;
            let by0 = py - 0.26;
            let brow_dist = sd_box(bx0 * fc.c_brow - by0 * fc.s_brow, bx0 * fc.s_brow + by0 * fc.c_brow, hpz - 0.54, 0.125, 0.024, 0.042);
            if brow_dist < min_d {
                min_d = brow_dist;
                mat = AsciiMaterial::Hair;
            }
        }
        if hpz > 0.20 && (0.30..0.80).contains(&py) && hax < 0.36 {
            let vy0 = py - 0.54;
            let visor = sd_box((hpx - vy0) * 0.7071, (hpx + vy0) * 0.7071, hpz - 0.53, 0.085, 0.085, 0.052);
            if visor < min_d {
                min_d = visor;
                mat = AsciiMaterial::Visor;
            }
        }
    }

    if b_torso < min_d {
        let neck = sd_capsule(px, py, pz, 0.0, -0.45, -0.02, 0.0, -0.82, -0.04, 0.185);
        let shoulders = sd_ellipsoid(px, py + 1.08, pz + 0.04, 0.95, 0.45, 0.44);
        let collar = sd_torus(px, py + 0.72, pz + 0.02, 0.33, 0.07);
        let torso = smin(smin(neck, shoulders, 0.19), collar, 0.08);
        if torso < min_d {
            min_d = torso;
            mat = AsciiMaterial::Body;
        }
    }

    if b_wing < min_d {
        let wx0 = ax - 0.68;
        let wy0 = py - 0.38;
        let wbx = wx0 * fc.c_wing - wy0 * fc.s_wing;
        let wby = wx0 * fc.s_wing + wy0 * fc.c_wing;
        let wbz = pz + 0.04;
        let ear_cup = sd_ellipsoid(ax - 0.65, py - 0.02, pz + 0.02, 0.11, 0.20, 0.16);
        let w1 = sd_box(wbx - 0.36, wby - 0.21, wbz, 0.44, 0.072, 0.055);
        let w2 = sd_box(wbx - 0.28, wby - 0.04, wbz, 0.35, 0.065, 0.050);
        let w3 = sd_box(wbx - 0.19, wby + 0.12, wbz, 0.26, 0.056, 0.046);
        let w4 = sd_box(wbx - 0.11, wby + 0.26, wbz, 0.17, 0.045, 0.040);
        let wing_dist = ear_cup.min(w1.min(w2).min(w3.min(w4)));
        if wing_dist < min_d {
            min_d = wing_dist;
            mat = AsciiMaterial::Wing;
        }
    }

    if b_rings < min_d {
        let r1x = wx * fc.c_r1y + wz * fc.s_r1y;
        let r1z = -wx * fc.s_r1y + wz * fc.c_r1y;
        let ring1 = sd_torus(r1x, wy * 0.94 - r1z * 0.34 - 0.66, wy * 0.34 + r1z * 0.94, 1.38, 0.028);
        if ring1 < min_d {
            min_d = ring1;
            mat = AsciiMaterial::Ring;
        }
        let r2x = wx * fc.c_r2y + wz * fc.s_r2y;
        let r2z = -wx * fc.s_r2y + wz * fc.c_r2y;
        let ring2 = sd_torus(r2x, wy * 0.88 + r2z * 0.47 + 0.58, -wy * 0.47 + r2z * 0.88, 1.62, 0.022);
        if ring2 < min_d {
            min_d = ring2;
            mat = AsciiMaterial::Ring;
        }
        let o1dx = wx - fc.orb1[0];
        let o1dz = wz - fc.orb1[2];
        let orb1 = sd_octahedron(
            o1dx * fc.c_orb_spin - o1dz * fc.s_orb_spin,
            wy - fc.orb1[1],
            o1dx * fc.s_orb_spin + o1dz * fc.c_orb_spin,
            0.115,
        );
        let o2dx = wx - fc.orb2[0];
        let o2dz = wz - fc.orb2[2];
        let orb2 = sd_octahedron(
            o2dx * fc.c_orb_spin + o2dz * fc.s_orb_spin,
            wy - fc.orb2[1],
            -o2dx * fc.s_orb_spin + o2dz * fc.c_orb_spin,
            0.115,
        );
        let orb = orb1.min(orb2);
        if orb < min_d {
            min_d = orb;
            mat = AsciiMaterial::Orb;
        }
        if fc.pulse_active {
            let pulse = sd_torus(wx, wy + 0.55, wz, fc.pulse_radius, 0.018 + fc.energy * 0.015);
            if pulse < min_d {
                min_d = pulse;
                mat = AsciiMaterial::Pulse;
            }
        }
    }

    if b_pillars < min_d {
        let p0 = sd_box(awx - 1.34, wy + 1.38 - fc.pillar_h[0], wz + 0.55, 0.075, fc.pillar_h[0], 0.075);
        let p1 = sd_box(awx - 1.56, wy + 1.38 - fc.pillar_h[1], wz + 0.68, 0.075, fc.pillar_h[1], 0.075);
        let p2 = sd_box(awx - 1.78, wy + 1.38 - fc.pillar_h[2], wz + 0.82, 0.075, fc.pillar_h[2], 0.075);
        let pillar = p0.min(p1).min(p2);
        if pillar < min_d {
            min_d = pillar;
            mat = AsciiMaterial::Pillar;
        }
    }

    (min_d, mat)
}

fn calc_normal(x: f32, y: f32, z: f32, fc: &FramePrecompute) -> [f32; 3] {
    let e = 0.008;
    let k1 = eval_sdf(x + e, y - e, z - e, fc, true).0;
    let k2 = eval_sdf(x - e, y - e, z + e, fc, true).0;
    let k3 = eval_sdf(x - e, y + e, z - e, fc, true).0;
    let k4 = eval_sdf(x + e, y + e, z + e, fc, true).0;
    let nx = k1 - k2 - k3 + k4;
    let ny = -k1 - k2 + k3 + k4;
    let nz = -k1 + k2 - k3 + k4;
    let len = (nx * nx + ny * ny + nz * nz).sqrt().max(1e-6);
    [nx / len, ny / len, nz / len]
}

fn map_lum_char(lum: f32, ramp: &[char], dither: f32) -> char {
    let dithered = (lum + dither).clamp(0.0, 1.0);
    let idx = ((dithered * (ramp.len() - 1) as f32).floor() as usize).min(ramp.len() - 1);
    ramp[idx]
}

fn map_edge_char(nx: f32, ny: f32) -> char {
    if ny.abs() > 0.72 {
        '_'
    } else if nx.abs() > 0.72 {
        '|'
    } else if nx * ny > 0.0 {
        '/'
    } else {
        '\\'
    }
}

pub fn render_ascii3d_frame(params: &Ascii3DParams) -> Ascii3DFrame {
    let cols = params.cols.max(1);
    let rows = params.rows.max(1);
    let fc = FramePrecompute::new(params);
    let total = cols * rows;
    let mut cells = vec![
        AsciiCell {
            ch: ' ',
            intensity: 0.0,
            material: AsciiMaterial::Bg,
            is_edge: false,
            rgb: None,
        };
        total
    ];
    let mut depth_buf = vec![99.0_f32; total];
    let mut norm_buf = vec![[0.0_f32, 0.0, 1.0]; total];
    let mut mat_buf = vec![AsciiMaterial::Bg; total];

    let cam_dist = 3.02 / params.zoom.clamp(0.7, 1.55);
    let cp = params.pitch.cos();
    let sp = params.pitch.sin();
    let cy = params.yaw.cos();
    let sy = params.yaw.sin();
    let ry0 = 0.06 * cp - cam_dist * sp;
    let rz0 = 0.06 * sp + cam_dist * cp;
    let cam_x = rz0 * sy;
    let cam_y = ry0;
    let cam_z = rz0 * cy;

    let fx = -cam_x;
    let fy = -0.1 - cam_y;
    let fz = -cam_z;
    let fl = (fx * fx + fy * fy + fz * fz).sqrt().max(1e-6);
    let fwd = [fx / fl, fy / fl, fz / fl];
    let rl = ((-fwd[2]).powi(2) + fwd[0].powi(2)).sqrt().max(1e-6);
    let right = [-fwd[2] / rl, 0.0, fwd[0] / rl];
    let up = [
        -right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1],
    ];

    let aspect = (cols as f32 * 0.52) / rows as f32;
    let fov = 0.82;
    let bound_r2 = 2.26 * 2.26;
    let cam_y_plus = cam_y + 0.1;
    let cam_c2_base = cam_x * cam_x + cam_y_plus * cam_y_plus + cam_z * cam_z - bound_r2;

    for r in 0..rows {
        let ndc_y = 1.0 - (2.0 * (r as f32 + 0.5)) / rows as f32;
        let bayer_row = (r & 3) * 4;
        for c in 0..cols {
            let idx = r * cols + c;
            let ndc_x = ((2.0 * (c as f32 + 0.5)) / cols as f32 - 1.0) * aspect;
            let dither = BAYER_4X4[bayer_row + (c & 3)] * 0.055;

            let rdx0 = fwd[0] + right[0] * ndc_x * fov + up[0] * ndc_y * fov;
            let rdy0 = fwd[1] + up[1] * ndc_y * fov;
            let rdz0 = fwd[2] + right[2] * ndc_x * fov + up[2] * ndc_y * fov;
            let rdl = (rdx0 * rdx0 + rdy0 * rdy0 + rdz0 * rdz0).sqrt().max(1e-6);
            let rdx = rdx0 / rdl;
            let rdy = rdy0 / rdl;
            let rdz = rdz0 / rdl;

            let b = cam_x * rdx + cam_y_plus * rdy + cam_z * rdz;
            let disc = b * b - cam_c2_base;
            let mut hit = false;
            let mut t = 0.8_f32;
            let mut hit_mat = AsciiMaterial::Bg;

            if disc >= 0.0 {
                let sqrt_d = disc.sqrt();
                let t_start = (-b - sqrt_d).max(0.4);
                let t_end = (-b + sqrt_d).min(6.4);
                t = t_start;
                for _ in 0..19 {
                    let (d, m) = eval_sdf(cam_x + rdx * t, cam_y + rdy * t, cam_z + rdz * t, &fc, false);
                    if d < 0.019 {
                        hit = true;
                        hit_mat = m;
                        break;
                    }
                    t += d * 0.99;
                    if t > t_end {
                        break;
                    }
                }
            }

            if hit {
                depth_buf[idx] = t;
                mat_buf[idx] = hit_mat;
                if params.shader_mode == AsciiShaderMode::Depth {
                    let df = (1.0 - (t - 1.45) / 3.4).clamp(0.14, 1.0);
                    cells[idx] = AsciiCell {
                        ch: map_lum_char(df, DEPTH_RAMP, dither * 0.5),
                        intensity: df,
                        material: hit_mat,
                        is_edge: false,
                        rgb: None,
                    };
                    continue;
                }
                let hx = cam_x + rdx * t;
                let hy = cam_y + rdy * t;
                let hz = cam_z + rdz * t;
                let n = calc_normal(hx, hy, hz, &fc);
                norm_buf[idx] = n;
                let ndotv = (-(n[0] * rdx + n[1] * rdy + n[2] * rdz)).abs();

                cells[idx] = match params.shader_mode {
                    AsciiShaderMode::Norm => {
                        let r_ch = ((n[0] * 0.5 + 0.5).clamp(0.12, 1.0) * 255.0).round() as u8;
                        let g_ch = ((n[1] * 0.5 + 0.5).clamp(0.12, 1.0) * 255.0).round() as u8;
                        let b_ch = ((n[2] * 0.5 + 0.5).clamp(0.18, 1.0) * 255.0).round() as u8;
                        let ch = match hit_mat {
                            AsciiMaterial::Eye => 'O',
                            AsciiMaterial::Visor => '#',
                            AsciiMaterial::Mouth => 'o',
                            _ => map_edge_char(n[0], n[1]),
                        };
                        AsciiCell {
                            ch,
                            intensity: 0.92,
                            material: hit_mat,
                            is_edge: false,
                            rgb: Some([r_ch, g_ch, b_ch]),
                        }
                    }
                    AsciiShaderMode::Wire => {
                        let is_edge = ndotv < 0.43
                            || matches!(
                                hit_mat,
                                AsciiMaterial::Eye
                                    | AsciiMaterial::Mouth
                                    | AsciiMaterial::Visor
                                    | AsciiMaterial::Pillar
                                    | AsciiMaterial::Orb
                                    | AsciiMaterial::Pulse
                            );
                        if is_edge {
                            let ch = match hit_mat {
                                AsciiMaterial::Eye => 'O',
                                AsciiMaterial::Mouth => 'o',
                                AsciiMaterial::Visor | AsciiMaterial::Orb => '*',
                                _ => map_edge_char(n[0], n[1]),
                            };
                            AsciiCell {
                                ch,
                                intensity: (0.68 + (1.0 - ndotv) * 0.32).clamp(0.54, 1.0),
                                material: hit_mat,
                                is_edge: true,
                                rgb: None,
                            }
                        } else {
                            AsciiCell {
                                ch: if (r + c) % 4 == 0 { '.' } else { ' ' },
                                intensity: 0.22,
                                material: hit_mat,
                                is_edge: false,
                                rgb: None,
                            }
                        }
                    }
                    AsciiShaderMode::Holo => {
                        let scan = 0.62 + 0.38 * (hy * 14.0 - fc.time * 7.2).sin();
                        let fresnel = (1.0 - ndotv.clamp(0.0, 1.0)).powf(1.5);
                        let holo_lum = ((0.24 + fresnel * 0.76) * scan
                            + if matches!(hit_mat, AsciiMaterial::Eye | AsciiMaterial::Orb) { 0.38 } else { 0.0 })
                            .clamp(0.12, 1.0);
                        let ch = match hit_mat {
                            AsciiMaterial::Eye => 'O',
                            AsciiMaterial::Visor | AsciiMaterial::Orb => '*',
                            AsciiMaterial::Mouth => if fc.viseme == MouthViseme::Round { 'o' } else { 'O' },
                            _ if r % 2 == 0 => map_lum_char(holo_lum, HOLO_RAMP, dither * 0.4),
                            _ => '.',
                        };
                        AsciiCell {
                            ch,
                            intensity: holo_lum,
                            material: hit_mat,
                            is_edge: false,
                            rgb: None,
                        }
                    }
                    _ => {
                        // Solid Blinn-Phong + Fresnel rim
                        let (kx, ky, kz) = (0.468_f32, 0.585_f32, 0.663_f32);
                        let diff = (n[0] * kx + n[1] * ky + n[2] * kz).max(0.0);
                        let rim = (1.0 - ndotv.clamp(0.0, 1.0)).powi(2) * (0.52 + fc.energy * 0.48);
                        let mut lum = (0.14 + diff * 0.66) + rim * 0.42;
                        match hit_mat {
                            AsciiMaterial::Eye | AsciiMaterial::Visor => lum = (0.88 + fc.energy * 0.12).clamp(0.86, 1.0),
                            AsciiMaterial::Mouth => lum = (0.68 + if fc.is_speaking { fc.energy * 0.32 } else { 0.12 }).clamp(0.62, 1.0),
                            AsciiMaterial::Ring | AsciiMaterial::Pillar | AsciiMaterial::Orb | AsciiMaterial::Pulse => {
                                lum = (0.56 + diff * 0.36 + fc.energy * 0.28).clamp(0.44, 1.0);
                            }
                            AsciiMaterial::Hair => lum *= 0.80,
                            AsciiMaterial::Wing => lum = (lum + 0.10 + fc.energy * 0.18).clamp(0.22, 1.0),
                            _ => {}
                        }
                        lum = lum.clamp(0.08, 1.0);
                        let ch = match hit_mat {
                            AsciiMaterial::Eye => 'O',
                            AsciiMaterial::Visor | AsciiMaterial::Orb => '*',
                            AsciiMaterial::Pulse => '~',
                            AsciiMaterial::Mouth => if fc.viseme == MouthViseme::Round { 'o' } else { 'O' },
                            _ => map_lum_char(lum, CLEAN_RAMP, dither),
                        };
                        AsciiCell {
                            ch,
                            intensity: lum,
                            material: hit_mat,
                            is_edge: false,
                            rgb: None,
                        }
                    }
                };
                continue;
            }

            // Perspective Cyber-Grid floor
            if rdy < -0.04 {
                let floor_t = (-1.42 - cam_y) / rdy;
                if (0.5..16.0).contains(&floor_t) {
                    let fx_w = cam_x + rdx * floor_t;
                    let fz_w = cam_z + rdz * floor_t;
                    let fz_scroll = fz_w - params.time * 1.1;
                    let gx = (fx_w - fx_w.round()).abs();
                    let gz = (fz_scroll - fz_scroll.round()).abs();
                    let radial = (fx_w * fx_w * 0.7225 + (fz_w + 0.1).powi(2)).sqrt();
                    let shadow = if radial < 1.25 { 0.38 + (radial / 1.25) * 0.62 } else { 1.0 };
                    if gx < 0.055 || gz < 0.055 {
                        cells[idx] = AsciiCell {
                            ch: if gx < 0.055 && gz < 0.055 { '+' } else if gx < 0.055 { '|' } else { '-' },
                            intensity: ((1.0 - floor_t / 15.0) * shadow).clamp(0.06, 0.72),
                            material: AsciiMaterial::Grid,
                            is_edge: false,
                            rgb: None,
                        };
                    }
                }
            }
        }
    }

    // Pass 2: Depth & normal crease contour detection
    if matches!(params.shader_mode, AsciiShaderMode::Solid | AsciiShaderMode::Holo) {
        for r in 1..rows.saturating_sub(1) {
            for c in 1..cols.saturating_sub(1) {
                let idx = r * cols + c;
                let m = mat_buf[idx];
                if matches!(
                    m,
                    AsciiMaterial::Bg
                        | AsciiMaterial::Eye
                        | AsciiMaterial::Mouth
                        | AsciiMaterial::Visor
                        | AsciiMaterial::Orb
                        | AsciiMaterial::Pulse
                ) {
                    continue;
                }
                let d_jump = (depth_buf[idx] - depth_buf[idx + 1]).abs() > 0.4
                    || (depth_buf[idx] - depth_buf[idx + cols]).abs() > 0.4;
                let n = norm_buf[idx];
                let nr = norm_buf[idx + 1];
                let nd = norm_buf[idx + cols];
                let n_dot_r = n[0] * nr[0] + n[1] * nr[1] + n[2] * nr[2];
                let n_dot_d = n[0] * nd[0] + n[1] * nd[1] + n[2] * nd[2];
                let crease = mat_buf[idx + 1] != m || mat_buf[idx + cols] != m || n_dot_r < 0.56 || n_dot_d < 0.56;
                if d_jump || crease {
                    cells[idx].ch = map_edge_char(n[0], n[1]);
                    cells[idx].intensity = cells[idx].intensity.max(0.8);
                    cells[idx].is_edge = true;
                }
            }
        }
    }

    Ascii3DFrame { cols, rows, cells }
}

/// Renders an `Ascii3DFrame` cleanly into an RGBA buffer using a crisp 5x7 ASCII glyph bitmap.
pub fn render_ascii3d_rgba(
    pixel_w: u32,
    pixel_h: u32,
    frame: &Ascii3DFrame,
    theme: PhosphorTheme,
) -> Vec<u8> {
    let w = pixel_w.max(1) as usize;
    let h = pixel_h.max(1) as usize;
    let mut out = vec![0u8; w * h * 4];
    let (primary, bright, accent, dim) = match theme {
        PhosphorTheme::Emerald => (
            parse_hex_rgb("#34D399"),
            parse_hex_rgb("#ECFDF5"),
            parse_hex_rgb("#22D3EE"),
            parse_hex_rgb("#0F2A20"),
        ),
        PhosphorTheme::Cyan => (
            parse_hex_rgb("#22D3EE"),
            parse_hex_rgb("#ECFEFF"),
            parse_hex_rgb("#F5B800"),
            parse_hex_rgb("#1E3A4C"),
        ),
        PhosphorTheme::Gold => (
            parse_hex_rgb("#F5B800"),
            parse_hex_rgb("#FFF6CC"),
            parse_hex_rgb("#22D3EE"),
            parse_hex_rgb("#4A3808"),
        ),
        PhosphorTheme::Mono => (
            parse_hex_rgb("#E2E8F0"),
            parse_hex_rgb("#FFFFFF"),
            parse_hex_rgb("#38BDF8"),
            parse_hex_rgb("#334155"),
        ),
    };

    let cell_w = w as f32 / frame.cols.max(1) as f32;
    let cell_h = h as f32 / frame.rows.max(1) as f32;

    for r in 0..frame.rows {
        let y0 = (r as f32 * cell_h) as usize;
        let y1 = (((r + 1) as f32 * cell_h) as usize).min(h);
        for c in 0..frame.cols {
            let cell = &frame.cells[r * frame.cols + c];
            if cell.ch == ' ' || cell.intensity <= 0.01 {
                continue;
            }
            let glyph = glyph_5x7(cell.ch);
            let rgb = cell.rgb.unwrap_or_else(|| match cell.material {
                AsciiMaterial::Eye | AsciiMaterial::Visor | AsciiMaterial::Orb => bright,
                AsciiMaterial::Ring | AsciiMaterial::Pulse | AsciiMaterial::Mouth => accent,
                AsciiMaterial::Grid => dim,
                _ => if cell.is_edge || cell.intensity > 0.78 { bright } else { primary },
            });
            let alpha = (cell.intensity * 255.0).round().clamp(24.0, 255.0) as u8;

            let x0 = (c as f32 * cell_w) as usize;
            let x1 = (((c + 1) as f32 * cell_w) as usize).min(w);
            for py in y0..y1 {
                let gy = (((py - y0) * 7) / (y1 - y0).max(1)).min(6);
                let bits = glyph[gy];
                let row_off = py * w;
                for px in x0..x1 {
                    let gx = (((px - x0) * 5) / (x1 - x0).max(1)).min(4);
                    if (bits & (1 << (4 - gx))) != 0 {
                        let off = (row_off + px) * 4;
                        out[off] = rgb[0];
                        out[off + 1] = rgb[1];
                        out[off + 2] = rgb[2];
                        out[off + 3] = alpha;
                    }
                }
            }
        }
    }
    out
}

fn glyph_5x7(ch: char) -> [u8; 7] {
    match ch {
        '.' => [0, 0, 0, 0, 0, 0b01100, 0b01100],
        '\'' => [0b00100, 0b00100, 0, 0, 0, 0, 0],
        '`' => [0b01000, 0b00100, 0, 0, 0, 0, 0],
        ',' => [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
        ':' => [0, 0b00100, 0, 0, 0, 0b00100, 0],
        ';' => [0, 0b00100, 0, 0, 0b00100, 0b00100, 0b01000],
        '^' => [0b00100, 0b01010, 0b10001, 0, 0, 0, 0],
        '-' => [0, 0, 0, 0b11111, 0, 0, 0],
        '_' => [0, 0, 0, 0, 0, 0, 0b11111],
        '|' => [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
        '/' => [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0],
        '\\' => [0b10000, 0b01000, 0b00100, 0b00100, 0b00010, 0b00001, 0],
        '+' => [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
        '~' => [0, 0, 0b01001, 0b10110, 0, 0, 0],
        '=' => [0, 0, 0b11111, 0, 0b11111, 0, 0],
        '*' => [0, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0],
        'o' => [0, 0, 0b01110, 0b10001, 0b10001, 0b01110, 0],
        'O' => [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
        '0' => [0b01110, 0b10011, 0b10101, 0b10101, 0b11001, 0b10001, 0b01110],
        '#' => [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
        '%' => [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
        '@' => [0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10000, 0b01110],
        _ => [0, 0, 0, 0, 0, 0, 0],
    }
}
