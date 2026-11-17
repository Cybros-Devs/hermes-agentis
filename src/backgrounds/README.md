# Glass Background System

Additive, zero-churn animated glass background layer mounted once behind the app root (`fixed`, `inset-0`, `z-index: -1`, `pointer-events: none`).

## Architecture
- `BackgroundLayer.tsx` — Memoized full-viewport renderer supporting pure CSS `@keyframes` presets, capped-DPR (`<= 2`) imperative `<canvas>` presets (paused on `document.hidden`, frozen under `prefers-reduced-motion: reduce`), and custom muted/looped `object-cover` video or image slots.
- `presets.ts` — Registry of 7 ambient presets bounded to `<= 40px/s` drift and `<= 10%` luminance delta, each with a deterministic static preview frame.
- `persistence.ts` — `localStorage` persistence (`duet.glassBackground.v1`) with synchronous CSS-variable boot hydration before first paint and safe fallback on missing/corrupt data.
- `BackgroundControls.tsx` — Embedded controls mounted inside `Settings → Backdrop` (`UiCustomizerStudio.tsx`) for selecting presets, managing custom image/video slots, and tuning background opacity and glass blur strength.

## How to Add an 8th Preset
1. Add the new preset union ID to `BackgroundPresetKind` in `src/backgrounds/types.ts` (for example `'ember-grid'`).
2. Append its definition object to `DEFAULT_PRESETS` in `src/backgrounds/presets.ts` with:
   - `engine`: `'css'` (preferred) or `'canvas'`
   - `staticBackground`: a deterministic CSS gradient string for thumbnails and `prefers-reduced-motion`
   - `maxSpeedPxPerSec` (`<= 40`) and `maxLuminancePulsePct` (`<= 10`) keeping dark-to-mid luminance for WCAG AA contrast.
3. Implement the renderer:
   - If `engine: 'css'`, add the `@keyframes` and class in `src/backgrounds/backgrounds.css` (and include its selector in the `@media (prefers-reduced-motion: reduce)` freeze block), then render its element branch in `BackgroundLayer.tsx`.
   - If `engine: 'canvas'`, add a `draw...` branch inside `renderFrame()` in `BackgroundLayer.tsx`.
