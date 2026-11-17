import type { BackgroundPresetDefinition, BackgroundPresetKind } from './types';

export const DEFAULT_PRESET_ID: BackgroundPresetKind = 'aurora-drift';

export const MAX_AMBIENT_SPEED_PX_PER_SEC = 40;
export const MAX_LUMINANCE_PULSE_PCT = 10;

export const DEFAULT_PRESETS: readonly BackgroundPresetDefinition[] = [
  {
    id: 'aurora-drift',
    name: 'Aurora Drift',
    subtitle: 'Soft charcoal-slate drift',
    engine: 'css',
    cssClass: 'glass-bg-aurora',
    staticBackground:
      'radial-gradient(ellipse 68% 58% at 18% 28%, rgba(71, 85, 105, 0.42) 0%, transparent 64%), radial-gradient(ellipse 54% 48% at 78% 66%, rgba(51, 65, 85, 0.36) 0%, transparent 66%), radial-gradient(ellipse 46% 42% at 44% 78%, rgba(30, 41, 59, 0.38) 0%, transparent 62%), #0B0D12',
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
      'radial-gradient(circle at 12% 16%, rgba(71, 85, 105, 0.44) 0%, transparent 52%), radial-gradient(circle at 86% 18%, rgba(51, 65, 85, 0.42) 0%, transparent 52%), radial-gradient(circle at 84% 84%, rgba(30, 41, 59, 0.44) 0%, transparent 54%), radial-gradient(circle at 16% 84%, rgba(100, 116, 139, 0.26) 0%, transparent 52%), #0B0D12',
    maxSpeedPxPerSec: 14,
    maxLuminancePulsePct: 5,
  },
  {
    id: 'braille-rain',
    name: 'Braille Rain',
    subtitle: 'Ambient glyph columns',
    engine: 'canvas',
    staticBackground:
      'linear-gradient(180deg, rgba(51, 65, 85, 0.32) 0%, rgba(11, 13, 18, 0.94) 100%), repeating-linear-gradient(90deg, rgba(148, 163, 184, 0.08) 0px, rgba(148, 163, 184, 0.08) 2px, transparent 2px, transparent 18px), #0B0D12',
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
      'linear-gradient(180deg, rgba(11, 13, 18, 0.95) 0%, rgba(71, 85, 105, 0.36) 48%, rgba(11, 13, 18, 0.95) 100%), repeating-linear-gradient(0deg, rgba(203, 213, 225, 0.04) 0px, rgba(203, 213, 225, 0.04) 1px, transparent 1px, transparent 4px), #0B0D12',
    maxSpeedPxPerSec: 28,
    maxLuminancePulsePct: 7,
  },
  {
    id: 'nebula',
    name: 'Nebula',
    subtitle: 'Two-speed value clouds',
    engine: 'canvas',
    staticBackground:
      'radial-gradient(ellipse 75% 65% at 32% 40%, rgba(71, 85, 105, 0.44) 0%, transparent 65%), radial-gradient(ellipse 65% 60% at 70% 58%, rgba(51, 65, 85, 0.40) 0%, transparent 65%), #0B0D12',
    maxSpeedPxPerSec: 20,
    maxLuminancePulsePct: 6,
  },
  {
    id: 'constellation-drift',
    name: 'Constellation',
    subtitle: 'Quiet orbital nodes',
    engine: 'canvas',
    staticBackground:
      'radial-gradient(circle at 28% 35%, rgba(148, 163, 184, 0.22) 0%, transparent 28%), radial-gradient(circle at 72% 62%, rgba(203, 213, 225, 0.16) 0%, transparent 32%), #0B0D12',
    maxSpeedPxPerSec: 24,
    maxLuminancePulsePct: 5,
  },
  {
    id: 'horizon-tide',
    name: 'Horizon Tide',
    subtitle: 'Slate atmospheric swell',
    engine: 'css',
    cssClass: 'glass-bg-horizon',
    staticBackground:
      'radial-gradient(ellipse 110% 55% at 50% 96%, rgba(71, 85, 105, 0.44) 0%, rgba(30, 41, 59, 0.28) 52%, transparent 78%), radial-gradient(ellipse 70% 40% at 30% 82%, rgba(100, 116, 139, 0.22) 0%, transparent 68%), #0B0D12',
    maxSpeedPxPerSec: 24,
    maxLuminancePulsePct: 7,
  },
];

export function getPresetById(id: string): BackgroundPresetDefinition | undefined {
  return DEFAULT_PRESETS.find((preset) => preset.id === id);
}
