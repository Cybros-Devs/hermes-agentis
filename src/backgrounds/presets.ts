import type { BackgroundPresetDefinition, BackgroundPresetKind } from './types';

export const DEFAULT_PRESET_ID: BackgroundPresetKind = 'aurora-drift';

export const MAX_AMBIENT_SPEED_PX_PER_SEC = 40;
export const MAX_LUMINANCE_PULSE_PCT = 10;

export const DEFAULT_PRESETS: readonly BackgroundPresetDefinition[] = [
  {
    id: 'aurora-drift',
    name: 'Aurora Drift',
    subtitle: 'Soft smoked-emerald blobs',
    engine: 'css',
    cssClass: 'glass-bg-aurora',
    staticBackground:
      'radial-gradient(ellipse 68% 58% at 18% 28%, rgba(20, 108, 82, 0.56) 0%, transparent 64%), radial-gradient(ellipse 54% 48% at 78% 66%, rgba(16, 82, 92, 0.44) 0%, transparent 66%), radial-gradient(ellipse 46% 42% at 44% 78%, rgba(114, 72, 28, 0.28) 0%, transparent 62%), #071310',
    maxSpeedPxPerSec: 18,
    maxLuminancePulsePct: 6,
  },
  {
    id: 'mesh-gradient',
    name: 'Mesh Gradient',
    subtitle: '30s 4-corner blend',
    engine: 'css',
    cssClass: 'glass-bg-mesh',
    staticBackground:
      'radial-gradient(circle at 12% 16%, rgba(22, 94, 74, 0.58) 0%, transparent 52%), radial-gradient(circle at 86% 18%, rgba(24, 62, 88, 0.52) 0%, transparent 52%), radial-gradient(circle at 84% 84%, rgba(56, 76, 44, 0.44) 0%, transparent 54%), radial-gradient(circle at 16% 84%, rgba(84, 54, 28, 0.38) 0%, transparent 52%), #07120f',
    maxSpeedPxPerSec: 14,
    maxLuminancePulsePct: 5,
  },
  {
    id: 'braille-rain',
    name: 'Braille Rain',
    subtitle: 'Ambient glyph columns',
    engine: 'canvas',
    staticBackground:
      'linear-gradient(180deg, rgba(16, 72, 56, 0.34) 0%, rgba(7, 19, 16, 0.92) 100%), repeating-linear-gradient(90deg, rgba(52, 211, 153, 0.08) 0px, rgba(52, 211, 153, 0.08) 2px, transparent 2px, transparent 18px), #071310',
    maxSpeedPxPerSec: 34,
    maxLuminancePulsePct: 4,
  },
  {
    id: 'scanline-shimmer',
    name: 'Scanline Shimmer',
    subtitle: 'Sweeping terminal band',
    engine: 'css',
    cssClass: 'glass-bg-scanline',
    staticBackground:
      'linear-gradient(180deg, rgba(7, 18, 15, 0.95) 0%, rgba(22, 86, 68, 0.42) 48%, rgba(7, 18, 15, 0.95) 100%), repeating-linear-gradient(0deg, rgba(167, 243, 208, 0.04) 0px, rgba(167, 243, 208, 0.04) 1px, transparent 1px, transparent 4px), #07120f',
    maxSpeedPxPerSec: 28,
    maxLuminancePulsePct: 7,
  },
  {
    id: 'nebula',
    name: 'Nebula',
    subtitle: 'Two-speed value clouds',
    engine: 'canvas',
    staticBackground:
      'radial-gradient(ellipse 75% 65% at 32% 40%, rgba(28, 92, 84, 0.54) 0%, transparent 65%), radial-gradient(ellipse 65% 60% at 70% 58%, rgba(54, 48, 94, 0.44) 0%, transparent 65%), #081214',
    maxSpeedPxPerSec: 20,
    maxLuminancePulsePct: 6,
  },
  {
    id: 'constellation-drift',
    name: 'Constellation',
    subtitle: 'Quiet orbital nodes',
    engine: 'canvas',
    staticBackground:
      'radial-gradient(circle at 28% 35%, rgba(52, 211, 153, 0.24) 0%, transparent 28%), radial-gradient(circle at 72% 62%, rgba(96, 165, 250, 0.20) 0%, transparent 32%), #071311',
    maxSpeedPxPerSec: 24,
    maxLuminancePulsePct: 5,
  },
  {
    id: 'horizon-tide',
    name: 'Horizon Tide',
    subtitle: 'Bioluminescent swell',
    engine: 'css',
    cssClass: 'glass-bg-horizon',
    staticBackground:
      'radial-gradient(ellipse 110% 55% at 50% 96%, rgba(24, 114, 86, 0.54) 0%, rgba(18, 62, 54, 0.28) 52%, transparent 78%), radial-gradient(ellipse 70% 40% at 30% 82%, rgba(124, 82, 32, 0.26) 0%, transparent 68%), #07120f',
    maxSpeedPxPerSec: 24,
    maxLuminancePulsePct: 7,
  },
];

export function getPresetById(id: string): BackgroundPresetDefinition | undefined {
  return DEFAULT_PRESETS.find((preset) => preset.id === id);
}
