# Voxcell Desktop — Technical Specification on RUNE (`anomalyco/rune`)

**Target Product:** Voxcell (`hermes-agentis`) — Voice-First & Spatial Desktop Client for Hermes Agent  
**Target UI Framework:** [RUNE (`anomalyco/rune`)](https://github.com/anomalyco/rune) — Native GPU-rendered Rust UI framework (`wgpu`, `Taffy`, `Parley`/`HarfRust`, `rune-motion`, headless agent runtime)  
**Target Platforms:** macOS (Apple Silicon / Intel via Metal), Windows (DX12/Vulkan), Linux (Vulkan / Wayland & X11)  
**Document Status:** Draft Engineering & Architecture Spec  

---

## 1. Executive Summary & Rationale

Voxcell is currently a React 19 + Vite + Express (`server.ts`) web application whose core value proposition is **"Voice in. Character out."** — pairing a live Hermes Agent gateway client with real-time, audio-synced Braille halftone character animation (`AsciiPortraitCanvas`), spatial session management (`BrailleSessionsCanvas`), collapsible agent reasoning traces (`ThreadTraceTree`), an interactive CLI (`CommandTerminal`), and natural-language UI customization (`UiCustomizerStudio`).

Porting Voxcell from Browser + Local Express Proxy onto **`anomalyco/rune`** turns it into a **single-binary, 120 Hz native desktop client** while solving the key limitations of the web architecture:

1. **Direct GPU Halftone & Shader Rendering (`wgpu` / `rune-fx`):** Eliminates CPU-bound `ImageData` / `putImageData` dot rasterization (`brailleCanvasRaster.ts`) and CSS blur compromises by rendering all 5 tonal dot buckets, 8×8 Bayer dither patterns, phosphor corona bloom, 12-band FFT horizon waves, and glass backdrop shaders directly on the GPU at 120 Hz.
2. **Zero-Proxy Native Networking:** Replaces the `server.ts` Express middleware layer with a native Rust async client (`tokio` + `reqwest`) speaking directly to Hermes Agent (`127.0.0.1:8642` or remote TLS endpoints), eliminating CORS constraints, SSE buffering hops, and Node/TSX runtime overhead.
3. **Deterministic Low-Latency Audio (`cpal` + `rustfft`):** Replaces browser-gated `SpeechRecognition` and Web Audio `AnalyserNode` with always-available native microphone capture, hardware AEC/VAD, local or streaming STT, Deepgram Aura-2 PCM streaming, and lock-free 12-band FFT viseme driving.
4. **Native Desktop Form Factors:** Enables OS keychain token storage, `~/.hermes/` profile auto-discovery, global push-to-talk shortcuts, a menu-bar/system-tray agent monitor, a floating always-on-top **Phone Video Widget** window, and OS approval notifications via `rune-notify`.
5. **Headless Agent Verification Parity:** RUNE's built-in headless runtime (deterministic PNG capture, AccessKit element tree dumps, and scripted input) natively replaces our Playwright + `tools/blueprint/` uphill evaluation loop inside `cargo test` / CI.

---

## 2. How `anomalyco/rune` Maps to Voxcell

RUNE (built in Rust by Anomaly for OpenCode's desktop client) provides an unbranded, token-driven native UI stack rather than wrapping OS webviews or native platform widgets:

| RUNE Subsystem / Crate | Role in RUNE | Voxcell Web Equivalent Replaced | Desktop Usage in Voxcell |
|---|---|---|---|
| **`rune` / `rune-core`** | View tree, reactive state, `winit` shell, `wgpu` SDF uber-quad renderer, AccessKit tree | React 19 + DOM + Tailwind CSS | Root multi-pane shell, `Home`, `Canvas`, `Thread`, `Queue`, `CLI`, `Settings` |
| **`Taffy` (in `rune-core`)** | Flexbox & CSS Grid layout engine | CSS Flexbox / Grid (`App.tsx`, `SidebarWorkspace.tsx`) | `296px` responsive sidebar + fluid main workspace + floating widget bounds |
| **`Parley` + `HarfRust` + `skrifa` + `fontique`** | Text shaping, subpixel font smoothing, glyph atlas | Browser DOM font stack (`Plus Jakarta Sans`, `Archivo`, `JetBrains Mono`) | Crisp monospace CLI/traces, tabular timers, wordmark, multi-script chat markdown |
| **`rune-motion`** | Render-thread analytic springs & tweens (no main-thread tree rebuilds) | `motion`, `motionChoreography.ts`, CSS keyframes | Tab underline slides, sidebar card spring transitions, collapsible trace trees, canvas node momentum |
| **`rune-kit`** | Token-driven UI primitives (OpenCode aesthetic) | `src/components/ui/*` (`StatusPulse`, `StaggerItem`, modals, tabs) | Theme tokens mapped to Voxcell Abyss Green (`#050C0A`), Panel (`#0A1410`), Emerald (`#34D399`), Amber (`#F59E0B`), Rose (`#F43F5E`) |
| **`rune-fx` & `rune-light`** | Custom `wgpu` shader passes & real-time UI lighting | `GlassBackgroundSystem`, canvas `radialGradient` halos, `brailleCanvasRaster` bloom | 7 ambient backdrop shaders, reactive emerald/amber/rose portrait halos, halftone phosphor bloom |
| **`rune-notify`** | Cross-platform native OS notifications | Web UI banners & `Needs attention` sidebar strip | Background task completion & `/v1/runs/{id}/approval` OS alerts with inline actions |
| **`rune-perf` & `rune-knobs`** | Frame-time telemetry & live parameter tuning | `tools/blueprint/eval-uphill.ts` & dev sliders | Live bloom/dot-profile/spring-damping tuning & 120 Hz frame budget verification |
| **RUNE Headless Runtime** | Offscreen `wgpu` PNG export, AccessKit tree dump, scripted input | `playwright-cli` + `capture-character.ts` + `eval-uphill.ts` | CI visual regression & frame-diff uphill scoring without Chromium |

---

## 3. Cargo Workspace & Module Architecture

Create a clean Cargo workspace (`voxcell-desktop/`) separated into pure logic/protocol/audio crates and RUNE UI crates so core engines remain unit-testable in milliseconds without a GPU or window server:

```text
voxcell-desktop/
├── Cargo.toml                  # Workspace manifest
├── assets/
│   ├── fonts/                  # JetBrainsMono, PlusJakartaSans, Archivo
│   └── character/
│       ├── portrait_base.png   # Copied from public/assets/aistudio/image_9fdb5ec4.png
│       └── sprite_sheet.png    # Copied from public/assets/aistudio/image_f0b5dc2e.png
└── crates/
    ├── voxcell-core/           # Pure state machines, types, CLI parser, task insights, UI patch engine
    ├── voxcell-hermes/         # Direct Hermes Agent HTTP/SSE protocol client, retry, profile discovery
    ├── voxcell-halftone/       # Halftone portrait, 3D ASCII, Braille field/shapes/horizon & sprite rig math
    ├── voxcell-audio/          # Mic capture (cpal), VAD, STT, Deepgram Aura-2 TTS, 12-band FFT viseme stream
    ├── voxcell-store/          # SQLite + OS Keychain persistence (sessions, canvas layout, prefs, secrets)
    ├── voxcell-ui/             # RUNE views, rune-kit theme tokens, custom wgpu halftone/shader nodes
    └── voxcell-app/            # Binary entry point: winit windows, tray icon, global hotkeys, headless CLI
```

### 3.1 Crate Responsibilities & Mapping from Existing TypeScript Engines

Every TypeScript engine under `src/utils/` (all 20 tested modules) maps directly to pure Rust modules with 1:1 behavioral parity:

| Existing TS Module (`src/utils/`) | Target Rust Crate / Module | Notes |
|---|---|---|
| `hermesProtocol.ts`, `types/hermes.ts` | `voxcell-hermes::protocol` | Capability probe (`/v1/capabilities`), `/p/<profile>/` URL builder, SSE parsers (`RunsEventStreamParser`, `SessionChatStreamParser`, `ChatCompletionsStreamParser`), `Idempotency-Key`, `429` retry |
| `taskInsights.ts` | `voxcell-core::tasks` | Step progress resolution, `deriveTurnTaskTitle`, active/completed/paused rollups |
| `sidebarCharacterState.ts` | `voxcell-core::sidebar_char` | Synchronized mood/eye/viseme/energy/tone/status derivation + cursor look vector |
| `sidebarSessions.ts` | `voxcell-core::sessions` | Workspace vs Gateway session scoping, search filtering, active work badges |
| `canvasSessions.ts`, `homeSession.ts` | `voxcell-core::canvas` | Dot coordinates, Constellation / Orbit / Grid formations, pin storage, session slugging |
| `threadTrace.ts`, `threadScroll.ts`, `threadMinimap.ts` | `voxcell-core::thread` | Collapsible reasoning/tool/subagent tree grouping, smart bottom-anchor scroll math, turn minimap |
| `cliEngine.ts` | `voxcell-core::cli` | Slash commands (`/gateway`, `/skills`, `/toolsets`, `/cron`, `/sessions`, `/tasks`, `/resume`, `/theme`) |
| `uiCustomization.ts`, `textDecodeEngine.ts` | `voxcell-core::ui_config` | Sanitized `UiCustomizationPatch`, natural-language UI intent parser, Braille frontier decode |
| `asciiPortraitEngine.ts`, `asciiCharacter.ts`, `portraitLoadingEngine.ts` | `voxcell-halftone::portrait` | 12-frame sprite bank sampler, natural asymmetric blink curve, saccades, 2.5D head turn, hair lag, tap impulse, materialize wipe |
| `brailleCanvasRaster.ts`, `brailleFieldEngine.ts`, `brailleHorizon` | `voxcell-halftone::raster_gpu` | 8×8 Bayer dither + 5 tonal tiers + GPU instanced circle/dot buffer (`wgpu`) |
| `brailleShapesEngine.ts`, `brailleIdleLoops.ts`, `ascii3dEngine.ts` | `voxcell-halftone::shapes` | 9 shape engines, 36 idle loops, 5 ASCII 3D viewport modes |

---

## 4. Visual & Design System Specification (RUNE Theme Tokens)

All UI surfaces use a dedicated **Voxcell `rune-kit` Theme** matching `branding/brand.md` and `src/index.css`:

### 4.1 Color Tokens

| Token | Hex / RGBA | Role |
|---|---|---|
| `bg.abyss` | `#050C0A` | Primary window canvas & backdrop field |
| `bg.panel` | `#0A1410` (92% alpha over shader) | Sidebar shell, modal cards, CLI container |
| `bg.elevated` | `#0F1E18` | Hovered session rows, active task telemetry tray |
| `border.subtle` | `rgba(255, 255, 255, 0.08)` | Hairline `1px` dividers & card strokes |
| `border.active` | `rgba(52, 211, 153, 0.35)` | Active session / focused composer border |
| `text.primary` | `#ECF3F0` | Headings, active session titles, user prompts |
| `text.secondary` | `rgba(209, 250, 229, 0.72)` | Model/profile lines, sub-labels |
| `text.muted` | `rgba(209, 250, 229, 0.52)` | Timestamps, secondary metadata |
| `accent.emerald` | `#34D399` / highlight `#A7F3D0` | Live/online, speaking/listening glow, active tab indicator |
| `accent.amber` | `#F59E0B` / `#FCD34D` | `working` / `thinking` tasks, progress fill, pending approvals |
| `accent.rose` | `#F43F5E` / `#FDA4AF` | `offline` gateway, `alert` state, cancel/error states |

### 4.2 Typography & Layout Rules

- **Sans UI Font:** `Plus Jakarta Sans` (fallback `Inter` / system UI), `12px–14px`, weights `400 / 500 / 600`.
- **Display / Headings:** `Archivo` `600 / 700`.
- **Monospace:** `JetBrains Mono` `400 / 500 / 600` (`tabular-nums` enforced on elapsed clocks, `1/4` step counters, session counts, FFT readouts, and CLI output).
- **Zero-Pill Restraint & High Contrast:** Use `rounded-lg` (`8px`) / `rounded-xl` (`12px`) / `rounded-2xl` (`16px`) panels rather than pill-button clutter; respect user reduced-motion preferences across both `rune-motion` springs and `voxcell-halftone` motion loops.

---

## 5. GPU Rendering Pipeline (`voxcell-halftone` on `wgpu`)

Rather than copying CPU-rendered `ImageData` bitmaps every frame, the RUNE app registers custom **`wgpu` Render Nodes** inside RUNE's render graph so character animation, horizon waveforms, and glass shaders execute at native 120 Hz with sub-millisecond CPU time:

### 5.1 Custom `wgpu` Instanced Halftone Dot Pass
1. **Asset Pre-bake on Startup:** Load `portrait_base.png` and `sprite_sheet.png` (4×3 grid, 12 poses) into lightweight normalized luminance/edge lookup grids (`160×160` f32 buffers).
2. **Per-Frame Rig Step (`120 Hz` or throttled `30 Hz` when unfocused/minimized):**
   - `PortraitAnimator::step(dt, mood, viseme, eye_state, energy, look_target)` computes blink weight, saccade offset, head yaw/pitch, hair lag, and tap impulse using `rune-motion` analytic springs.
   - Outputs an instanced dot vertex buffer `DotInstance { pos_xy: [f32; 2], radius: f32, tier: u8, alpha: f32 }` directly from the 5-tier Bayer halftone grid (`hero`, `stage`, `sidebar`, `thumb`, `canvas_shape`).
3. **Fragment Shader:**
   - **Pass 1 (Optional Phosphor Corona):** Draws soft quadratic falloff glow around tiers 3 & 4 when `bloom > 0.04`, modulated by mode (`emerald` voice, `amber` working, `rose` alert/offline, or custom `tint_hex`).
   - **Pass 2 (Crisp SDF Dot Core):** Analytic anti-aliased disc SDF (`smoothstep` parameterized by `dotProfile`: `crisp | balanced | phosphor`), zero texture aliasing at any DPI scaling factor (`1.0x`, `2.0x` Retina, `1.5x` Windows).

### 5.2 Shared Custom Render Surfaces
- **`AsciiPortraitCanvas` Variants:**
  - `stage` (Home view: `230–540px` responsive 12:11 aspect)
  - `hero` (Phone widget / Onboarding: `216×198px`)
  - `sidebar` (Left sidebar companion: `72×66px`, cursor-reactive within `sidebar-character-card`)
  - `thumb` (Compact bar / tray popover: `42×42px`)
- **`BrailleHorizonCanvas`:** Single instanced `wgpu` pass driven by the 12-band FFT spectrum from `voxcell-audio` + pointer ripple vector.
- **`GlassBackgroundSystem`:** 7 built-in fragment shaders rendered beneath UI layers at capped fill-rate so foreground typography stays crisp and readable.

---

## 6. Native Audio & Voice Pipeline (`voxcell-audio`)

The desktop app removes browser `SpeechRecognition` inconsistencies (platform-dependent Chrome-only APIs, permission resets, lack of push-to-talk) via a dedicated Rust audio subsystem:

```text
Mic Input (cpal, 16kHz/48kHz)
   ├──▶ Lock-free Ring Buffer ──▶ rustfft (12 log-spaced bands + RMS input_level) ──▶ UI + Portrait
   └──▶ Silero / WebRTC VAD ──▶ STT Provider (Deepgram Flux WS | Local whisper.cpp | OS Dictation)
                                       │
                                       ▼ (final transcript)
                            voxcell-hermes Turn Dispatch
                                       │
                                       ▼ (reply text chunks)
TTS Provider (Deepgram Aura-2 linear16 stream | OS Speech API fallback)
   └──▶ Playback Buffer (cpal) ──▶ Real-time Output Analyser (12 bands + amplitude)
                                       │
                                       ▼
                           amplitude_to_viseme() + lip-sync @ 120 Hz
```

### 6.1 Key Desktop Audio Requirements
- **Voice Activation & Push-to-Talk:** Support both continuous VAD hands-free mode and a global desktop hotkey (default `Cmd+Shift+Space` / `Ctrl+Shift+Space`) usable even when Voxcell is in the background.
- **Echo & Self-Interruption Handling (Barge-In):** Hardware AEC where supported plus automatic TTS ducking/cancellation if the user speaks or taps `Stop` mid-utterance.
- **Sentence-Chunked Streaming TTS:** Stream sentence boundaries to `/api/hermes/tts` (or direct Deepgram Aura-2 WebSocket) as SSE deltas arrive rather than waiting for full turn completion, reducing time-to-first-voice below `600ms`.

---

## 7. Direct Hermes Agent Protocol & Local Persistence

### 7.1 `voxcell-hermes` Client (Replacing `server.ts`)
Retains full compatibility with the Hermes Agent gateway protocol currently implemented in `server.ts` and `src/utils/hermesProtocol.ts`:
- **Auto-Discovery:** Probes configured `HERMES_API_URL` (default `http://127.0.0.1:8642`) and inspects `~/.hermes/` local profiles (`default` or named `/p/<profile>/`) so local Hermes users connect with zero manual proxy setup.
- **Capability Negotiation:** Fetches `GET /v1/capabilities`, `GET /api/model/options`, and `GET /health` to pick transport (`runs` → `/v1/runs`, `session_stream` → `/api/sessions/{id}/chat/stream`, or `chat_completions` → `/v1/chat/completions`).
- **Headers & Resilience:** Sends `X-Hermes-Session-Id`, sanitized `X-Hermes-Session-Key`, and `Idempotency-Key`; retries HTTP `429` with exponential jitter; streams reasoning (`reasoning_content`), commentary, tool calls, subagent spawns, and `ui_patch` blocks live into `voxcell-core`.
- **Full Resource Parity:** Supports `/v1/runs/{id}/approval`, `/v1/runs/{id}/clarify`, `/v1/runs/{id}/steer`, `/v1/runs/{id}/stop`, `/v1/skills`, `/v1/toolsets`, `/api/sessions` (reset/delete/history), and `/api/jobs` (create/patch/pause/resume/run/delete).

### 7.2 `voxcell-store` (SQLite + OS Keychain)
- **Secrets (`keyring` crate):** Stores `HERMES_API_KEY`, `HERMES_PROFILE_API_KEY`, and `DEEPGRAM_API_KEY` in macOS Keychain, Windows Credential Manager, or Linux Secret Service (`libsecret`). Never writes plaintext tokens into SQLite or UI logs.
- **Local SQLite (`rusqlite` / `sqlx` in OS app-data dir):**
  - `canvas_sessions` & `canvas_pins` (replaces `duet.canvasSessions.v2` & `duet.canvasPins.v1`)
  - `dismissed_channels` (replaces `duet.dismissedCanvasIds.v1`)
  - `ui_config` & `background_settings` (replaces localStorage theme/backdrop prefs)
  - `onboarding_state` & local window geometry

---

## 8. Desktop Windowing, Surfaces & Native Capabilities (`voxcell-app`)

### 8.1 Primary Workspace Window (`1280×800` default, min `780×560`)
- **Custom Titlebar & Traffic-Light Integration:** Full-bleed dark `#050C0A` header integrating view tabs (`Home`, `Canvas`, `Thread`, `Queue`, `CLI`), Audio Mute toggle, **Pop-out Phone Widget** button, and **Settings** trigger.
- **Left Sidebar (`296px`, collapsible or dockable left/right via `UiCustomizationConfig`):**
  - Reactive `SidebarWorkspace` companion card (`72×66px` live halftone character tracking cursor over the card, instant mood transitions to amber `working` / alert `attention` / emerald `speaking` & `listening` / dimmed `offline`, active task telemetry tray with GPU progress bar, deduplicated approval bar).
  - Pinned `Needs attention` queue + Scoped `Sessions` / `Gateway` tabs + filter search + Pin-to-Canvas action.
- **Main Stage Views:**
  - `Home`: Centered `stage` halftone character + `BrailleHorizonCanvas` + unified voice/text composer.
  - `Canvas`: Hardware-accelerated pan/zoom spatial canvas with 9 shape engines, Formation presets (`Constellation`, `Orbit`, `Grid`), inline prompt inputs, and right-click context menus.
  - `Thread`: High-speed virtualized list (`Parley` text shaping) with collapsible `ThreadTraceTree`, `ThreadTaskBanner`, `ThreadTurnMinimap`, and bottom-pinned scroll anchor.
  - `Queue`: Gateway/profile switcher, Approvals/Clarify action cards, Skills, Toolsets, and Cron Jobs manager.
  - `CLI`: Sub-millisecond monospace terminal with command history, tab autocomplete, and slash-command execution.

### 8.2 Desktop-Exclusive Surfaces
1. **Floating Phone Video Widget (`Always-on-Top` Mini Window):**
   - Detached `320×420px` frameless translucent window hosting the `hero` character + call timer + PTT/Mute/Hangup controls so the user can keep Voxcell beside a code editor or terminal while coding.
2. **Menu Bar / System Tray Companion:**
   - Live status indicator (emerald idle/online, amber dot when background tasks are running, badge count on pending approvals).
   - Quick actions: *Toggle Main Window*, *Pop Out Phone Widget*, *Push-to-Talk*, *Approve Latest Gate*, *Quit*.
3. **Native Approval & Completion Notifications (`rune-notify`):**
   - Fires when a background task pauses on an approval/clarify card or finishes while the main window is unfocused; clicking focuses directly into the target channel/Queue card.

---

## 9. Testing & Headless Uphill Verification Plan

We preserve the exact **Logic-First + Visual Uphill** quality bar of `hermes-agentis` using Rust unit tests and RUNE's headless runtime:

1. **Pure Logic Test Suite (`cargo test -p voxcell-core -p voxcell-halftone -p voxcell-hermes`):**
   - Port all 20 `.test.ts` engine test suites (141+ assertions) into deterministic Rust unit tests covering protocol SSE parsing, task rollups, sidebar character state, halftone dot geometry, natural blink/saccade curves, thread trace grouping, and CLI commands.
2. **Mock Gateway Fixture Server (for Deterministic UI Integration):**
   - In-process `axum` / `tokio` fixture implementing `/api/hermes/*` & `/v1/*` streams for headless UI tests (idle, 2 concurrent working tasks, pending approval card, voice FFT injection).
3. **RUNE Headless Uphill Harness (`voxcell-uphill`):**
   - Runs `voxcell-app --headless` across scripted journeys:
     - Exports `AccessKit` element tree snapshots to assert zero unlabeled controls, zero overlapping rects, and zero truncated status badges (`scroll_w <= client_w`).
     - Captures sequential PNG frames across `idle`, `working`, `attention`, `speaking`, `Canvas` formations, and `Thread` trace expansion, computing frame-diff jerk/continuity metrics directly in Rust (replacing `tools/blueprint/eval-uphill.ts`).
   - CI gates on **120 Hz frame-time budget** (`< 4ms` render pass CPU+GPU time via `rune-perf`) and zero visual regressions.

---

## 10. Phased Delivery Roadmap

| Phase | Milestone | Key Deliverables | Exit Gate |
|---|---|---|---|
| **Phase 1** | **Core & Protocol Port** | `voxcell-core`, `voxcell-hermes`, `voxcell-store`; profile discovery & keychain auth | 100% of pure logic & SSE protocol tests pass against mock gateway |
| **Phase 2** | **GPU Halftone & Audio** | `voxcell-halftone` (`wgpu` SDF dot rasterizer + sprite rig), `voxcell-audio` (`cpal` + `rustfft` + Deepgram Aura-2 + STT) | Headless PNG portrait captures match web halftone fidelity; live mic/TTS FFT drives visemes |
| **Phase 3** | **Main Desktop Shell in RUNE** | `voxcell-ui` (`SidebarWorkspace`, `Home`, `Thread`, `CLI`, `Queue`, `Settings`, `GlassBackgroundSystem`) | Full interactive parity on macOS/Linux/Windows; headless AccessKit & uphill frame checks pass |
| **Phase 4** | **Spatial Canvas & Desktop Polish** | `BrailleSessionsCanvas` + 9 shape engines, Floating Phone Widget window, Tray icon, Global PTT hotkey, `rune-notify`, installers (`.dmg`, `.msi`, `.AppImage`/`.deb`) | 120 Hz frame budget verified via `rune-perf`; signed binaries packaged |

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **`anomalyco/rune` API churn** (experimental pre-1.0 framework) | Breaking crate/trait updates when bumping `rune` | Isolate all `rune` widget/render calls inside `voxcell-ui`; keep `voxcell-core`, `voxcell-hermes`, `voxcell-halftone`, and `voxcell-audio` framework-agnostic. |
| **Cross-platform Audio & STT quirks** (Linux PipeWire/ALSA, Windows WASAPI, macOS mic permissions) | Silent mic or audio glitches on wake/sleep | Implement `cpal` device hot-swap recovery, explicit OS permission prompts, and selectable STT/TTS providers (Deepgram cloud + local `whisper.cpp`/OS fallback). |
| **Custom `wgpu` shader integration inside RUNE** | Need access to RUNE's custom render-pass hook for 120 Hz halftone dots | Use `rune-fx` custom quad/shader layers if exposed for dot instances, with an offscreen `wgpu` texture target fallback rendered as a standard RUNE image surface. |
| **Dual maintenance during migration** | Feature drift between web (`server.ts`/`src/`) and desktop | Freeze feature additions on web after Phase 2 or share golden JSON test vectors (`tests/vectors/`) for `hermesProtocol` and `sidebarCharacterState` across TS & Rust. |
