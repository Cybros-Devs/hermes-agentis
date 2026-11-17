use crate::fft::SpectrumAnalyzer;
use crate::tts::{DecodedPcm, synthesize_deepgram_tts};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use reqwest::Client;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug)]
pub struct AudioSnapshot {
    pub has_output_device: bool,
    pub has_input_device: bool,
    pub is_speaking: bool,
    pub is_listening: bool,
    pub input_level: f32,
    pub output_level: f32,
    pub bands: [f32; 12],
}

struct SharedAudioBuffers {
    playback_queue: VecDeque<f32>,
    playback_sample_rate: u32,
    mic_recent: VecDeque<f32>,
    mic_sample_rate: u32,
    listening: bool,
    muted: bool,
    analyzer: SpectrumAnalyzer,
    last_output_level: f32,
    last_input_level: f32,
    last_bands: [f32; 12],
}

pub struct AudioEngine {
    shared: Arc<Mutex<SharedAudioBuffers>>,
    _output_stream: Option<cpal::Stream>,
    _input_stream: Option<cpal::Stream>,
    has_output_device: bool,
    has_input_device: bool,
    http: Client,
}

impl AudioEngine {
    pub fn init() -> Self {
        let shared = Arc::new(Mutex::new(SharedAudioBuffers {
            playback_queue: VecDeque::with_capacity(48_000),
            playback_sample_rate: 24_000,
            mic_recent: VecDeque::with_capacity(4096),
            mic_sample_rate: 16_000,
            listening: false,
            muted: false,
            analyzer: SpectrumAnalyzer::new(1024),
            last_output_level: 0.0,
            last_input_level: 0.0,
            last_bands: [0.0; 12],
        }));

        let host = cpal::default_host();
        let (output_stream, has_output_device) = Self::try_open_output(&host, &shared);
        let (input_stream, has_input_device) = Self::try_open_input(&host, &shared);

        Self {
            shared,
            _output_stream: output_stream,
            _input_stream: input_stream,
            has_output_device,
            has_input_device,
            http: Client::new(),
        }
    }

    fn try_open_output(
        host: &cpal::Host,
        shared: &Arc<Mutex<SharedAudioBuffers>>,
    ) -> (Option<cpal::Stream>, bool) {
        let Some(dev) = host.default_output_device() else {
            return (None, false);
        };
        let Ok(cfg) = dev.default_output_config() else {
            return (None, false);
        };
        let channels = cfg.channels() as usize;
        let sr = cfg.sample_rate().0;
        let shared_ref = Arc::clone(shared);
        if let Ok(mut guard) = shared_ref.lock() {
            guard.playback_sample_rate = sr;
        }
        let stream = dev.build_output_stream(
            &cfg.into(),
            move |data: &mut [f32], _| {
                if let Ok(mut guard) = shared_ref.lock() {
                    let muted = guard.muted;
                    for frame in data.chunks_mut(channels.max(1)) {
                        let sample = guard.playback_queue.pop_front().unwrap_or(0.0);
                        let out = if muted { 0.0 } else { sample };
                        for ch in frame {
                            *ch = out;
                        }
                    }
                }
            },
            |_| {},
            None,
        );
        match stream {
            Ok(s) => {
                let _ = s.play();
                (Some(s), true)
            }
            Err(_) => (None, false),
        }
    }

    fn try_open_input(
        host: &cpal::Host,
        shared: &Arc<Mutex<SharedAudioBuffers>>,
    ) -> (Option<cpal::Stream>, bool) {
        let Some(dev) = host.default_input_device() else {
            return (None, false);
        };
        let Ok(cfg) = dev.default_input_config() else {
            return (None, false);
        };
        let channels = cfg.channels() as usize;
        let sr = cfg.sample_rate().0;
        let shared_ref = Arc::clone(shared);
        if let Ok(mut guard) = shared_ref.lock() {
            guard.mic_sample_rate = sr;
        }
        let stream = dev.build_input_stream(
            &cfg.into(),
            move |data: &[f32], _| {
                if let Ok(mut guard) = shared_ref.lock() {
                    if !guard.listening {
                        return;
                    }
                    for frame in data.chunks(channels.max(1)) {
                        let mono = frame.iter().copied().sum::<f32>() / channels.max(1) as f32;
                        if guard.mic_recent.len() >= 2048 {
                            guard.mic_recent.pop_front();
                        }
                        guard.mic_recent.push_back(mono);
                    }
                }
            },
            |_| {},
            None,
        );
        match stream {
            Ok(s) => {
                let _ = s.play();
                (Some(s), true)
            }
            Err(_) => (None, false),
        }
    }

    pub fn set_muted(&self, muted: bool) {
        if let Ok(mut g) = self.shared.lock() {
            g.muted = muted;
        }
    }

