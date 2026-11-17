use rune::Waker;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::runtime::Runtime as TokioRuntime;
use tokio::sync::mpsc as tokio_mpsc;
use voxcell_audio::AudioEngine;
use voxcell_core::canvas::CanvasDotData;
use voxcell_core::{
    ChannelMeta, HermesAgentSession, HermesCronJob, HermesGatewayInfo, HermesModelOption,
    HermesSkill, HermesToolset, SessionOrigin, SessionStatus, TerminalOutcome,
};
use voxcell_hermes::{
    GatewaySessionRecord, GatewayStreamEvent, HermesClient, ProfileGatewayConfig, StreamSignal,
};
use voxcell_store::VoxcellStore;
use voxcell_ui::{AppState, UiCommand};

pub enum BridgeEvent {
    GatewayProbe {
        info: HermesGatewayInfo,
        models: Vec<HermesModelOption>,
        profiles: Vec<voxcell_core::GatewayProfile>,
    },
    GatewaySessions(Vec<GatewaySessionRecord>),
    Skills(Vec<HermesSkill>),
    Toolsets(Vec<HermesToolset>),
    CronJobs(Vec<HermesCronJob>),
    Stream(GatewayStreamEvent),
    StatusNote(String),
}

pub struct DesktopBridge {
    tokio: TokioRuntime,
    store: Mutex<Option<VoxcellStore>>,
    client: Mutex<Arc<HermesClient>>,
    tx: std::sync::mpsc::Sender<BridgeEvent>,
    rx: Mutex<std::sync::mpsc::Receiver<BridgeEvent>>,
    waker: Waker,
    deepgram_key: Mutex<String>,
}

static BRIDGE: OnceLock<DesktopBridge> = OnceLock::new();

thread_local! {
    static AUDIO: std::cell::RefCell<Option<AudioEngine>> = const { std::cell::RefCell::new(None) };
}

pub fn init_bridge(state: &mut AppState, waker: Waker) {
    if BRIDGE.get().is_some() {
        return;
    }

    let store = VoxcellStore::open_default().ok();
    if let Some(ref s) = store {
        state.ui_config = s.load_ui_config();
        state.bg_settings = s.load_background_settings();
        state.voice = s.load_voice_settings();
        if let Ok(dots) = s.load_canvas_dots() {
            if !dots.is_empty() {
                state.dots = dots;
            }
        }
        state.has_hermes_key = s.get_secret("HERMES_API_KEY").is_some();
        state.has_deepgram_key = s.get_secret("DEEPGRAM_API_KEY").is_some();
        if let Some(url) = s.get_secret("HERMES_API_URL") {
            state.gateway_base_url = url.clone();
            state.gateway.base_url = url.clone();
            state.gateway_url_edit.replace_text(&url);
        }
    }

    let mut client = HermesClient::from_env();
    if let Some(ref s) = store {
        if let Some(key) = s.get_secret("HERMES_API_KEY") {
            client = HermesClient::new(ProfileGatewayConfig {
                base_url: state.gateway_base_url.clone(),
                profile: client.config.profile.clone(),
                api_key: key,
                route_prefix: client.config.route_prefix.clone(),
            });
        }
    }
    let deepgram_key = store
        .as_ref()
        .and_then(|s| s.get_secret("DEEPGRAM_API_KEY"))
        .or_else(|| std::env::var("DEEPGRAM_API_KEY").ok())
        .unwrap_or_default();
    if !deepgram_key.is_empty() {
        state.has_deepgram_key = true;
    }

    let tokio = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("tokio runtime");

    let audio = AudioEngine::init();
    audio.set_muted(state.voice.muted);
    AUDIO.with(|cell| {
        *cell.borrow_mut() = Some(audio);
    });

    let (tx, rx) = std::sync::mpsc::channel();
    let bridge = DesktopBridge {
        tokio,
        store: Mutex::new(store),
        client: Mutex::new(Arc::new(client)),
        tx,
        rx: Mutex::new(rx),
        waker,
        deepgram_key: Mutex::new(deepgram_key),
    };

    let _ = BRIDGE.set(bridge);
    trigger_gateway_refresh();
}

