use crate::portrait::{
    PortraitMotionState, portrait_assets, sample_portrait_luminance_field,
};
use voxcell_core::{DotProfile, ExpressionMood, MouthViseme};

pub const BAYER_8X8: [f32; 64] = [
    0.0 / 64.0, 32.0 / 64.0, 8.0 / 64.0, 40.0 / 64.0, 2.0 / 64.0, 34.0 / 64.0, 10.0 / 64.0, 42.0 / 64.0,
    48.0 / 64.0, 16.0 / 64.0, 56.0 / 64.0, 24.0 / 64.0, 50.0 / 64.0, 18.0 / 64.0, 58.0 / 64.0, 26.0 / 64.0,
    12.0 / 64.0, 44.0 / 64.0, 4.0 / 64.0, 36.0 / 64.0, 14.0 / 64.0, 46.0 / 64.0, 6.0 / 64.0, 38.0 / 64.0,
    60.0 / 64.0, 28.0 / 64.0, 52.0 / 64.0, 20.0 / 64.0, 62.0 / 64.0, 30.0 / 64.0, 54.0 / 64.0, 22.0 / 64.0,
    3.0 / 64.0, 35.0 / 64.0, 11.0 / 64.0, 43.0 / 64.0, 1.0 / 64.0, 33.0 / 64.0, 9.0 / 64.0, 41.0 / 64.0,
    51.0 / 64.0, 19.0 / 64.0, 59.0 / 64.0, 27.0 / 64.0, 49.0 / 64.0, 17.0 / 64.0, 57.0 / 64.0, 25.0 / 64.0,
    15.0 / 64.0, 47.0 / 64.0, 7.0 / 64.0, 39.0 / 64.0, 13.0 / 64.0, 45.0 / 64.0, 5.0 / 64.0, 37.0 / 64.0,
    63.0 / 64.0, 31.0 / 64.0, 55.0 / 64.0, 23.0 / 64.0, 61.0 / 64.0, 29.0 / 64.0, 53.0 / 64.0, 21.0 / 64.0,
];

pub fn parse_hex_rgb(hex: &str) -> [u8; 3] {
    let clean = hex.trim().strip_prefix('#').unwrap_or(hex.trim());
    if clean.len() == 3 {
        let mut out = [230u8, 240u8, 236u8];
        for (i, ch) in clean.chars().take(3).enumerate() {
            if let Some(d) = ch.to_digit(16) {
                out[i] = ((d << 4) | d) as u8;
            }
        }
        return out;
    }
    if clean.len() >= 6 {
        if let Ok(v) = u32::from_str_radix(&clean[..6], 16) {
            return [((v >> 16) & 0xff) as u8, ((v >> 8) & 0xff) as u8, (v & 0xff) as u8];
        }
    }
    [230, 240, 236]
}

pub fn mix_rgb(a: [u8; 3], b: [u8; 3], t: f32) -> [u8; 3] {
    let w = t.clamp(0.0, 1.0);
    [
        (a[0] as f32 + (b[0] as f32 - a[0] as f32) * w).round() as u8,
        (a[1] as f32 + (b[1] as f32 - a[1] as f32) * w).round() as u8,
        (a[2] as f32 + (b[2] as f32 - a[2] as f32) * w).round() as u8,
    ]
}

#[derive(Clone, Debug)]
pub struct TonalTier {
    pub rgb: [u8; 3],
    pub alpha: f32,
    pub diameter_scale: f32,
    pub bloom_weight: f32,
}

