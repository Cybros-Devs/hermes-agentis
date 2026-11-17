use crate::portrait::{clamp01, smoothstep};
use crate::raster::{
    BAYER_8X8, BrailleFrameGrid, TonalTier, mix_rgb, parse_hex_rgb, rasterize_tonal_grid_rgba,
};
use voxcell_core::{DotProfile, HorizonMode};

#[derive(Clone, Debug)]
pub struct HorizonMotionState {
    pub energy: f32,
    pub pointer_x: f32,
    pub pointer_y: f32,
    pub bands: [f32; 12],
    pub pointer_vel_x: f32,
    pub wake_phase: f32,
}

impl Default for HorizonMotionState {
    fn default() -> Self {
        Self {
            energy: 0.08,
            pointer_x: 0.0,
            pointer_y: 0.0,
            bands: [0.0; 12],
            pointer_vel_x: 0.0,
            wake_phase: 0.0,
        }
    }
}

#[derive(Clone, Debug)]
pub struct HorizonAnimator {
    state: HorizonMotionState,
    energy_vel: f32,
}

impl Default for HorizonAnimator {
    fn default() -> Self {
        Self::new()
    }
}

impl HorizonAnimator {
    pub fn new() -> Self {
        Self {
            state: HorizonMotionState::default(),
            energy_vel: 0.0,
        }
    }

    pub fn state(&self) -> &HorizonMotionState {
        &self.state
    }

    pub fn step(
        &mut self,
        energy: f32,
        pointer_x: f32,
        pointer_y: f32,
        bands: &[f32; 12],
        dt: f32,
        reduced_motion: bool,
    ) -> &HorizonMotionState {
        let clamped_dt = dt.clamp(0.004, 0.06);
        if reduced_motion {
            self.state.energy = clamp01(energy * 0.4);
            self.state.pointer_x = pointer_x.clamp(-1.0, 1.0);
            self.state.pointer_y = pointer_y.clamp(-1.0, 1.0);
            self.state.pointer_vel_x = 0.0;
            for i in 0..12 {
                self.state.bands[i] = clamp01(bands[i] * 0.5);
            }
            return &self.state;
        }

        let target_energy = clamp01(energy);
        let (stiff, damp) = if target_energy > self.state.energy {
            (68.0, 17.5)
        } else {
            (42.0, 13.5)
        };
        self.energy_vel += ((target_energy - self.state.energy) * stiff - self.energy_vel * damp) * clamped_dt;
        self.state.energy = clamp01(self.state.energy + self.energy_vel * clamped_dt);

        let prev_x = self.state.pointer_x;
        let ptr_factor = 1.0 - (-9.5 * clamped_dt).exp();
        self.state.pointer_x += (pointer_x.clamp(-1.0, 1.0) - self.state.pointer_x) * ptr_factor;
        self.state.pointer_y += (pointer_y.clamp(-1.0, 1.0) - self.state.pointer_y) * ptr_factor;

        let raw_vel = ((self.state.pointer_x - prev_x) / clamped_dt).clamp(-3.5, 3.5);
        let vel_factor = 1.0 - (-7.0 * clamped_dt).exp();
        self.state.pointer_vel_x += (raw_vel - self.state.pointer_vel_x) * vel_factor;
        self.state.wake_phase +=
            clamped_dt * (1.2 + self.state.pointer_vel_x.abs() * 2.4 + self.state.energy * 1.4);

        let attack = 1.0 - (-9.5 * clamped_dt).exp();
        let release = 1.0 - (-6.0 * clamped_dt).exp();
        for i in 0..12 {
            let target = clamp01(bands[i]);
            let f = if target > self.state.bands[i] { attack } else { release };
            self.state.bands[i] += (target - self.state.bands[i]) * f;
        }

        &self.state
    }
}