pub fn trigger_gateway_refresh() {
    let Some(b) = BRIDGE.get() else { return };
    let client = Arc::clone(&b.client.lock().unwrap());
    let tx = b.tx.clone();
    let waker = b.waker.clone();

    b.tokio.spawn(async move {
        let (info, models, profiles) = client.probe_gateway().await;
        let online = info.online;
        let _ = tx.send(BridgeEvent::GatewayProbe {
            info,
            models,
            profiles,
        });
        (waker)();

        if online {
            if let Ok(sessions) = client.fetch_sessions().await {
                let _ = tx.send(BridgeEvent::GatewaySessions(sessions));
                (waker)();
            }
            if let Ok(skills) = client.fetch_skills().await {
                let _ = tx.send(BridgeEvent::Skills(skills));
                (waker)();
            }
            if let Ok(toolsets) = client.fetch_toolsets().await {
                let _ = tx.send(BridgeEvent::Toolsets(toolsets));
                (waker)();
            }
            if let Ok(jobs) = client.fetch_jobs().await {
                let _ = tx.send(BridgeEvent::CronJobs(jobs));
                (waker)();
            }
        }
    });
}

pub fn poll_bridge(state: &mut AppState, dt: f32) -> bool {
    let Some(b) = BRIDGE.get() else {
        return false;
    };
    let mut changed = false;

    // 1. Drain UI commands queued by button/input handlers
    let cmds: Vec<UiCommand> = state.pending_commands.drain(..).collect();
    for cmd in cmds {
        changed = true;
        handle_command(b, state, cmd);
    }

    // 2. Step audio FFT engine
    AUDIO.with(|cell| {
        if let Some(audio) = cell.borrow().as_ref() {
            let snap = audio.step_snapshot(dt);
            if snap.is_speaking != state.audio.is_speaking
                || snap.is_listening != state.audio.is_listening
                || (snap.output_level - state.audio.output_level).abs() > 0.01
                || (snap.input_level - state.audio.input_level).abs() > 0.01
            {
                changed = true;
            }
            state.audio = snap;
        }
    });

    // 3. Drain incoming async Hermes/Gateway events
    if let Ok(rx) = b.rx.lock() {
        while let Ok(ev) = rx.try_recv() {
            changed = true;
            match ev {
                BridgeEvent::GatewayProbe {
                    info,
                    models,
                    profiles,
                } => {
                    state.gateway = info;
                    if !models.is_empty() {
                        state.models = models;
                    }
                    if !profiles.is_empty() {
                        state.gateway_profiles = profiles;
                    }
                }
                BridgeEvent::GatewaySessions(records) => {
                    apply_gateway_sessions(state, records);
                }
                BridgeEvent::Skills(skills) => {
                    state.skills = skills;
                }
                BridgeEvent::Toolsets(toolsets) => {
                    state.toolsets = toolsets;
                }
                BridgeEvent::CronJobs(jobs) => {
                    state.cron_jobs = jobs;
                }
                BridgeEvent::Stream(stream_ev) => {
                    maybe_notify(&stream_ev);
                    state.apply_hermes_event(stream_ev);
                }
                BridgeEvent::StatusNote(note) => {
                    state.cli_log.push(note);
                }
            }
        }
    }

    changed
}

fn maybe_notify(ev: &GatewayStreamEvent) {
    if !rune_notify::available() {
        return;
    }
    match ev {
        GatewayStreamEvent::Signal {
            signal: StreamSignal::ApprovalRequest(req),
            ..
        } => {
            let n = rune_notify::Notification::new(
                format!("voxcell-apr-{}", req.request_id),
                format!(
                    "Approval Needed: {}",
                    req.tool_name.as_deref().unwrap_or("Tool")
                ),
            )
            .body(req.summary.clone());
            rune_notify::post(&n);
        }
        GatewayStreamEvent::Completed { result, .. }
            if result.outcome == TerminalOutcome::Completed =>
        {
            let preview: String = result.output.chars().take(120).collect();
            if !preview.trim().is_empty() {
                let n = rune_notify::Notification::new("voxcell-turn-done", "Hermes Turn Complete")
                    .body(preview);
                rune_notify::post(&n);
            }
        }
        _ => {}
    }
}