pub fn resolve_portrait_tone_palette(
    mood: ExpressionMood,
    is_speaking: bool,
    is_listening: bool,
    is_loading: bool,
    is_thumb: bool,
    energy: f32,
    tint_hex: Option<&str>,
) -> [TonalTier; 5] {
    let speaking_hot = !is_thumb && is_speaking && energy > 0.22;
    let active_voice = !is_thumb && (is_loading || is_listening || speaking_hot);
    let is_thinking = !is_thumb && !active_voice && mood == ExpressionMood::Thinking;
    let is_alert = !is_thumb && !active_voice && mood == ExpressionMood::Alert;

    let base_hexes = if is_thinking {
        ["#B48448", "#D9B26F", "#EFE2C4", "#F8F3E8", "#FFFFFF"]
    } else if is_alert {
        ["#B0707C", "#D89AA6", "#EFD4D9", "#F9ECEF", "#FFFFFF"]
    } else if active_voice {
        ["#6EE7B7", "#A7F3D0", "#DCE8E3", "#F1F7F4", "#FFFFFF"]
    } else {
        ["#8FA69E", "#B9CCC5", "#DCE8E3", "#F1F7F4", "#FFFFFF"]
    };

    let tint = tint_hex.map(parse_hex_rgb);
    let tint_weights = [
        if active_voice { 0.85 } else { 0.52 },
        if active_voice { 0.72 } else { 0.44 },
        0.52,
        0.34,
        0.16,
    ];

    let boost = if active_voice { (energy * 0.05).min(0.06) } else { 0.0 };
    let alphas = if is_loading {
        [0.42, 0.58, 0.74, 0.86, 0.95]
    } else {
        [
            (0.48 + boost).min(0.99),
            (0.68 + boost).min(0.99),
            (0.84 + boost * 0.5).min(0.99),
            0.94,
            0.99,
        ]
    };
    let diameters = [0.64, 0.78, 0.92, 1.06, 1.18];
    let blooms = [0.0, 0.0, 0.0, 0.55, 1.0];

    std::array::from_fn(|i| {
        let base_rgb = parse_hex_rgb(base_hexes[i]);
        let rgb = match tint {
            Some(t_rgb) => mix_rgb(base_rgb, t_rgb, tint_weights[i]),
            None => base_rgb,
        };
        TonalTier {
            rgb,
            alpha: alphas[i],
            diameter_scale: diameters[i],
            bloom_weight: blooms[i],
        }
    })
}

pub fn resolve_shape_tone_palette(
    low_rgb: [u8; 3],
    mid_rgb: [u8; 3],
    high_rgb: [u8; 3],
    is_thinking: bool,
    is_speaking: bool,
    energy: f32,
) -> [TonalTier; 5] {
    let warm_mid = parse_hex_rgb("#FBBF24");
    let warm_high = parse_hex_rgb("#FEF3C7");
    let amber_low = parse_hex_rgb("#D97706");

    let c0 = if is_thinking { mix_rgb(low_rgb, amber_low, 0.22) } else { low_rgb };
    let c1 = if is_thinking {
        mix_rgb(mix_rgb(low_rgb, mid_rgb, 0.58), warm_mid, 0.20)
    } else {
        mix_rgb(low_rgb, mid_rgb, 0.58)
    };
    let c2 = if is_thinking { mix_rgb(mid_rgb, warm_mid, 0.28) } else { mid_rgb };
    let c3 = if is_thinking {
        mix_rgb(mix_rgb(mid_rgb, high_rgb, 0.55), warm_high, 0.32)
    } else {
        mix_rgb(mid_rgb, high_rgb, 0.55)
    };
    let c4 = if is_speaking {
        mix_rgb(high_rgb, [255, 255, 255], (0.18 + energy * 0.35).min(0.55))
    } else if is_thinking {
        mix_rgb(high_rgb, warm_high, 0.35)
    } else {
        high_rgb
    };

    let boost = if is_speaking { (energy * 0.04).min(0.05) } else { 0.0 };
    let alphas = [(0.74 + boost).min(0.99), (0.86 + boost).min(0.99), 0.93, 0.96, 0.99];
    let colors = [c0, c1, c2, c3, c4];
    let diameters = [0.68, 0.82, 0.95, 1.08, 1.18];
    let blooms = [0.0, 0.0, 0.0, 0.6, 1.0];

    std::array::from_fn(|i| TonalTier {
        rgb: colors[i],
        alpha: alphas[i],
        diameter_scale: diameters[i],
        bloom_weight: blooms[i],
    })
}

