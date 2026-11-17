use reqwest::Client;

#[derive(Clone, Debug)]
pub struct DecodedPcm {
    pub sample_rate: u32,
    pub samples: Vec<f32>,
}

pub fn decode_wav_or_linear16_pcm(bytes: &[u8], fallback_sample_rate: u32) -> DecodedPcm {
    if bytes.len() >= 44 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        let mut pos = 12usize;
        let mut sample_rate = fallback_sample_rate;
        let mut channels = 1u16;
        let mut bits_per_sample = 16u16;
        let mut data_slice: Option<&[u8]> = None;

        while pos + 8 <= bytes.len() {
            let id = &bytes[pos..pos + 4];
            let chunk_len = u32::from_le_bytes([
                bytes[pos + 4],
                bytes[pos + 5],
                bytes[pos + 6],
                bytes[pos + 7],
            ]) as usize;
            let body_start = pos + 8;
            let body_end = body_start.saturating_add(chunk_len).min(bytes.len());
            if id == b"fmt " && body_end - body_start >= 16 {
                channels = u16::from_le_bytes([bytes[body_start + 2], bytes[body_start + 3]]);
                sample_rate = u32::from_le_bytes([
                    bytes[body_start + 4],
                    bytes[body_start + 5],
                    bytes[body_start + 6],
                    bytes[body_start + 7],
                ]);
                bits_per_sample =
                    u16::from_le_bytes([bytes[body_start + 14], bytes[body_start + 15]]);
            } else if id == b"data" {
                data_slice = Some(&bytes[body_start..body_end]);
                break;
            }
            pos = body_end + (chunk_len & 1);
        }

        if let Some(raw) = data_slice {
            return DecodedPcm {
                sample_rate: sample_rate.max(8000),
                samples: pcm_i16_to_mono_f32(raw, channels.max(1) as usize, bits_per_sample),
            };
        }
    }

    DecodedPcm {
        sample_rate: fallback_sample_rate.max(8000),
        samples: pcm_i16_to_mono_f32(bytes, 1, 16),
    }
}

fn pcm_i16_to_mono_f32(raw: &[u8], channels: usize, bits: u16) -> Vec<f32> {
    if bits != 16 {
        return raw.iter().map(|&b| (b as f32 - 128.0) / 128.0).collect();
    }
    let frame_bytes = 2 * channels;
    let mut out = Vec::with_capacity(raw.len() / frame_bytes.max(2));
    for frame in raw.chunks_exact(frame_bytes) {
        let mut sum = 0.0_f32;
        for ch in 0..channels {
            let s = i16::from_le_bytes([frame[ch * 2], frame[ch * 2 + 1]]) as f32 / 32768.0;
            sum += s;
        }
        out.push(sum / channels as f32);
    }
    out
}

pub async fn synthesize_deepgram_tts(
    http: &Client,
    api_key: &str,
    model: &str,
    text: &str,
) -> Result<DecodedPcm, String> {
    if api_key.trim().is_empty() {
        return Err("DEEPGRAM_API_KEY not configured".into());
    }
    let clean_text = text.trim();
    if clean_text.is_empty() {
        return Err("empty TTS text".into());
    }
    let model_name = if model.trim().is_empty() {
        "aura-2-thalia-en"
    } else {
        model.trim()
    };
    let url = format!(
        "https://api.deepgram.com/v1/speak?model={model_name}&encoding=linear16&sample_rate=24000"
    );
    let resp = http
        .post(&url)
        .header("Authorization", format!("Token {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .json(&serde_json_lite_body(clean_text))
        .send()
        .await
        .map_err(|e| format!("deepgram TTS request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("deepgram TTS HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(decode_wav_or_linear16_pcm(&bytes, 24_000))
}

fn serde_json_lite_body(text: &str) -> String {
    let escaped = text
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', " ");
    format!("{{\"text\":\"{escaped}\"}}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_wav_header_and_i16_samples() {
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&40u32.to_le_bytes());
        wav.extend_from_slice(b"WAVE");
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
        wav.extend_from_slice(&1u16.to_le_bytes()); // mono
        wav.extend_from_slice(&24000u32.to_le_bytes());
        wav.extend_from_slice(&48000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&4u32.to_le_bytes());
        wav.extend_from_slice(&16384i16.to_le_bytes());
        wav.extend_from_slice(&(-16384i16).to_le_bytes());

        let pcm = decode_wav_or_linear16_pcm(&wav, 16000);
        assert_eq!(pcm.sample_rate, 24000);
        assert_eq!(pcm.samples.len(), 2);
        assert!((pcm.samples[0] - 0.5).abs() < 0.01);
        assert!((pcm.samples[1] + 0.5).abs() < 0.01);
    }
}