fn apply_gateway_sessions(state: &mut AppState, records: Vec<GatewaySessionRecord>) {
    state.gateway_sessions = records
        .iter()
        .map(|r| HermesAgentSession {
            channel_id: format!("gw-{}", r.id),
            session_id: r.id.clone(),
            title: r.title.clone().unwrap_or_else(|| r.id.clone()),
            status: SessionStatus::Idle,
            model: r.model.clone().unwrap_or_else(|| state.gateway.model.clone()),
            source: r.source.clone().unwrap_or_else(|| "gateway".into()),
            last_message: r.last_message.clone().unwrap_or_default(),
            updated_at_ms: r.updated_at_ms,
            message_count: r.message_count,
        })
        .collect();

    for r in records {
        let ch_id = format!("gw-{}", r.id);
        if !state.channels.iter().any(|c| c.id == ch_id) {
            state.channels.push(ChannelMeta {
                id: ch_id,
                name: r.title.unwrap_or_else(|| r.id.clone()),
                category: "gateway".into(),
                description: r.last_message.unwrap_or_default(),
                session_id: r.id,
                unread: 0,
                origin: SessionOrigin::External,
                has_local_history: false,
                model: r.model,
                updated_at_ms: r.updated_at_ms,
            });
        }
    }
}

fn handle_command(b: &DesktopBridge, state: &AppState, cmd: UiCommand) {
    match cmd {
        UiCommand::SendPrompt {
            channel_id,
            session_id,
            prompt,
        } => {
            let client = Arc::clone(&b.client.lock().unwrap());
            let transport = state.gateway.active_transport;
            let model = state.selected_model.clone();
            let tx = b.tx.clone();
            let waker = b.waker.clone();

            b.tokio.spawn(async move {
                let (stx, mut srx) = tokio_mpsc::unbounded_channel();
                let waker_inner = waker.clone();
                let tx_fwd = tx.clone();
                let fwd = tokio::spawn(async move {
                    while let Some(ev) = srx.recv().await {
                        let _ = tx_fwd.send(BridgeEvent::Stream(ev));
                        (waker_inner)();
                    }
                });
                client
                    .stream_turn(
                        transport,
                        channel_id,
                        session_id.clone(),
                        format!("voxcell-{session_id}"),
                        prompt,
                        model,
                        stx,
                        move || (waker)(),
                    )
                    .await;
                let _ = fwd.await;
            });
        }
        UiCommand::ResolveApproval {
            run_id,
            request_id,
            execution_generation,
            decision,
            is_clarify,
        } => {
            let Some(rid) = run_id else { return };
            let client = Arc::clone(&b.client.lock().unwrap());
            let tx = b.tx.clone();
            let waker = b.waker.clone();
            b.tokio.spawn(async move {
                if let Err(e) = client
                    .submit_approval(&rid, &request_id, execution_generation, &decision, is_clarify)
                    .await
                {
                    let _ = tx.send(BridgeEvent::StatusNote(format!("[approval err] {e}")));
                    (waker)();
                }
            });
        }
        UiCommand::StopRun { run_id, .. } => {
            let client = Arc::clone(&b.client.lock().unwrap());
            b.tokio.spawn(async move {
                let _ = client.stop_run(&run_id).await;
            });
        }
        UiCommand::SteerRun { run_id, text } => {
            let client = Arc::clone(&b.client.lock().unwrap());
            b.tokio.spawn(async move {
                let _ = client.steer_run(&run_id, &text).await;
            });
        }
        UiCommand::ResetSession { session_id, .. } => {
            let client = Arc::clone(&b.client.lock().unwrap());
            b.tokio.spawn(async move {
                let _ = client.reset_session(&session_id).await;
            });
        }
        UiCommand::SwitchProfile { profile } => {
            let mut guard = b.client.lock().unwrap();
            let next = guard.with_profile(&profile, None);
            *guard = Arc::new(next);
            drop(guard);
            trigger_gateway_refresh();
        }
        UiCommand::SaveGatewaySettings {
            base_url,
            hermes_api_key,
            deepgram_api_key,
        } => {
            if let Ok(guard) = b.store.lock() {
                if let Some(ref s) = *guard {
                    if !base_url.is_empty() {
                        let _ = s.set_secret("HERMES_API_URL", &base_url);
                    }
                    if !hermes_api_key.is_empty() {
                        let _ = s.set_secret("HERMES_API_KEY", &hermes_api_key);
                    }
                    if !deepgram_api_key.is_empty() {
                        let _ = s.set_secret("DEEPGRAM_API_KEY", &deepgram_api_key);
                    }
                }
            }
            if !deepgram_api_key.is_empty() {
                *b.deepgram_key.lock().unwrap() = deepgram_api_key;
            }
            let mut cguard = b.client.lock().unwrap();
            let mut cfg = cguard.config.clone();
            if !base_url.is_empty() {
                cfg.base_url = base_url;
            }
            if !hermes_api_key.is_empty() {
                cfg.api_key = hermes_api_key;
            }
            *cguard = Arc::new(HermesClient::new(cfg));
        }
        UiCommand::RefreshGateway => {
            trigger_gateway_refresh();
        }
        UiCommand::ManageCronJob { job_id, action } => {
            let client = Arc::clone(&b.client.lock().unwrap());
            let tx = b.tx.clone();
            let waker = b.waker.clone();
            b.tokio.spawn(async move {
                let _ = client.job_action(&job_id, &action).await;
                if let Ok(jobs) = client.fetch_jobs().await {
                    let _ = tx.send(BridgeEvent::CronJobs(jobs));
                    (waker)();
                }
            });
        }
        UiCommand::ToggleMic(on) => {
            AUDIO.with(|cell| {
                if let Some(audio) = cell.borrow().as_ref() {
                    audio.set_listening(on);
                }
            });
        }
        UiCommand::ToggleMute(muted) => {
            AUDIO.with(|cell| {
                if let Some(audio) = cell.borrow().as_ref() {
                    audio.set_muted(muted);
                    if muted {
                        audio.stop_playback();
                    }
                }
            });
        }
        UiCommand::SpeakText(txt) => {
            let key = b.deepgram_key.lock().unwrap().clone();
            let model = state.voice.tts_voice.clone();
            let _guard = b.tokio.enter();
            AUDIO.with(|cell| {
                if let Some(audio) = cell.borrow().as_ref() {
                    audio.speak_text_async(key, model, txt);
                }
            });
        }
        UiCommand::TogglePhoneWindow(_) => {
            // Handled in UI overlay & optional secondary window
        }
        UiCommand::PersistUiConfig => {
            if let Ok(guard) = b.store.lock() {
                if let Some(ref s) = *guard {
                    let _ = s.save_ui_config(&state.ui_config);
                }
            }
        }
        UiCommand::PersistBackgroundSettings => {
            if let Ok(guard) = b.store.lock() {
                if let Some(ref s) = *guard {
                    let _ = s.save_background_settings(&state.bg_settings);
                }
            }
        }
        UiCommand::PersistVoiceSettings => {
            if let Ok(guard) = b.store.lock() {
                if let Some(ref s) = *guard {
                    let _ = s.save_voice_settings(&state.voice);
                }
            }
        }
        UiCommand::PersistDots => {
            if let Ok(mut guard) = b.store.lock() {
                if let Some(ref mut s) = *guard {
                    let dots: Vec<CanvasDotData> = state.dots.clone();
                    let _ = s.save_canvas_dots(&dots);
                }
            }
        }
        UiCommand::DismissChannel(ch_id) => {
            if let Ok(guard) = b.store.lock() {
                if let Some(ref s) = *guard {
                    let _ = s.dismiss_channel(&ch_id);
                }
            }
        }
    }
}
