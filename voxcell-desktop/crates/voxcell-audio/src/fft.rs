use rustfft::{FftPlanner, num_complex::Complex};
use std::f32::consts::TAU;
use std::sync::Arc;

pub struct SpectrumAnalyzer {
    size: usize,
    fft: Arc<dyn rustfft::Fft<f32>>,
    window: Vec<f32>,
    scratch: Vec<Complex<f32>>,
    prev_bands: [f32; 12],
}

impl SpectrumAnalyzer {
    pub fn new(size: usize) -> Self {
        let n = size.max(64).next_power_of_two();
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(n);
        let window = (0..n)
            .map(|i| 0.5 - 0.5 * ((TAU * i as f32) / (n as f32 - 1.0)).cos())
            .collect();
        let scratch = vec![Complex { re: 0.0, im: 0.0 }; n];
        Self {
            size: n,
            fft,
            window,
            scratch,
            prev_bands: [0.0; 12],
        }
    }

    pub fn analyze(&mut self, samples: &[f32], sample_rate: f32) -> (f32, [f32; 12]) {
        if samples.is_empty() {
            for b in &mut self.prev_bands {
                *b *= 0.85;
            }
            return (0.0, self.prev_bands);
        }

        let start = samples.len().saturating_sub(self.size);
        let slice = &samples[start..];

        let mut rms_acc = 0.0_f32;
        for (i, slot) in self.scratch.iter_mut().enumerate() {
            let s = slice.get(i).copied().unwrap_or(0.0);
            rms_acc += s * s;
            *slot = Complex {
                re: s * self.window[i],
                im: 0.0,
            };
        }
        let rms = (rms_acc / slice.len().max(1) as f32).sqrt().min(1.0);
        let amp = (rms * 3.2).clamp(0.0, 1.0);

        self.fft.process(&mut self.scratch);

        let sr = sample_rate.max(8000.0);
        let nyquist = sr * 0.5;
        let half = self.size / 2;
        let min_hz = 65.0_f32;
        let max_hz = nyquist.min(9000.0);

        let mut next_bands = [0.0_f32; 12];
        for (band_idx, out) in next_bands.iter_mut().enumerate() {
            let t0 = band_idx as f32 / 12.0;
            let t1 = (band_idx + 1) as f32 / 12.0;
            let f0 = min_hz * (max_hz / min_hz).powf(t0);
            let f1 = min_hz * (max_hz / min_hz).powf(t1);
            let bin0 = ((f0 / sr) * self.size as f32).floor().max(1.0) as usize;
            let bin1 = ((f1 / sr) * self.size as f32)
                .ceil()
                .max((bin0 + 1) as f32)
                .min((half - 1) as f32) as usize;

            let mut peak = 0.0_f32;
            for b in bin0..=bin1 {
                let c = self.scratch[b];
                let mag = (c.re * c.re + c.im * c.im).sqrt() / (self.size as f32 * 0.25);
                if mag > peak {
                    peak = mag;
                }
            }
            let normalized = (peak * 1.45).clamp(0.0, 1.0);
            let smoothed = self.prev_bands[band_idx] * 0.45 + normalized * 0.55;
            self.prev_bands[band_idx] = smoothed;
            *out = smoothed;
        }

        (amp, next_bands)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_12_log_bands_and_peaks_on_sine_frequency() {
        let mut analyzer = SpectrumAnalyzer::new(1024);
        let sr = 16_000.0;
        let low: Vec<f32> = (0..1024)
            .map(|i| (TAU * 140.0 * (i as f32 / sr)).sin() * 0.5)
            .collect();
        let (amp_low, bands_low) = analyzer.analyze(&low, sr);
        assert!(amp_low > 0.4);
        let max_low_idx = bands_low
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .map(|(i, _)| i)
            .unwrap();
        assert!(max_low_idx <= 3, "expected 140Hz in low bands, got {max_low_idx}");

        let mut analyzer_hi = SpectrumAnalyzer::new(1024);
        let hi: Vec<f32> = (0..1024)
            .map(|i| (TAU * 3600.0 * (i as f32 / sr)).sin() * 0.5)
            .collect();
        let (_, bands_hi) = analyzer_hi.analyze(&hi, sr);
        let max_hi_idx = bands_hi
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .map(|(i, _)| i)
            .unwrap();
        assert!(max_hi_idx >= 8, "expected 3600Hz in high bands, got {max_hi_idx}");
    }
}