pub fn sample_horizon_grid(
    cols: usize,
    rows: usize,
    time: f32,
    motion: &HorizonMotionState,
    style: HorizonMode,
) -> BrailleFrameGrid {
    let sub_w = cols * 2;
    let sub_h = rows * 4;
    let mut sub_lum = vec![0.0_f32; sub_w * sub_h];

    let energy = motion.energy;
    let px_target = (motion.pointer_x + 1.0) * 0.5;
    let py_boost = (1.0 - clamp01((motion.pointer_y + 1.0) * 0.5)) * 0.08;
    let voice_amp = 0.08 + energy * 0.25;
    let inv_sub_w = 1.0 / sub_w.max(1) as f32;
    let inv_sub_h = 1.0 / sub_h.max(1) as f32;
    let cursor_weight = 0.12 + py_boost;
    let wake_amp = (motion.pointer_vel_x.abs() * 0.055).clamp(0.0, 0.09);
    let wake_dir = if motion.pointer_vel_x >= 0.0 { -1.0 } else { 1.0 };

    let is_ribbon = style == HorizonMode::Ribbon;
    let is_peaks = style == HorizonMode::Peaks;
    let is_pulse = style == HorizonMode::Pulse;
    let c1_amp = if is_ribbon { 0.08 + energy * 0.28 } else { 0.14 + voice_amp * 0.36 };
    let c2_amp = if is_ribbon { 0.05 + energy * 0.20 } else { 0.11 + voice_amp * 0.27 };
    let c3_amp = if is_ribbon { 0.03 + energy * 0.12 } else { 0.07 + voice_amp * 0.22 };
    let shimmer_scale = 0.20 * (0.35 + energy * 0.65);
    let bar_count = ((cols as f32 * 0.28).round() as usize).max(18);

    let mut crest1 = vec![0.0_f32; sub_w];
    let mut crest2 = vec![0.0_f32; sub_w];
    let mut crest3 = vec![0.0_f32; sub_w];
    let mut shimmer = vec![0.0_f32; sub_w];
    let mut mist = vec![0.0_f32; sub_w];
    let mut sin_u = vec![0.0_f32; sub_w];
    let mut cos_u = vec![0.0_f32; sub_w];
    let mut peak_top = vec![0.0_f32; sub_w];
    let mut bar_gate = vec![0.0_f32; sub_w];

    for sx in 0..sub_w {
        let ux = (sx as f32 + 0.5) * inv_sub_w;
        let dx_ptr = ux - px_target;
        let ptr_arg = dx_ptr * dx_ptr * 18.0;
        let cursor_wave = if ptr_arg < 8.0 { (-ptr_arg).exp() * cursor_weight } else { 0.0 };

        let mut wake_wave = 0.0_f32;
        if wake_amp > 0.004 {
            let behind = dx_ptr * wake_dir;
            if behind > -0.04 && behind < 0.42 {
                let wake_env = (-(behind * behind * 22.0)).exp();
                wake_wave = wake_env * (behind * 34.0 - motion.wake_phase * 6.5).sin() * wake_amp;
            }
        }

        let f_idx = ux * 11.0;
        let i0 = (f_idx.floor() as usize).min(11);
        let i1 = (i0 + 1).min(11);
        let frac = f_idx - i0 as f32;
        let smooth_frac = frac * frac * (3.0 - 2.0 * frac);
        let band_boost = (motion.bands[i0] + (motion.bands[i1] - motion.bands[i0]) * smooth_frac) * 0.16;

        let pulse_mod = if is_pulse {
            (dx_ptr.abs() * 32.0 - time * 5.2).sin()
                * (0.045 + energy * 0.075)
                * (-(dx_ptr * dx_ptr * 3.8)).exp()
        } else {
            0.0
        };

        crest1[sx] = 0.44
            - (ux * 6.2 + time * 0.92).sin() * c1_amp
            - (ux * 13.0 - time * 1.32).cos() * 0.055
            - cursor_wave
            - wake_wave
            - band_boost
            - pulse_mod;

        crest2[sx] = 0.60
            - (ux * 4.5 - time * 0.68 + 1.4).sin() * c2_amp
            - (ux * 19.0 + time * 1.9).sin() * 0.036
            - cursor_wave * 0.65
            - wake_wave * 0.55
            - band_boost * 0.58
            - pulse_mod * 0.6;

        crest3[sx] = 0.74 - (ux * 8.2 + time * 1.18).cos() * c3_amp - band_boost * 0.42;

        if is_peaks {
            let bar_pos = ux * bar_count as f32;
            let bar_idx = bar_pos.floor() as usize;
            let bar_frac = bar_pos - bar_idx as f32 - 0.5;
            let bar_center_u = (bar_idx as f32 + 0.5) / bar_count as f32;
            bar_gate[sx] = if bar_frac > -0.34 && bar_frac < 0.34 { 1.0 } else { 0.0 };
            let bi = ((bar_center_u * 12.0).floor() as usize).min(11);
            let bar_band = motion.bands[bi] * 0.42 + 0.08;
            let ptr_bar = (-(bar_center_u - px_target).powi(2) * 20.0).exp() * (0.12 + energy * 0.14);
            peak_top[sx] = (0.84 - (bar_band * (0.55 + energy * 0.75) + ptr_bar)).clamp(0.18, 0.82);
        }

        shimmer[sx] = (0.94 + shimmer_scale * (ux * 22.0 - time * 3.4).sin()) * 0.98;
        let sparkle_gate = (ux * 54.0 - time * 4.6).sin() * (ux * 31.0 + time * 2.9).cos();
        mist[sx] = if energy > 0.14 {
            clamp01(0.42 + 0.58 * sparkle_gate) * energy * 0.42
        } else {
            0.0
        };

        let ripple_u = if is_pulse {
            dx_ptr.abs() * 38.0 - time * 4.4
        } else {
            ux * 42.0 - time * 2.25
        };
        sin_u[sx] = ripple_u.sin();
        cos_u[sx] = ripple_u.cos();
    }

    for sy in 0..sub_h {
        let uy = (sy as f32 + 0.5) * inv_sub_h;
        let top_fade = smoothstep(0.08, 0.42, uy);
        let bottom_taper = 1.0 - smoothstep(0.66, 0.98, uy);
        let fade_env = top_fade * bottom_taper;
        if fade_env <= 0.001 {
            continue;
        }
        let row_off = sy * sub_w;
        let bottom_anchor = smoothstep(0.35, 0.90, uy) * if is_pulse { 0.15 } else { 0.10 };
        let ripple_v = uy * 18.0;
        let sin_v = ripple_v.sin();
        let cos_v = ripple_v.cos();
        let peak_scan_mask = if is_peaks && (sy % 3 != 2) { 1.0 } else { 0.42 };

        for sx in 0..sub_w {
            let c1 = crest1[sx];
            let c2 = crest2[sx];
            let c3 = crest3[sx];
            let s1 = (uy - c1).abs() * 29.0;
            let s2 = (uy - c2).abs() * 24.0;
            let s3 = (uy - c3).abs() * 22.0;

            let line1 = if s1 < 2.83 { (-(s1 * s1)).exp() * (shimmer[sx] * 1.06).min(1.06) } else { 0.0 };
            let line2 = if s2 < 2.83 { (-(s2 * s2)).exp() * 0.72 } else { 0.0 };
            let line3 = if s3 < 2.83 { (-(s3 * s3)).exp() * 0.54 } else { 0.0 };

            let mist_offset = c1 - uy;
            let mist_val = if mist_offset > 0.008 && mist_offset < 0.16 && mist[sx] > 0.02 {
                mist[sx] * (-(mist_offset * mist_offset * 165.0)).exp()
            } else {
                0.0
            };

            let trough_atten = if uy > c1 && uy < c2 {
                0.65 + 0.35 * smoothstep(c1, c2, uy)
            } else {
                1.0
            };
            let fill1 = if uy > c1 {
                smoothstep(c1, c1 + 0.34, uy) * 0.16 * trough_atten
            } else {
                0.0
            };
            let fill2 = if uy > c2 {
                smoothstep(c2, c2 + 0.28, uy) * 0.15
            } else {
                0.0
            };
            let sin_rip = sin_u[sx] * cos_v + cos_u[sx] * sin_v;
            let fine_rip = (0.5 + 0.5 * sin_rip) * bottom_anchor;

            let mut peak_boost = 0.0_f32;
            if is_peaks && bar_gate[sx] > 0.5 {
                let ptop = peak_top[sx];
                if uy >= ptop && uy < 0.86 {
                    let cap_dist = uy - ptop;
                    let cap_glow = if cap_dist < 0.055 {
                        0.86
                    } else {
                        0.46 * (1.0 - smoothstep(ptop, 0.86, uy) * 0.45)
                    };
                    peak_boost = cap_glow * peak_scan_mask;
                }
            }

            let max_line = line1.max(line2).max(line3);
            let combined = max_line.max(peak_boost);
            sub_lum[row_off + sx] = clamp01((combined + fill1 + fill2 + fine_rip + mist_val) * fade_env);
        }
    }

    let mut cell_bits = vec![0u8; cols * rows];
    let mut cell_lums = vec![0u8; cols * rows];
    for r in 0..rows {
        let sy_base = r * 4;
        let r0 = sy_base * sub_w;
        let r1 = r0 + sub_w;
        let r2 = r1 + sub_w;
        let r3 = r2 + sub_w;
        let b0 = (sy_base & 7) << 3;
        let b1 = ((sy_base + 1) & 7) << 3;
        let b2 = ((sy_base + 2) & 7) << 3;
        let b3 = ((sy_base + 3) & 7) << 3;
        let row_off = r * cols;

        for c in 0..cols {
            let c2 = c * 2;
            let l00 = sub_lum[r0 + c2];
            let l01 = sub_lum[r0 + c2 + 1];
            let l10 = sub_lum[r1 + c2];
            let l11 = sub_lum[r1 + c2 + 1];
            let l20 = sub_lum[r2 + c2];
            let l21 = sub_lum[r2 + c2 + 1];
            let l30 = sub_lum[r3 + c2];
            let l31 = sub_lum[r3 + c2 + 1];
            let lum_sum = l00 + l01 + l10 + l11 + l20 + l21 + l30 + l31;
            if lum_sum <= 0.05 {
                continue;
            }
            let bx0 = c2 & 7;
            let bx1 = (c2 + 1) & 7;
            let mut bits = 0u8;
            if l00 > 0.13 + BAYER_8X8[b0 + bx0] * 0.72 { bits |= 0x01; }
            if l01 > 0.13 + BAYER_8X8[b0 + bx1] * 0.72 { bits |= 0x08; }
            if l10 > 0.13 + BAYER_8X8[b1 + bx0] * 0.72 { bits |= 0x02; }
            if l11 > 0.13 + BAYER_8X8[b1 + bx1] * 0.72 { bits |= 0x10; }
            if l20 > 0.13 + BAYER_8X8[b2 + bx0] * 0.72 { bits |= 0x04; }
            if l21 > 0.13 + BAYER_8X8[b2 + bx1] * 0.72 { bits |= 0x20; }
            if l30 > 0.13 + BAYER_8X8[b3 + bx0] * 0.72 { bits |= 0x40; }
            if l31 > 0.13 + BAYER_8X8[b3 + bx1] * 0.72 { bits |= 0x80; }

            cell_lums[row_off + c] = (lum_sum * 31.875 + 0.5).clamp(0.0, 255.0) as u8;
            cell_bits[row_off + c] = bits;
        }
    }

    BrailleFrameGrid {
        cols,
        rows,
        cell_bits,
        cell_lums,
    }
}