pub struct BrailleFrameGrid {
    pub cols: usize,
    pub rows: usize,
    pub cell_bits: Vec<u8>,
    pub cell_lums: Vec<u8>,
}

/// Runs unsharp contour boost + Serpentine Bill Atkinson error diffusion on raw `[2*cols x 4*rows]` luminances.
pub fn diffuse_and_pack_braille_subpixels(raw: &[f32], cols: usize, rows: usize) -> BrailleFrameGrid {
    let sub_w = cols * 2;
    let sub_h = rows * 4;
    let mut work = vec![0.0_f32; sub_w * sub_h];

    // Unsharp contrast boost
    for sy in 0..sub_h {
        let row_off = sy * sub_w;
        let up_off = sy.saturating_sub(1) * sub_w;
        let dn_off = (sy + 1).min(sub_h - 1) * sub_w;
        for sx in 0..sub_w {
            let idx = row_off + sx;
            let c = raw[idx];
            if c >= 0.94 || c <= 0.025 {
                work[idx] = c;
                continue;
            }
            let l = raw[row_off + sx.saturating_sub(1)];
            let r = raw[row_off + (sx + 1).min(sub_w - 1)];
            let u = raw[up_off + sx];
            let d = raw[dn_off + sx];
            let avg = (l + r + u + d) * 0.25;
            let sharpened = c + (c - avg) * 0.42;
            let t = ((sharpened - 0.03) * 1.063_829_8).clamp(0.0, 1.0);
            work[idx] = t * t * (3.0 - 2.0 * t);
        }
    }

    // Serpentine Bill Atkinson Error Diffusion
    for sy in 0..sub_h {
        let forward = (sy & 1) == 0;
        let row_off = sy * sub_w;
        let bayer_row = (sy & 7) << 3;
        let has_next1 = sy + 1 < sub_h;
        let has_next2 = sy + 2 < sub_h;
        let row1 = row_off + sub_w;
        let row2 = row1 + sub_w;

        let mut sx_isize = if forward { 0_isize } else { sub_w as isize - 1 };
        let end_isize = if forward { sub_w as isize } else { -1_isize };
        let dir = if forward { 1_isize } else { -1_isize };

        while sx_isize != end_isize {
            let sx = sx_isize as usize;
            let idx = row_off + sx;
            let raw_val = raw[idx];
            if raw_val <= 0.025 {
                work[idx] = 0.0;
                sx_isize += dir;
                continue;
            }
            if raw_val >= 0.94 {
                work[idx] = 1.0;
                sx_isize += dir;
                continue;
            }

            let old_val = work[idx];
            let jitter = BAYER_8X8[bayer_row + (sx & 7)] * 0.068;
            let new_val = if old_val >= 0.47 + jitter { 1.0 } else { 0.0 };
            work[idx] = new_val;
            let err = (old_val - new_val) * 0.125;
            if err != 0.0 {
                let nx1 = sx_isize + dir;
                let nx2 = sx_isize + dir * 2;
                let px1 = sx_isize - dir;

                if nx1 >= 0 && (nx1 as usize) < sub_w {
                    work[row_off + nx1 as usize] += err;
                }
                if nx2 >= 0 && (nx2 as usize) < sub_w {
                    work[row_off + nx2 as usize] += err;
                }
                if has_next1 {
                    if px1 >= 0 && (px1 as usize) < sub_w {
                        work[row1 + px1 as usize] += err;
                    }
                    work[row1 + sx] += err;
                    if nx1 >= 0 && (nx1 as usize) < sub_w {
                        work[row1 + nx1 as usize] += err;
                    }
                }
                if has_next2 {
                    work[row2 + sx] += err;
                }
            }
            sx_isize += dir;
        }
    }

    let mut cell_bits = vec![0u8; cols * rows];
    let mut cell_lums = vec![0u8; cols * rows];

    for r in 0..rows {
        let r0 = r * 4 * sub_w;
        let r1 = r0 + sub_w;
        let r2 = r1 + sub_w;
        let r3 = r2 + sub_w;
        let cell_row = r * cols;

        for c in 0..cols {
            let c2 = c * 2;
            let lum_sum = raw[r0 + c2]
                + raw[r0 + c2 + 1]
                + raw[r1 + c2]
                + raw[r1 + c2 + 1]
                + raw[r2 + c2]
                + raw[r2 + c2 + 1]
                + raw[r3 + c2]
                + raw[r3 + c2 + 1];

            if lum_sum <= 0.02 {
                continue;
            }

            let mut bits = 0u8;
            if work[r0 + c2] >= 0.5 { bits |= 0x01; }
            if work[r0 + c2 + 1] >= 0.5 { bits |= 0x08; }
            if work[r1 + c2] >= 0.5 { bits |= 0x02; }
            if work[r1 + c2 + 1] >= 0.5 { bits |= 0x10; }
            if work[r2 + c2] >= 0.5 { bits |= 0x04; }
            if work[r2 + c2 + 1] >= 0.5 { bits |= 0x20; }
            if work[r3 + c2] >= 0.5 { bits |= 0x40; }
            if work[r3 + c2 + 1] >= 0.5 { bits |= 0x80; }

            cell_lums[cell_row + c] = (lum_sum * 31.875 + 0.5).clamp(0.0, 255.0) as u8;
            cell_bits[cell_row + c] = bits;
        }
    }

    BrailleFrameGrid {
        cols,
        rows,
        cell_bits,
        cell_lums,
    }
}

