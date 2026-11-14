export type BackgroundPresetKind =
  | 'aurora-drift'
  | 'mesh-gradient'
  | 'braille-rain'
  | 'scanline-shimmer'
  | 'nebula'
  | 'constellation-drift'
  | 'horizon-tide';

export type BackgroundEngine = 'css' | 'canvas';

export type BackgroundCustomMediaType = 'image' | 'video';

export interface BackgroundCustomSlot {
  id: string;
  label: string;
  mediaType: BackgroundCustomMediaType;
  src: string;
  createdAt: number;
}

export interface BackgroundPresetDefinition {
  id: BackgroundPresetKind;
  name: string;
  subtitle: string;
  engine: BackgroundEngine;
  cssClass?: string;
  /** Deterministic static background CSS value for thumbnails and reduced-motion frames */
  staticBackground: string;
  /** Enforced ambient motion cap (px/s) */
  maxSpeedPxPerSec: number;
  /** Enforced luminance pulse cap (% brightness delta) */
  maxLuminancePulsePct: number;
}

export interface BackgroundSettings {
  activeId: string;
  opacity: number;
  blurPx: number;
  customSlots: BackgroundCustomSlot[];
}
