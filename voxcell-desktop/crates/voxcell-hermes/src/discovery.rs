use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use voxcell_core::GatewayProfile;

pub fn hermes_home_dir() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("HERMES_HOME") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    dirs::home_dir().map(|h| h.join(".hermes"))
}

pub fn collect_env_map() -> HashMap<String, String> {
    std::env::vars().collect()
}

pub fn discover_local_profiles(default_base_url: &str) -> Vec<GatewayProfile> {
    let mut profiles = vec![GatewayProfile {
        name: "default".to_string(),
        base_url: default_base_url.trim_end_matches('/').to_string(),
        active: true,
        online: false,
        model: None,
        source: "default".to_string(),
    }];

    let Some(home) = hermes_home_dir() else {
        return profiles;
    };
    let profiles_dir = home.join("profiles");
    let Ok(entries) = std::fs::read_dir(&profiles_dir) else {
        return profiles;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with('.') || name.eq_ignore_ascii_case("default") {
            continue;
        }
        let mut base_url = default_base_url.trim_end_matches('/').to_string();
        let cfg_path = path.join("gateway.json");
        if let Ok(raw) = std::fs::read_to_string(&cfg_path) {
            if let Ok(val) = serde_json::from_str::<Value>(&raw) {
                if let Some(u) = val.get("base_url").or_else(|| val.get("url")).and_then(|v| v.as_str()) {
                    base_url = u.trim_end_matches('/').to_string();
                }
            }
        }
        profiles.push(GatewayProfile {
            name: name.to_string(),
            base_url,
            active: false,
            online: false,
            model: None,
            source: "~/.hermes/profiles".to_string(),
        });
    }

    profiles
}