    pub fn set_listening(&self, listening: bool) {
        if let Ok(mut g) = self.shared.lock() {
            g.listening = listening;
            if !listening {
                g.mic_recent.clear();
            }
        }
    }

    pub fn enqueue_pcm(&self, pcm: DecodedPcm) {
        if let Ok(mut g) = self.shared.lock() {
            let target_sr = g.playback_sample_rate.max(8000);
            if pcm.sample_rate == target_sr || pcm.samples.is_empty() {
                g.playback_queue.extend(pcm.samples);
            } else {
                // Linear resample to device output rate
                let ratio = pcm.sample_rate as f32 / target_sr as f32;
                let out_len = ((pcm.samples.len() as f32) / ratio).ceil() as usize;
                for i in 0..out_len {
                    let src_pos = i as f32 * ratio;
                    let idx0 = (src_pos.floor() as usize).min(pcm.samples.len() - 1);
                    let idx1 = (idx0 + 1).min(pcm.samples.len() - 1);
                    let frac = src_pos - idx0 as f32;
                    let val = pcm.samples[idx0] * (1.0 - frac) + pcm.samples[idx1] * frac;
                    g.playback_queue.push_back(val);
                }
            }
        }
    }

    pub fn stop_playback(&self) {
        if let Ok(mut g) = self.shared.lock() {
            g.playback_queue.clear();
            g.last_output_level = 0.0;
        }
    }

    pub fn speak_text_async(&self, api_key: String, model: String, text: String) {
        let http = self.http.clone();
        let shared = Arc::clone(&self.shared);
        tokio::spawn(async move {
            match synthesize_deepgram_tts(&http, &api_key, &model, &text).await {
                Ok(pcm) => {
                    if let Ok(mut g) = shared.lock() {
                        g.playback_queue.extend(pcm.samples);
                    }
                }
                Err(_) => {
                    // Graceful synthetic cadence envelope when offline / no Deepgram key
                    let words = text.split_whitespace().count().clamp(2, 24);
                    let sr = 24_000usize;
                    let total = words * 4_200;
                    let mut synth = Vec::with_capacity(total);
                    for i in 0..total {
                        let t = i as f32 / sr as f32;
                        let syll = ((t * 5.2).sin().abs()).powf(0.6);
                        let carrier = (t * std::f32::consts::TAU * 220.0).sin() * 0.28;
                        synth.push(carrier * syll);
                    }
                    if let Ok(mut g) = shared.lock() {
                        g.playback_queue.extend(synth);
                    }
                }
            }
        });
    }

    pub fn step_snapshot(&self, dt: f32) -> AudioSnapshot {
        let Ok(mut g) = self.shared.lock() else {
            return AudioSnapshot {
                has_output_device: self.has_output_device,
                has_input_device: self.has_input_device,
                is_speaking: false,
                is_listening: false,
                input_level: 0.0,
                output_level: 0.0,
                bands: [0.0; 12],
            };
        };

        // Drain virtual playback buffer when running without physical hardware device
        let sr = g.playback_sample_rate.max(8000) as f32;
        if !self.has_output_device && !g.playback_queue.is_empty() {
            let drain = ((dt * sr).round() as usize).min(g.playback_queue.len());
            for _ in 0..drain {
                g.playback_queue.pop_front();
            }
        }

        let is_speaking = !g.playback_queue.is_empty();
        let is_listening = g.listening;

        if is_speaking {
            let window_len = g.playback_queue.len().min(1024);
            let slice: Vec<f32> = g.playback_queue.iter().take(window_len).copied().collect();
            let (amp, bands) = g.analyzer.analyze(&slice, sr);
            g.last_output_level = if g.muted { amp * 0.65 } else { amp };
            g.last_bands = bands;
        } else {
            g.last_output_level *= 0.82;
            if g.last_output_level < 0.01 {
                g.last_output_level = 0.0;
            }
        }

        if is_listening && !g.mic_recent.is_empty() {
            let mic_sr = g.mic_sample_rate.max(8000) as f32;
            let slice: Vec<f32> = g.mic_recent.iter().copied().collect();
            let (amp, bands) = g.analyzer.analyze(&slice, mic_sr);
            g.last_input_level = amp;
            if !is_speaking {
                g.last_bands = bands;
            }
        } else {
            g.last_input_level *= 0.82;
            if !is_speaking {
                for b in &mut g.last_bands {
                    *b *= 0.88;
                }
            }
        }

        AudioSnapshot {
            has_output_device: self.has_output_device,
            has_input_device: self.has_input_device,
            is_speaking,
            is_listening,
            input_level: g.last_input_level,
            output_level: g.last_output_level,
            bands: g.last_bands,
        }
    }
}