pub fn render_horizon_rgba(
    pixel_w: u32,
    pixel_h: u32,
    cols: usize,
    rows: usize,
    time: f32,
    motion: &HorizonMotionState,
    style: HorizonMode,
    accent_hex: &str,
    dot_profile: DotProfile,
    bloom: f32,
) -> Vec<u8> {
    let grid = sample_horizon_grid(cols, rows, time, motion, style);
    let accent = parse_hex_rgb(accent_hex);
    let dim = parse_hex_rgb("#0F2A20");
    let mid = mix_rgb(dim, accent, 0.65);
    let hi = mix_rgb(accent, [255, 255, 255], 0.55);
    let palette = [
        TonalTier { rgb: mix_rgb(dim, accent, 0.32), alpha: 0.44, diameter_scale: 0.68, bloom_weight: 0.0 },
        TonalTier { rgb: mid, alpha: 0.66, diameter_scale: 0.80, bloom_weight: 0.0 },
        TonalTier { rgb: accent, alpha: 0.82, diameter_scale: 0.94, bloom_weight: 0.0 },
        TonalTier { rgb: hi, alpha: 0.92, diameter_scale: 1.06, bloom_weight: 0.55 },
        TonalTier { rgb: [236, 253, 245], alpha: 0.98, diameter_scale: 1.16, bloom_weight: 1.0 },
    ];
    rasterize_tonal_grid_rgba(pixel_w, pixel_h, &grid, &palette, dot_profile, bloom)
}
