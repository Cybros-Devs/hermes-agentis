# Voxcell Desktop — Execution Specification on RUNE (`anomalyco/rune`)

**Target Product:** Voxcell (`hermes-agentis`) — Voice-First & Spatial Desktop Client for Hermes Agent  
**Target UI Framework:** [RUNE (`anomalyco/rune`)](https://github.com/anomalyco/rune) — Native GPU-rendered Rust UI framework (`wgpu`, `Taffy`, `Parley`/`HarfRust`, `rune-motion`, `rune-fx`, `rune-notify`, headless runtime)  
**Target Platforms:** macOS (Apple Silicon / Intel via Metal), Windows (DX12 / Vulkan), Linux (Vulkan / Wayland & X11)  
**Theme Epoch:** `slate-v1` (Charcoal-Slate Monochrome default; supersedes legacy Emerald Abyss v2.1 chrome)  
**Last Updated:** 2026-11-17  
**Document Status:** Execution-Ready Specification — **Blocked on Phase 0 Go/No-Go Spike**

---

## 1. Executive Summary & Reconciliation

Voxcell (`hermes-agentis`) is a React 19 + Vite + Express (`server.ts`) application centered on **"Voice in. Character out."** — pairing a live multi-profile Hermes Agent gateway client with real-time audio-synced Braille halftone character rendering (`AsciiPortraitCanvas`), spatial session management (`BrailleSessionsCanvas`), collapsible agent reasoning trees (`ThreadTraceTree`), an interactive CLI (`CommandTerminal`), a preferences vault & self-updater (`UpdateCenterPanel` / `settingsSnapshot` / `appUpdater`), and natural-language UI customization (`UiCustomizerStudio`).

### Why Desktop & What Exists Today
1. **What RUNE Solves vs. Browser + Express:** Eliminates Node/TSX proxy overhead (`server.ts`), replaces CPU `ImageData` Braille rasterization with GPU instanced/WGSL shaders at 120 Hz, replaces browser-gated `SpeechRecognition` with native `cpal` + `rustfft` + VAD/PTT, enables OS keychain secrets and `~/.hermes/profiles/*` auto-discovery, and unlocks always-on-top mini windows + tray/notifications.
2. **Existing Prototype Scaffold (`voxcell-desktop/`):** A 7-crate Cargo workspace (`voxcell-core`, `voxcell-hermes`, `voxcell-halftone`, `voxcell-store`, `voxcell-audio`, `voxcell-ui`, `voxcell-app`) already exists in the repository with core portrait/shape/protocol logic drafted. **However, it is not yet compilable or current** (details in Section 4) and cannot serve as a release baseline without Phase 0 verification and remediation.
3. **Key Change in This Revision:** Replaces stale emerald-green chrome tokens with the live **Charcoal-Slate (`slate-v1`)** design system, maps all **26 TypeScript utility modules** (`src/utils/*.ts`) 1:1 including the 4 newly landed modules (`appUpdater`, `profileRegistry`, `settingsSnapshot` + `settingsVaultClient`, `responsiveLayout`), audits RUNE's unverified API assumptions, adds a formal **Go / No-Go framework**, and breaks all 4 delivery phases (plus Phase 0) into ticket-level estimates.

---

## 2. Go / No-Go Decision Framework (RUNE vs. Web vs. Hybrid)

Before investing ~6–8 engineer-weeks into a full UI rewrite on pre-1.0 `anomalyco/rune`, evaluate the three realistic paths on objective engineering criteria and enforce explicit stop/go gates.

### 2.1 Architecture Options Comparison

| Dimension | Option A: Stay Pure Web (`React + Vite + server.ts`) | Option B: Full Native Rewrite on RUNE (This Spec) | Option C: Native Rust Sidecar + Web UI (`Tauri/WebView2/WKWebView` or thin local shell) |
|---|---|---|---|
| **Net Engineering Effort** | **0 eng-days** (baseline) | **31–41 eng-days** (6–8 eng-weeks solo, net of `voxcell-desktop/` scaffold) | **12–16 eng-days** (2.5–3.5 eng-weeks) |
| **Rendering Performance** | 38–60 FPS CPU `ImageData` (`brailleCanvasRaster`); janks under >20 active Canvas Dots at 2× DPI | **120 Hz native GPU** (`wgpu`), `<4 ms/frame` if custom shader/instancing verified | 60–120 Hz via WebGL2/WebGPU canvas inside webview (reuses React UI) |
| **Audio & Global PTT** | Browser-dependent `SpeechRecognition`, no global background hotkey | Full native `cpal` + VAD + global hotkey (`Shortcut`) + hardware AEC | Full native `cpal` + VAD + global hotkey in Rust core over local IPC |
| **Packaging & Runtime** | Requires Node/Bun + TSX + browser tab | Single static Rust binary (`~20–35 MB`) | Small binary (`~12–18 MB`, uses OS WebView; Linux WebKitGTK variance) |
| **Pre-1.0 Framework Risk** | None (React 19 / Vite mature) | **High** (`anomalyco/rune` pre-1.0, relies on vendored `wgpu-hal`/`winit`/`parley_engine` patches) | **Low** (`wry`/`tauri` + React 19 mature) |
| **UI Parity & Maintenance** | Single codebase | Dual codebase until web frozen; must re-implement Markdown, Canvas pan/zoom, Customizer, responsive dock | **Single UI codebase**; React changes ship immediately to both Web & Desktop |

### 2.2 Explicit Decision Gates

#### Gate 1 — End of Phase 0 (Day 3: 48-Hour Technical Spike)
Proceed to Phase 1/2 **GO** **only if ALL 5 Must-Pass checks succeed**:
1. **Hermetic Build:** `anomalyco/rune` pinned by exact Git SHA builds cleanly on macOS and Linux (and cross-checks Windows DX12/Vulkan CI) without missing private submodules.
2. **Halftone GPU Path:** RUNE exposes **either** a custom `wgpu` instanced render-pass hook (`DotInstance` vertex buffer) **or** zero-copy shared `wgpu::Texture` upload sustaining **`< 3.5 ms` per frame** for `1,600+` instanced dots at `2×` Retina DPI in headless benchmark.
3. **Text & Thread Ergonomics:** `Parley` + `rune-kit` supports selectable multi-line text / copy-paste + smooth virtualized scrolling for `500+` thread trace entries without rebuilding the full view tree per frame.
4. **OS Integration Viability:** Multi-window (`always_on_top` Phone Widget) or IPC helper works cleanly, and tray/global-shortcut failures (e.g., Linux Wayland) degrade gracefully without panics.
5. **Headless Harness Parity:** `rune` headless `Runtime` renders deterministic PNGs and exposes `AccessKit` element bounds in CI without a display server.

#### Automatic **NO-GO / Pivot Triggers** (Stop & Switch)
Trigger an immediate pivot to **Option C (Rust Backend `voxcell-core` + `voxcell-hermes` + `voxcell-audio` + `voxcell-store` driving Existing React/WebGPU UI in Thin WebView Shell)** or **Option A (Stay Web)** if ANY of the following occurs:
- **Pivot Trigger 1 (Rendering Wall):** RUNE restricts elements to CPU `.pixels_fit()` RGBA uploads or simple fragment-only `rune-fx` without instancing, causing `1440×900` Canvas + Stage updates to exceed **`8 ms/frame`** on software/integrated GPUs.
- **Pivot Trigger 2 (Widget Deficit):** Implementing scrollable, copy-selectable Markdown + code blocks + modal text editing in `rune-kit` exceeds **5 eng-days** in Phase 3 estimation.
- **Pivot Trigger 3 (Churn Tax):** Upstream `anomalyco/rune` breaks public traits more than **twice** during Phases 0–2 or fails to compile on Windows/Linux CI targets.
- **Pivot Trigger 4 (Velocity Priority):** Product roadmap requires >2 UI feature iterations/week on the Thread/Canvas/Studio surfaces over the next quarter (in which case **Option C** reuses 100% of our existing `voxcell-core`/`hermes`/`audio`/`store` Rust crates as a local sidecar while keeping the React UI single-source).

---

## 3. RUNE (`anomalyco/rune`) API Verification & Gap Matrix

Every API assumed by the original spec and by `voxcell-desktop/` must be verified against a pinned `anomalyco/rune` commit SHA before Phase 1 commits to UI bindings.

| Assumed Capability | Original Spec Claim | Public Evidence / Scaffold Observation | Verification Status | Gap / Concrete Fallback Plan |
|---|---|---|---|---|
| **Core Layout & Reactive Shell (`rune`, `Taffy`)** | View tree (`col`, `row`, `el`), `AppSpec`, reactive `Cx`, `Tx::wake_after` | Confirmed via `anomalyco/rune` architecture & active imports in `voxcell-desktop/crates/voxcell-ui` | **Verified** | Keep state cleanly decoupled in `voxcell-core`; batch `wake_after` timers only when animating (`idle`/`active`) rather than unconditional 33ms spins. |
| **Text Shaping & Theme Primitives (`rune-kit`, `Parley`, `HarfRust`)** | Monospace CLI, `tabular-nums`, markdown traces, sliders, text inputs | `Kit`, `PaletteSeed`, `Button`, `TextInput` confirmed; `Parley`/`HarfRust` confirmed | **Partial — Text Selection & Scroll Virtualization Unverified** | Test in `P0-02`: if `Parley` text nodes lack built-in multi-line drag selection or clipboard shortcuts, wrap custom selection state or pivot per Trigger 2. |
| **Custom 120 Hz `wgpu` Instanced Halftone Node** | Direct `wgpu` instanced `DotInstance` vertex buffer pass at 120 Hz | `anomalyco/rune` uses `wgpu` SDF uber-quads + `rune-fx` WGSL layers, **but `voxcell-desktop` scaffold fell back to `.pixels_fit()` CPU RGBA** | **UNVERIFIED (High Risk)** | Test in `P0-02`: check whether `rune` exposes raw `wgpu::RenderPass` element callbacks or `wgpu::Texture` handle injection. Fallback: dedicated offscreen `wgpu` compute/render pass writing directly to a shared GPU texture (no CPU readback), or downgrade if forced to CPU copy. |
| **Custom Ambient Backdrop Shaders (`rune-fx`)** | 7 WGSL ambient backdrop shaders (`aurora-drift`, `scanline-shimmer`, etc.) | `rune-fx` confirmed as WGSL effect layer crate (`glow`, `mesh gradients`, `fluted glass`, deterministic frame seeds) | **Likely Supported — Exact Shader Trait Unverified** | Prototype 1 custom WGSL backdrop shader in `rune-fx` during `P0-02`; if `rune-fx` only supports built-in presets, composite our WGSL pass into an offscreen `wgpu` backdrop texture. |
| **Render-Thread Springs (`rune-motion`)** | `rune-motion` analytic springs for tab glides, sidebar stagger, node momentum | Crate & purpose confirmed in `anomalyco/rune` | **Partial — Custom Spring Wiring Unverified** | Verify `rune-motion` spring keys across dynamic list reorders (`Sidebar`, `Canvas` dots) in `P0-02`. |
| **Headless PNG + AccessKit (`Runtime`)** | Offscreen PNG capture, `AccessKit` tree dumps, scripted input | `Runtime::new`, `frame()`, `elements()`, `find()`, `pointer_down/up()`, `accessibility_json()` actively used in `voxcell-app` tests | **Verified** | Extend in `P0-04` to confirm deterministic offscreen PNG export (e.g. `rt.render_png()`) under headless Linux CI without X11/Wayland. |
| **Floating Secondary Window (`Phone Widget`)** | Detached `320×420` Always-on-Top frameless translucent mini window | `voxcell-app/main.rs` only simulates via `--scene phone` CLI flag; `bridge.rs::TogglePhoneWindow` is a no-op | **UNVERIFIED (High Risk)** | Verify in `P0-03` whether `rune::AppSpec` allows multi-window `winit` handles (`always_on_top`, `decorations(false)`, `transparent(true)`). Fallback: launch lightweight helper `--scene phone` subprocess over local Unix socket / loopback IPC (`<15 MB` shared memory). |
| **System Tray & Global Push-to-Talk Hotkeys** | Cross-platform tray badge + global `Cmd/Ctrl+Shift+Space` PTT | RUNE changelog documents `Tray::new` and global shortcuts, with explicit `TrayError::Unsupported` / `ShortcutError::Unsupported` under Linux Wayland | **Partial — Platform Caveats Confirmed** | Verify macOS/Windows/X11 tray + hotkey calls in `P0-03`. On Linux Wayland, surface clear StatusNote fallback (`xdg-desktop-portal` GlobalShortcuts or focused-window shortcut) + fallback to `tray-icon`/`global-hotkey` crates if RUNE APIs lack menus/badges. |
| **OS Notifications (`rune-notify`)** | Approval/clarify & completion alerts with click-to-focus | `available()`, `Notification::new`, `post()` verified in `bridge.rs`; action click callback unverified | **Partial — Action Callbacks Unverified** | Test notification action button + window focus callback in `P0-03`. |
| **Toolchain & `[patch.crates-io]` Vendor Hygiene** | Clean cross-OS builds | Current `voxcell-desktop/Cargo.toml` hardcodes `/tmp/rune-ref` paths (missing locally) for `wgpu-hal`, `winit`, `parley_engine`, `accesskit_*` | **BROKEN in Scaffold** | Replace `/tmp/rune-ref` in `P0-01` with pinned `git = "https://github.com/anomalyco/rune", rev = "<SHA>"` (or git submodule `third_party/rune`) and mirror its exact vendor patches. |

### 3.1 Phase 0 API Verification Protocol (48-Hour Spike)
Run **Tickets `P0-01` through `P0-04`** in a throwaway branch before writing any new UI screens:
1. Pin a reproducible `anomalyco/rune` commit SHA in `voxcell-desktop/Cargo.toml` (fixing `/tmp/rune-ref` broken path).
2. Run a minimal RUNE smoke app rendering: (a) custom WGSL / `wgpu` 1,600-dot instanced halftone portrait, (b) virtualized 500-row monospace/text list with selection, (c) secondary always-on-top window + tray + global hotkey, and (d) `cargo test` headless PNG export.
3. Score against Section 2.2 Gate 1 before greenlighting Phase 1 completion.

---

## 4. Audit of Existing `voxcell-desktop/` Scaffold

Because `voxcell-desktop/` was created earlier as an unverified prototype, execution starts with reconciling its **5 known drifts** against the current web codebase:

1. **Stale Emerald-Green Theme (`#050C0A` / `#34D399`):** `voxcell-core/src/types.rs`, `ui_config.rs`, and `voxcell-ui/src/theme.rs` still default to `Voxcell Abyss` (`bg_hex: "#050C0A"`, `surface_hex: "#0A1410"`, `accent_hex: "#34D399"`, `EmeraldAurora`). Must migrate to **`slate-v1` Charcoal-Slate** (`#0B0D12` / `#11141B` / `#94A3B8`) while keeping Emerald `#34D399` strictly for live/speaking/done semantic telemetry.
2. **Broken Local Path Dependency (`/tmp/rune-ref`):** `voxcell-desktop/Cargo.toml` cannot compile anywhere because `/tmp/rune-ref` is absent.
3. **CPU Bitmap Upload in UI (`pixels_fit` @ 30 Hz):** `views/home.rs` and `main.rs` render `stage_pixels` as CPU RGBA slices polled every `33ms` instead of a 120 Hz GPU halftone node.
4. **Missing 4 Newly Landed TS Modules:** `voxcell-core` & `voxcell-hermes` predate `appUpdater`, `profileRegistry` (multi-profile parallel side sessions), `settingsSnapshot` (schema v1 + `slate-v1` migration + rolling 12 backups), and `responsiveLayout` (split vs. overlay task drawer + canvas popover edge clamping + viewport-height stage sizing).
5. **File-Based Secrets Instead of OS Keychain:** `voxcell-store` currently writes `0600` plaintext `.key` files under `<data_dir>/secrets/` rather than integrating OS Keychain / Credential Manager / `libsecret` (`keyring` crate) with restricted fallback.

---

## 5. Cargo Workspace & Complete 1:1 Module Mapping (26 TS Modules)

Create golden JSON test vectors under `tests/vectors/` so Rust and TypeScript behavior stays locked during migration.

```text
voxcell-desktop/
├── Cargo.toml                    # Pinned git rev / submodule to anomalyco/rune (replaces /tmp/rune-ref)
├── assets/
│   ├── fonts/                    # JetBrainsMono, PlusJakartaSans, Archivo
│   └── character/
│       ├── portrait_base.png     # public/assets/aistudio/image_9fdb5ec4.png
│       └── sprite_sheet.png      # public/assets/aistudio/image_f0b5dc2e.png
├── tests/
│   └── vectors/                  # Cross-language golden JSON fixtures (protocol, snapshot, tasks, profiles)
└── crates/
    ├── voxcell-core/             # Pure state, layout/motion math, CLI, tasks, snapshots, UI config
    ├── voxcell-hermes/           # Direct HTTP/SSE client, capability probe, multi-profile registry/pool
    ├── voxcell-halftone/         # Halftone portrait, 3D ASCII, Braille field/shapes/horizon & GPU dot buffers
    ├── voxcell-audio/            # cpal capture/playback, VAD, STT, Deepgram Aura-2 TTS, 12-band FFT visemes
    ├── voxcell-store/            # SQLite vault + rolling backups, OS keychain secrets, GitHub/binary app updater
    ├── voxcell-ui/               # RUNE views, slate-v1 rune-kit theme, custom WGSL/wgpu halftone & shader nodes
    └── voxcell-app/              # Binary entry point: windows, tray, global PTT hotkey, IPC, headless harness
```

### 5.1 Complete 1:1 Mapping of All 26 `src/utils/*.ts` Modules

| TypeScript Module (`src/utils/`) | Target Rust Crate :: Module | Core Responsibilities & Parity Notes | Scaffold Status (`voxcell-desktop/`) |
|---|---|---|---|
| **`appUpdater.ts`** *(NEW)* | `voxcell-store::updater` | Local build metadata (`version`, commit, branch, dirty check), upstream GitHub release/commit probe, `compareSemver`, pre-update vault snapshot, atomic update apply + `UpdateReceipt`; extended on desktop to verify signed `.dmg`/`.msi`/`.AppImage` binary checksums before swap | **Not Yet Ported** (`P1-04`) |
| **`profileRegistry.ts`** *(NEW)* | `voxcell-hermes::profiles` | `HERMES_PROFILES` JSON/CSV parser, slug normalization & reserved-slug guard (`api`,`v1`,`health`,`p`,`sessions`,`runs`), `~/.hermes/profiles/*` scan, `standalone` vs `multiplexed` (`/p/<profile>`) routing, `custom > discovered > env` merge precedence, redacted summaries, concurrent multi-profile `HermesClient` pool for parallel side sessions | **Not Yet Ported** — `discovery.rs` only scans dirs without pool/routing (`P1-02`) |
| **`settingsSnapshot.ts`** *(NEW)* | `voxcell-core::snapshot` | Versioned `UserPreferencesSnapshot` (`schemaVersion: 1`, `themeEpoch: "slate-v1"`), legacy untouched-emerald auto-migration, `resolveBootHydrationSource` (local vs vault precedence), `summarizePreservedCategories`, backup metadata summaries, JSON import/export parser | **Not Yet Ported** (`P1-03`) |
| **`settingsVaultClient.ts`** *(NEW)* | `voxcell-store::vault` | Atomic JSON vault (`preferences-vault.json`) + SQLite sync, rolling 12-backup history (`manual-*`, `pre-update-*`), prune & restore, `UpdateReceipt` persistence (replaces HTTP `/api/preferences/*` roundtrips natively) | **Not Yet Ported** — `voxcell-store` lacks vault/backups (`P1-03`) |
| **`responsiveLayout.ts`** *(NEW)* | `voxcell-core::layout` | `resolveThreadTasksLayoutMode` (`split` right-drawer at stage `>= 900px` vs `overlay`), `computeCanvasPopoverAlignment` (`left` < 24%, `right` > 76%, else `center`), `resolveStageHeaderSize` (`full` \| `compact` \| `strip` by panel & window height) | **Not Yet Ported** (`P1-05`) |
| **`motionChoreography.ts`** | `voxcell-core::motion` | `computeStaggerDelayMs` (speed-scaled, reduced-motion zeroed), `computeSlidingIndicatorRect`, `shouldShowScrollTopFade` (>12px threshold) feeding `rune-motion` | **Not Yet Ported** (`P1-05`) |
| `hermesProtocol.ts`, `types/hermes.ts` | `voxcell-hermes::protocol` & `voxcell-core::types` | `/v1/capabilities` probe, `/v1/runs`, SSE stream parsers (`Runs`, `SessionChat`, `ChatCompletions`), `Idempotency-Key`, `429` jitter retry, approval/clarify/steer/stop | **Drafted** — verify against latest SSE tool/step coalescing (`P1-01`) |
| `taskInsights.ts` | `voxcell-core::tasks` | Step progress resolution, `deriveTurnTaskTitle`, thread-scoped task partitioning (`partitionChannelTasks` — tasks stay in owning thread while sidebar shows active indicator), active/paused/completed rollups | **Drafted** — audit against simplified thread-right task UX (`P1-06`) |
| `sidebarCharacterState.ts` | `voxcell-core::sidebar_char` | Synchronized mood, eye, viseme, energy, tone, active thread/side-session cursor-look derivation | **Drafted** — parity check (`P1-06`) |
| `sidebarSessions.ts` | `voxcell-core::sessions` | Workspace vs Gateway session scoping, search filtering, multi-profile active-task badges | **Drafted** — add profile badge & active indicator parity (`P1-06`) |
| `canvasSessions.ts`, `homeSession.ts` | `voxcell-core::canvas` | Spatial dot persistence (`duet.canvasSessions.v2`), Constellation/Orbit/Grid layouts, pins, slugging | **Drafted** (`P1-06`) |
| `threadTrace.ts`, `threadScroll.ts`, `threadMinimap.ts` | `voxcell-core::thread` | Collapsible reasoning/tool/subagent trace tree, step coalescing, bottom-anchor scroll pin, turn minimap | **Drafted** — parity check (`P1-06`) |
| `cliEngine.ts` | `voxcell-core::cli` | Slash commands (`/gateway`, `/profile`, `/skills`, `/toolsets`, `/cron`, `/sessions`, `/tasks`, `/resume`, `/theme`, `/ui`) | **Drafted** (`P1-06`) |
| `uiCustomization.ts`, `textDecodeEngine.ts` | `voxcell-core::ui_config` | Sanitized `UiCustomizationPatch`, 8 swatches, 7 curated presets (default `slate-terminal`), NL UI intent parser, Braille frontier decode | **Drifted (Stale Emerald)** — update defaults & add all 7 presets (`P1-03`) |
| `asciiPortraitEngine.ts`, `asciiCharacter.ts`, `portraitLoadingEngine.ts` | `voxcell-halftone::portrait` | 12-frame bilinear sprite bank sampler, asymmetric blink, turn-coupled saccade eye-lead, 2.5D head turn, face-plane weighted hair lag, tap impulse, materialize wipe | **Drafted** — port recent Iteration #2 hair halftone volume + turn-coupled saccade enhancements (`P2-01`) |
| `brailleCanvasRaster.ts`, `brailleFieldEngine.ts` | `voxcell-halftone::raster` & `horizon` | 8×8 Bayer dither, 5 tonal tiers, 12-band FFT Silk/Peaks/Pulse/Ribbon horizon, GPU `DotInstance` buffer emission | **Partial** — add GPU `DotInstance` emitter (`P2-02`) |
| `brailleShapesEngine.ts`, `brailleIdleLoops.ts`, `ascii3dEngine.ts` | `voxcell-halftone::shapes` & `ascii3d` | 9 shape engines with turn-coupled eye lead + ear wiggle, 36 idle loops, 5 ASCII 3D SDF shaders | **Drafted** — sync latest Dot liveliness tweaks (`P2-01`) |

*(Totals: 26 utility modules under `src/utils/`, backed by 25 `*.test.ts` suites mapped 1:1 to pure Rust unit tests.)*

---

## 6. Visual & Design System Specification (`slate-v1` Theme Epoch)

All RUNE UI surfaces implement the **Charcoal-Slate Monochrome (`slate-v1`)** design system shipped in `src/index.css` and `src/utils/uiCustomization.ts`, **retiring the legacy `#050C0A` Abyss Green / `#34D399` Emerald default chrome**.

### 6.1 `slate-v1` Core Color & Surface Tokens

| Token | Value (Hex / RGBA) | Role |
|---|---|---|
| `bg.canvas` | `#0B0D12` | Primary window canvas & charcoal-slate atmospheric backdrop field (`radial-gradient` slate 700/800 washes) |
| `bg.surface` | `#11141B` (`rgb(17, 20, 27)`) | Glass panel base: Stage `0.80` alpha, Sidebar `0.84` alpha, Composer docked `0.76` alpha, Drawers `0.985` alpha |
| `bg.elevated` | `#1A202C` / `rgba(148, 163, 184, 0.12)` | Active session card, hovered rows, task drawer header |
| `accent.primary` | `#94A3B8` (`--ui-accent`, Slate 400) | Active borders, range sliders, active tab chrome, solid button background (`#0B0D12` ink text) |
| `accent.soft` | `#CBD5E1` (`--ui-accent-soft`, Slate 300) | Active tab text, highlighted badges, subtle scrollbar hover |
| `accent.bright` | `#E2E8F0` (`--ui-accent-bright`, Slate 200) | High-emphasis focus states & primary monochrome contrast highlights |
| `border.subtle` | `rgba(255, 255, 255, 0.08)` | Hairline `1px` structural dividers (`sidebar-shell`, cards) |
| `border.active` | `rgba(148, 163, 184, 0.22)` (`--ui-border-alpha`) | Focused composer (`0.25` ring), active tab (`0.52`), stage shell (`0.22`, glow `0.03`) |
| `text.primary` | `#F1F5F9` (`--ui-text`) | Headings, active session titles, user prompts |
| `text.secondary` | `rgba(203, 213, 225, 0.72)` | Model/profile lines, activity steps, sub-labels |
| `text.muted` | `rgba(148, 163, 184, 0.62)` | Timestamps, secondary metadata |
| **Semantic State Only** | Emerald `#34D399` (`#6EE7B7`) · Amber `#F59E0B` (`#FCD34D`) · Rose `#F43F5E` (`#FDA4AF`) | Reserved strictly for live/voice/completed telemetry (`Emerald`), running/thinking tasks (`Amber`), and offline/error/stop gates (`Rose`) — never applied as ambient UI chrome in default `slate-v1` |

### 6.2 Accent Swatches, Curated Presets & Migration Parity
- **8 Accent Swatches:** `slate` *(default)*, `emerald`, `cyan`, `violet`, `amber`, `rose`, `crimson`, `mono`.
- **7 Curated Presets:** `slate-terminal` *(Slate Monochrome — default)*, `emerald-terminal` *(preserved opt-in preset)*, `cyber-violet`, `solaris-amber`, `glacier-cyan`, `sakura-rose`, `zen-mono`.
- **Legacy Snapshot Auto-Migration:** On boot, `voxcell-core::snapshot::normalize_snapshot` checks `theme_epoch != "slate-v1"`. Untouched legacy default emerald configs (`#34D399` / `#0A1613` / `#ECF3F0`) auto-upgrade cleanly to `slate-v1`, whereas customized user palettes remain preserved.

### 6.3 Typography & Responsive Geometry
- **Font Stack:** `Plus Jakarta Sans` (`12–14px`, weights `400/500/600`) for UI, `Archivo` (`600/700`) for display headings, `JetBrains Mono` (`tabular-nums`) for elapsed timers, task step counters, FFT readouts, and CLI.
- **Radius & Restraint:** Default `rounded` (`16px` cards / `12px` controls); supports `sharp` (`4px`) and `pill` (`26px`/`18px`) via customization studio. Reduced motion disables choreography springs and freezes portrait/horizon idle oscillation cleanly.
- **Responsive Viewport Rules (`voxcell-core::layout`):**
  - Thread Task panel (`312–328px`) is **hidden by default** in Thread view, toggled from the upper-right thread control, and docks `split` side-by-side only when center stage width `>= 900px`; narrower windows auto-switch to `overlay` drawer.
  - Stage portrait header smoothly scales across `full` (`Home`), `compact` (`Thread`/`Queue`/`CLI` at height `>=700/860px`), and slim `strip` on short desktop windows (`1024×768` / `1280×720`) or `Canvas`.

---

## 7. Core Desktop Subsystem Architecture

### 7.1 GPU Halftone & Shader Pipeline (`voxcell-halftone` + `voxcell-ui`)
1. **Normalized Source Pre-Bake:** Startup parses `portrait_base.png` and `sprite_sheet.png` (12 poses) into `160×160` luminance/edge lookup grids with bilinear resampling on head rotation.
2. **Physics & Halftone Dot Emission (`DotInstance`):**
   - `PortraitAnimator::step(dt, ...)` drives multi-harmonic breath, 2.5D yaw/pitch/tilt, asymmetric blink, turn-coupled saccades, and face-plane weighted hair spring lag (`hair_plane_weight = 1.0 - face_zone * 0.85`).
   - Emits `DotInstance { pos_xy: [f32; 2], radius: f32, tier: u8, alpha: f32 }` directly to a GPU instance buffer (rather than CPU `ImageData` RGBA rasterization).
3. **Fragment Shader:** Analytic SDF circular dots (`crisp` \| `balanced` \| `phosphor`), optional soft quadratic corona bloom around tiers 3–4 tinted neutrally (`#CBD5E1`/`#E2E8F0` in `slate-v1` idle, `#34D399` voice, `#F59E0B` working, `#F43F5E` alert).

### 7.2 Native Audio & Voice Pipeline (`voxcell-audio`)
- Lock-free `cpal` mic ring buffer (`16/48 kHz`) → 12-band `rustfft` + RMS energy → Silero/WebRTC VAD → Deepgram Flux WS / `whisper.cpp` / OS STT → Hermes turn dispatch → sentence-chunked Deepgram Aura-2 linear16 TTS (`<600 ms` latency) → playback 12-band output FFT driving 120 Hz visemes.
- Supports both continuous VAD and global Push-to-Talk (`Cmd/Ctrl+Shift+Space`) + hardware/software barge-in ducking.

### 7.3 Parallel Multi-Profile Protocol (`voxcell-hermes`)
- **Multi-Profile Catalog (`profileRegistry` parity):** Merges `HERMES_PROFILES` env definitions, `~/.hermes/profiles/*/gateway.json` discovery, and UI-registered custom profiles (`custom > discovered > env`).
- **Concurrent Side Sessions:** Each channel/session binds an immutable `profile_id` and routes independently via either its dedicated standalone `base_url` or multiplexed `/p/<profile>/` prefix on a shared gateway — enabling parallel `default` + `@coder` + `@researcher` turns simultaneously without global gateway switching.
- **Redaction Guarantee:** Raw bearer tokens stay inside `voxcell-store` / `voxcell-hermes`; UI state receives only `HermesProfileSummary { has_api_key: bool, ... }`.

### 7.4 Preferences Vault, Secrets & Desktop Self-Updater (`voxcell-store`)
- **OS Keychain Secrets:** `keyring` crate (`HERMES_API_KEY`, `HERMES_API_KEY_<PROFILE>`, `DEEPGRAM_API_KEY`) backed by macOS Keychain, Windows Credential Manager, or Linux Secret Service, with explicit warning if falling back to `0600` local file storage on headless Linux without D-Bus.
- **Preferences Vault & Backups:** Versioned `UserPreferencesSnapshot` (`slate-v1`) persisted in SQLite (`voxcell.db`) + atomic JSON vault with rolling 12-snapshot backup rotation (`pre-update`, `manual`, `restore`), import/export, and preserved-category diffs.
- **Desktop Updater (`appUpdater` parity):** Queries GitHub Releases (`DevvGwardo/hermes-agentis`), creates an automatic `pre-update` vault backup, verifies SHA-256 asset signatures (or runs clean `git pull --ff-only` in source/dev installs), and writes an `UpdateReceipt` displayed cleanly on next launch.

---

## 8. Execution-Ready Task Breakdown & Estimates

> **Estimation Basis:** Assumes 1 senior Rust engineer familiar with `wgpu`/`tokio` (or 2 engineers working Stream A `[Core/Protocol/Audio/Store]` + Stream B `[RUNE UI/GPU/Packaging]` in parallel). Estimates reflect **net remaining work** accounting for logic already drafted in `voxcell-desktop/`.

### Phase 0 — Toolchain Repair & RUNE API Verification Spike (`3.5 eng-days`)

| Ticket | Deliverable & Acceptance Criteria | Deps | Est. |
|---|---|---|---|
| **`P0-01`** | **Fix `voxcell-desktop/Cargo.toml` Dependency Pinning:** Replace broken `/tmp/rune-ref` paths with pinned `anomalyco/rune` Git commit SHA (or submodule `third_party/rune`); commit `Cargo.lock`; verify `cargo check --workspace` passes on macOS & Linux. | None | `0.5d` |
| **`P0-02`** | **Verify Custom `wgpu` / `rune-fx` Halftone & Virtual Scroll:** Prototype 1,600-dot instanced GPU portrait + 1 WGSL `rune-fx` backdrop + 500-row virtualized `Parley` list with text selection/clipboard. Measure GPU+CPU frame time (`target < 3.5 ms` @ 120 Hz). | `P0-01` | `1.5d` |
| **`P0-03`** | **Verify Multi-Window, Tray, Global PTT & `rune-notify` Actions:** Confirm secondary always-on-top window lifecycle, system tray badge/menu, global hotkey, and Wayland degradation behavior (`TrayError::Unsupported` / `ShortcutError::Unsupported` handling). | `P0-01` | `1.0d` |
| **`P0-04`** | **Go / No-Go Gate 1 Review & CI Matrix Setup:** Wire GitHub Actions headless test (`cargo test --workspace` + PNG capture + `AccessKit` snapshot) on macOS/Ubuntu/Windows; sign off Gate 1 per Section 2.2. | `P0-02`, `P0-03` | `0.5d` |

### Phase 1 — Core Parity, `slate-v1` Migration & Multi-Profile Protocol (`6.5 eng-days`)

| Ticket | Crate / Module | Deliverable & Acceptance Criteria | Deps | Est. |
|---|---|---|---|---|
| **`P1-01`** | `tests/vectors/`, `voxcell-hermes::protocol` | Export cross-language golden JSON vectors (`hermesProtocol`, `taskInsights`, `threadTrace`, `settingsSnapshot`); verify SSE step coalescing & terminal diagnostics parity (`100%` vector pass). | `P0-04` | `1.0d` |
| **`P1-02`** | `voxcell-hermes::profiles` | Port `profileRegistry.ts` (`HERMES_PROFILES` CSV/JSON, reserved slugs, `~/.hermes/profiles/*`, `standalone` vs `/p/<profile>/` routing, redacted summaries) + concurrent multi-profile `HermesClient` pool. | `P1-01` | `1.5d` |
| **`P1-03`** | `voxcell-core::ui_config`, `snapshot`, `voxcell-store` | Migrate Rust theme defaults to **`slate-v1`** (`#0B0D12` / `#11141B` / `#94A3B8`, all 8 swatches & 7 presets); port `settingsSnapshot` (`v1`, legacy emerald auto-migration, boot hydration, 12 rolling backups) + `keyring` OS keychain integration. | `P0-04` | `1.5d` |
| **`P1-04`** | `voxcell-store::updater` | Port `appUpdater.ts` build metadata, GitHub release/commit probe, semver comparison, pre-update backup hook, and `UpdateReceipt` lifecycle (+ desktop release SHA verification). | `P1-03` | `1.0d` |
| **`P1-05`** | `voxcell-core::layout`, `motion` | Port `responsiveLayout.ts` (`split` vs `overlay` >= 900px stage, canvas popover clamping, stage header height tiers) + `motionChoreography.ts` stagger/indicator helpers. | `P0-04` | `0.5d` |
| **`P1-06`** | `voxcell-core::tasks`, `sessions`, `thread`, `cli` | Audit & update drafted modules against simplified thread-right task UX (hidden by default, clean status/step rollups, zero noisy progress bars) + `/profile` CLI commands. | `P1-01` | `1.0d` |

### Phase 2 — 120 Hz GPU Halftone & Native Audio Engine (`8.5 eng-days`)

| Ticket | Crate / Module | Deliverable & Acceptance Criteria | Deps | Est. |
|---|---|---|---|---|
| **`P2-01`** | `voxcell-halftone` (`portrait`, `shapes`) | Sync recent character liveliness (turn-coupled saccade eye-lead, multi-harmonic brow lift, right-hair & left-curl halftone sheen, bilinear sprite sampling, Dot ear wiggle & resting head tilts) against TS test expectations. | `P1-01` | `1.5d` |
| **`P2-02`** | `voxcell-halftone` + `voxcell-ui` | Implement GPU `DotInstance` emitter + custom `wgpu` SDF dot/corona render node (or offscreen GPU texture fallback proven in `P0-02`), replacing `.pixels_fit()` CPU copies; verify `<3.5 ms/frame` @ 120 Hz. | `P0-02`, `P2-01` | `2.5d` |
| **`P2-03`** | `voxcell-ui` (`GlassBackground`) | Port 7 ambient backdrop presets to `rune-fx` / WGSL fragment shaders (`aurora-drift` slate default + 6 presets) respecting `opacity` & `reducedMotion`. | `P0-02`, `P1-03` | `1.5d` |
| **`P2-04`** | `voxcell-audio` (`cpal`, `rustfft`) | Complete live mic input capture with device hot-swap recovery, hardware/software VAD, lock-free 12-band FFT + RMS, and OS mic permission state reporting. | `P0-04` | `1.5d` |
| **`P2-05`** | `voxcell-audio` (`tts`, `stt`) | Wire streaming STT (Deepgram Flux WS + local `whisper.cpp` / OS fallback) and sentence-chunked Deepgram Aura-2 PCM playback with barge-in ducking (<600ms first-audio) driving live visemes. | `P2-04` | `1.5d` |
| *Gate 2* | **Vertical Slice Review** | **Go / No-Go Check #2:** Live character renders at 120 Hz in `Home` driven by real mic FFT + Aura-2 lip-sync speaking to a real Hermes gateway. | `P2-02..P2-05` | *(milestone)* |

### Phase 3 — Main Desktop Shell & Core Views in RUNE (`10.0 eng-days`)

| Ticket | View / Component | Deliverable & Acceptance Criteria | Deps | Est. |
|---|---|---|---|---|
| **`P3-01`** | `voxcell-ui::theme` + App Chrome | Implement `slate-v1` `VoxcellTheme`, custom titlebar tabs (`Home`, `Canvas`, `Thread`, `Queue`, `CLI`), sliding indicator, keyboard shortcuts (`Cmd/Ctrl+1..5`, `B`, `,`), and reduced-motion switch. | `P1-03`, `P2-03` | `1.5d` |
| **`P3-02`** | `SidebarWorkspace` | Reactive `72×66` cursor-tracking portrait, simplified active session & parallel profile badges, `Needs attention` approval strip, `Sessions`/`Gateway` filter, `sidebar_position` left/right + collapsible toggle. | `P1-02`, `P2-02`, `P3-01` | `1.5d` |
| **`P3-03`** | `Home` & Unified Composer | Responsive centered `stage` halftone + `BrailleHorizonCanvas` + inline profile selector (`@profile` parallel side-session picker) + VAD/PTT voice composer. | `P2-02`, `P2-05`, `P3-01` | `1.5d` |
| **`P3-04`** | `Thread` & Docked Tasks | Virtualized `Parley` transcript, collapsible `ThreadTraceTree`, hidden-by-default right-corner Thread Task drawer (`split >= 900px` / `overlay < 900px`), `ThreadTurnMinimap`, smart bottom-anchor scroll, copy/selection. | `P1-05`, `P1-06`, `P3-01` | `2.5d` |
| **`P3-05`** | `Queue` & `CLI` | `Queue` view (multi-profile health/switcher, Approvals/Clarify action cards, Skills, Toolsets, Cron manager) + `CLI` monospace terminal (history, autocomplete, `/ui`, `/profile`, `/theme`). | `P1-02`, `P1-06`, `P3-01` | `1.5d` |
| **`P3-06`** | `Settings`, `Studio` & `Updater` | Settings modal, `UiCustomizerStudio` (8 swatches, 7 presets, dot profile, bloom, backdrop picker), Preferences Vault backup/restore UI, and `UpdateCenterPanel` native updater flow. | `P1-03`, `P1-04`, `P3-01` | `1.5d` |

### Phase 4 — Spatial Canvas, Native Surfaces & Release Packaging (`7.5 eng-days`)

| Ticket | Deliverable & Acceptance Criteria | Deps | Est. |
|---|---|---|---|
| **`P4-01`** | **Spatial `Canvas` View (Hermes Dots):** GPU pan/zoom viewport, 9 dot shape engines with live breathing/ear-wiggle/eye-lead, `Constellation` / `Orbit` / `Grid` transitions (`rune-motion`), inline dot prompt/voice bar, edge-clamped popovers (`computeCanvasPopoverAlignment`), pin persistence. | `P1-05`, `P2-02`, `P3-01` | `2.5d` |
| **`P4-02`** | **Floating Phone Video Widget Window:** True detached `320×420` `always_on_top` frameless window (or IPC companion from `P0-03`), `hero` portrait + elapsed call timer + Mute/PTT/Hangup controls. | `P0-03`, `P2-02`, `P2-05` | `1.5d` |
| **`P4-03`** | **Tray Companion, Global PTT & Notifications:** Live tray status dot + approval badge + quick menu; global `Cmd/Ctrl+Shift+Space` PTT hotkey; `rune-notify` click-to-focus target thread/Queue card. | `P0-03`, `P3-05` | `1.0d` |
| **`P4-04`** | **Headless Uphill & Integration CI Suite:** Port `tools/blueprint/` uphill frame-continuity/contrast scoring to `voxcell-uphill` CLI; run mock `axum` gateway E2E + `AccessKit` audit + `rune-perf` `<4ms` 120 Hz budget check. | `P3-04`, `P4-01` | `1.5d` |
| **`P4-05`** | **Installers & Signing:** Package signed macOS `.dmg` (notarized), Windows `.msi` (Authenticode), Linux `.AppImage`/`.deb`; bundle fonts & character assets; smoke-test fresh launch + `appUpdater` check. | `P4-01..P4-04` | `1.0d` |

### 8.1 Total Effort & Schedule Rollup

| Phase | Net Estimate | 1 Engineer (Sequential) | 2 Engineers (Parallel Core/Audio + UI/GPU) |
|---|---|---|---|
| **Phase 0:** API Spike & Toolchain Fix | `3.5 eng-days` | Week 1 | Week 1 |
| **Phase 1:** Core, `slate-v1`, Vault, Profiles, Updater | `6.5 eng-days` | Week 2 | Week 2 (Stream A) |
| **Phase 2:** 120 Hz GPU Halftone & Native Audio | `8.5 eng-days` | Weeks 3–4 | Weeks 2–3 (Stream A Audio + Stream B GPU) |
| **Phase 3:** Main Desktop Shell (`Home`, `Thread`, `Queue`, `CLI`, `Settings`) | `10.0 eng-days` | Weeks 5–6 | Weeks 3–4 (Stream B UI + Stream A Polish) |
| **Phase 4:** Spatial Canvas, Phone Widget, Tray, Uphill CI, Installers | `7.5 eng-days` | Weeks 7–8 | Week 5 |
| **Total (with ~15% integration buffer)** | **`36.0 + 5.0 = ~41 eng-days`** | **~7.5–8.5 weeks** | **~4.5–5.5 weeks** |

---

## 9. Testing, Golden Vectors & Headless Verification

1. **Cross-Language Golden Vectors (`tests/vectors/`):** Deterministic JSON fixtures generated from Vitest/`node:test` TS suites (`hermesProtocol`, `profileRegistry`, `settingsSnapshot`, `responsiveLayout`, `taskInsights`, `sidebarCharacterState`, `threadTrace`) executed by `cargo test -p voxcell-core -p voxcell-hermes`.
2. **In-Process Mock Gateway (`axum`):** Replays `runs`, `session_stream`, multi-profile `/p/<profile>/` routing, parallel side-session turns, approval requests, and simulated 12-band FFT streams in `cargo test`.
3. **Headless Uphill Harness (`voxcell-uphill`):** Runs `voxcell-app --headless` across `idle`, `working`, `attention`, `speaking`, `canvas`, `thread` (both `>=900px` split task drawer and `<900px` overlay), and `phone` scenes:
   - Asserts `AccessKit` node completeness, zero clipped text (`scroll_w <= client_w`), and edge-safe Canvas popovers.
   - Measures inter-frame character motion deltas & `<4 ms/frame` 120 Hz render budget via `rune-perf`.

---

## 10. Risk Register & Mitigations

| Risk | Likelihood / Impact | Concrete Trigger / Early Warning | Mitigation & Fallback |
|---|---|---|---|
| **RUNE lacks raw `wgpu` instancing hook** (`DotInstance`) | Medium / **High** | Discovered in `P0-02` (< Day 3) | Render halftone/backdrop in offscreen `wgpu` pass to shared `wgpu::Texture`; if CPU readback required and > `8 ms/frame`, trigger Go/No-Go pivot to Option C (Native Sidecar + WebGPU). |
| **`anomalyco/rune` pre-1.0 API churn & vendor patches** | High / Medium | `Cargo.lock` bump breaks `voxcell-ui` traits | Pin exact Git commit SHA; isolate all `rune*` calls inside `voxcell-ui` & `voxcell-app`; keep all 5 core crates (`core`, `hermes`, `halftone`, `audio`, `store`) 100% framework-free. |
| **Linux Wayland Tray / Global Shortcut Gaps** | High / Medium | `TrayError::Unsupported` or `ShortcutError::Unsupported` at startup | Degrade gracefully without panicking; support `xdg-desktop-portal` GlobalShortcuts where exposed and focused-window PTT fallback; keep full support on macOS/Windows/X11. |
| **Audio device quirks & Echo Barge-In** | Medium / Medium | Silent stream after OS sleep or TTS self-triggering VAD | `cpal` stream-error recovery loop, explicit OS mic-permission UI banner, selectable STT/TTS backend (`Deepgram` vs `whisper.cpp`/OS fallback). |
| **Web ↔ Desktop Spec & Feature Drift** | High / High | Already observed (`emerald` → `slate-v1` + 4 unported TS modules) | Freeze cosmetic web-only churn after Phase 2 vertical slice OR maintain shared `tests/vectors/` CI check failing PRs that alter TS engines without matching spec/Rust ticket updates. |