pub fn rasterize_tonal_grid_rgba(
    pixel_w: u32,
    pixel_h: u32,
    grid: &BrailleFrameGrid,
    palette: &[TonalTier; 5],
    dot_profile: DotProfile,
    bloom: f32,
) -> Vec<u8> {
    let w = pixel_w.max(1) as usize;
    let h = pixel_h.max(1) as usize;
    let mut bytes = vec![0u8; w * h * 4];

    if grid.cols == 0 || grid.rows == 0 {
        return bytes;
    }

    let cell_w = w as f32 / grid.cols as f32;
    let cell_h = h as f32 / grid.rows as f32;
    let base_dot_px = (cell_w * 0.36).min(cell_h * 0.22).max(1.1);

    let profile_scale = match dot_profile {
        DotProfile::Crisp => 0.88,
        DotProfile::Balanced => 1.0,
        DotProfile::Phosphor => 1.14,
    };
    let soft_edge_cut = match dot_profile {
        DotProfile::Crisp => 0.44,
        DotProfile::Balanced => 0.3364,
        DotProfile::Phosphor => 0.24,
    };
    let inv_edge_span = 1.0 / (1.3225 - soft_edge_cut);
    let scaled_base = (base_dot_px * profile_scale).max(0.85);
    let bloom = bloom.clamp(0.0, 1.5);

    // Collect dot coordinates per tonal tier [0..=4]
    let mut tier_pts: [Vec<(f32, f32)>; 5] = Default::default();
    let dx_sub = [cell_w * 0.25, cell_w * 0.72];
    let dy_sub = [cell_h * 0.14, cell_h * 0.39, cell_h * 0.64, cell_h * 0.89];
    const DOT_MASKS: [(u8, usize, usize); 8] = [
        (0x01, 0, 0),
        (0x08, 1, 0),
        (0x02, 0, 1),
        (0x10, 1, 1),
        (0x04, 0, 2),
        (0x20, 1, 2),
        (0x40, 0, 3),
        (0x80, 1, 3),
    ];

    for r in 0..grid.rows {
        let base_y = r as f32 * cell_h;
        let row_off = r * grid.cols;
        for c in 0..grid.cols {
            let bits = grid.cell_bits[row_off + c];
            if bits == 0 {
                continue;
            }
            let lum = grid.cell_lums[row_off + c];
            let tier_idx = if lum < 52 {
                0
            } else if lum < 104 {
                1
            } else if lum < 158 {
                2
            } else if lum < 212 {
                3
            } else {
                4
            };
            let base_x = c as f32 * cell_w;
            for (mask, sx_i, sy_i) in DOT_MASKS {
                if (bits & mask) != 0 {
                    tier_pts[tier_idx].push((base_x + dx_sub[sx_i], base_y + dy_sub[sy_i]));
                }
            }
        }
    }

    // Pass 1: Quadratic phosphor corona bloom on top two tiers
    if bloom > 0.04 {
        for tier_idx in 3..=4 {
            let pts = &tier_pts[tier_idx];
            if pts.is_empty() {
                continue;
            }
            let tier = &palette[tier_idx];
            let tier_gain = if tier_idx == 4 { 1.0 } else { 0.48 };
            let halo_alpha_max = (tier.alpha * bloom * tier_gain * tier.bloom_weight * 62.0)
                .round()
                .min(96.0) as i32;
            if halo_alpha_max <= 2 {
                continue;
            }
            let dot_px = (scaled_base * tier.diameter_scale).max(0.7);
            let halo_radius = dot_px * (0.95 + bloom * 0.38);
            let inv_halo_r2 = 1.0 / (halo_radius * halo_radius);
            let [r, g, b] = tier.rgb;

            for &(cx, cy) in pts {
                let ix0 = ((cx - halo_radius).floor() as isize).max(0) as usize;
                let iy0 = ((cy - halo_radius).floor() as isize).max(0) as usize;
                let ix1 = ((cx + halo_radius).ceil() as isize).min(w as isize - 1).max(0) as usize;
                let iy1 = ((cy + halo_radius).ceil() as isize).min(h as isize - 1).max(0) as usize;

                for py in iy0..=iy1 {
                    let dy = py as f32 + 0.5 - cy;
                    let dy2 = dy * dy;
                    let row_pix = py * w;
                    for px in ix0..=ix1 {
                        let dx = px as f32 + 0.5 - cx;
                        let norm2 = (dx * dx + dy2) * inv_halo_r2;
                        if norm2 >= 1.0 {
                            continue;
                        }
                        let falloff = 1.0 - norm2;
                        let cov_a = (halo_alpha_max as f32 * falloff * falloff + 0.5) as i32;
                        if cov_a <= 1 {
                            continue;
                        }
                        let off = (row_pix + px) * 4;
                        let prev_a = bytes[off + 3] as i32;
                        if prev_a == 0 {
                            bytes[off] = r;
                            bytes[off + 1] = g;
                            bytes[off + 2] = b;
                            bytes[off + 3] = cov_a.min(255) as u8;
                        } else {
                            let next_a = (prev_a + cov_a).min(210) as u8;
                            bytes[off] = (bytes[off] as i32 + ((r as i32 * cov_a) >> 8)).min(255) as u8;
                            bytes[off + 1] = (bytes[off + 1] as i32 + ((g as i32 * cov_a) >> 8)).min(255) as u8;
                            bytes[off + 2] = (bytes[off + 2] as i32 + ((b as i32 * cov_a) >> 8)).min(255) as u8;
                            bytes[off + 3] = next_a;
                        }
                    }
                }
            }
        }
    }

    // Pass 2: Circular anti-aliased halftone dot cores
    for tier_idx in 0..5 {
        let pts = &tier_pts[tier_idx];
        if pts.is_empty() {
            continue;
        }
        let tier = &palette[tier_idx];
        let base_a = (tier.alpha * 255.0).round().clamp(0.0, 255.0) as i32;
        if base_a == 0 {
            continue;
        }
        let dot_px = (scaled_base * tier.diameter_scale).max(0.7);
        let radius = dot_px * 0.5;
        let eff_r = radius + 0.45;
        let inv_r2 = 1.0 / (eff_r * eff_r);
        let [r, g, b] = tier.rgb;

        for &(cx, cy) in pts {
            let ix0 = ((cx - radius - 0.5).floor() as isize).max(0) as usize;
            let iy0 = ((cy - radius - 0.5).floor() as isize).max(0) as usize;
            let ix1 = ((cx + radius + 0.5).ceil() as isize).min(w as isize - 1).max(0) as usize;
            let iy1 = ((cy + radius + 0.5).ceil() as isize).min(h as isize - 1).max(0) as usize;

            for py in iy0..=iy1 {
                let dy = py as f32 + 0.5 - cy;
                let dy2 = dy * dy;
                let row_pix = py * w;
                for px in ix0..=ix1 {
                    let dx = px as f32 + 0.5 - cx;
                    let norm2 = (dx * dx + dy2) * inv_r2;
                    if norm2 >= 1.3225 {
                        continue;
                    }
                    let radial_cov = if norm2 <= soft_edge_cut {
                        1.0
                    } else {
                        (1.3225 - norm2) * inv_edge_span
                    };
                    let cov_a = (base_a as f32 * radial_cov + 0.5) as i32;
                    if cov_a <= 0 {
                        continue;
                    }
                    let off = (row_pix + px) * 4;
                    let prev_a = bytes[off + 3] as i32;
                    if prev_a == 0 {
                        bytes[off] = r;
                        bytes[off + 1] = g;
                        bytes[off + 2] = b;
                        bytes[off + 3] = cov_a.min(255) as u8;
                    } else {
                        let sum_a = prev_a + cov_a;
                        let next_a = sum_a.min(255) as u8;
                        let w_new = cov_a as f32 / sum_a as f32;
                        let w_old = 1.0 - w_new;
                        bytes[off] = (bytes[off] as f32 * w_old + r as f32 * w_new + 0.5) as u8;
                        bytes[off + 1] = (bytes[off + 1] as f32 * w_old + g as f32 * w_new + 0.5) as u8;
                        bytes[off + 2] = (bytes[off + 2] as f32 * w_old + b as f32 * w_new + 0.5) as u8;
                        bytes[off + 3] = next_a;
                    }
                }
            }
        }
    }

    bytes
}

#[derive(Clone, Debug)]
pub struct PortraitRenderOptions<'a> {
    pub pixel_w: u32,
    pub pixel_h: u32,
    pub cols: usize,
    pub rows: usize,
    pub time: f32,
    pub mood: ExpressionMood,
    pub viseme: MouthViseme,
    pub energy: f32,
    pub is_speaking: bool,
    pub is_listening: bool,
    pub is_loading: bool,
    pub is_thumb: bool,
    pub dot_profile: DotProfile,
    pub bloom: f32,
    pub tint_hex: Option<&'a str>,
}

pub fn render_portrait_rgba(
    motion: &PortraitMotionState,
    opts: &PortraitRenderOptions<'_>,
) -> Vec<u8> {
    let assets = portrait_assets();
    let raw = sample_portrait_luminance_field(
        opts.cols,
        opts.rows,
        opts.time,
        opts.mood,
        opts.viseme,
        opts.energy,
        opts.is_speaking,
        opts.is_listening,
        motion,
        assets,
    );
    let grid = diffuse_and_pack_braille_subpixels(&raw, opts.cols, opts.rows);
    let palette = resolve_portrait_tone_palette(
        opts.mood,
        opts.is_speaking,
        opts.is_listening,
        opts.is_loading,
        opts.is_thumb,
        opts.energy,
        opts.tint_hex,
    );
    rasterize_tonal_grid_rgba(
        opts.pixel_w,
        opts.pixel_h,
        &grid,
        &palette,
        opts.dot_profile,
        opts.bloom,
    )
}
