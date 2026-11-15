import { useEffect, useState } from 'react';
import './backgrounds.css';
import { BackgroundLayer } from './BackgroundLayer';
import {
  applyBackgroundCssVars,
  hydrateBackgroundVarsOnBoot,
  saveBackgroundSettings,
  subscribeBackgroundSettings,
} from './persistence';
import type { BackgroundSettings } from './types';

// Hydrate CSS variables synchronously before React renders its first frame (prevents boot flash)
const INITIAL_SETTINGS = hydrateBackgroundVarsOnBoot();

export function GlassBackgroundSystem() {
  const [settings, setSettings] = useState<BackgroundSettings>(INITIAL_SETTINGS);

  useEffect(() => {
    applyBackgroundCssVars(settings);
    saveBackgroundSettings(settings);
  }, [settings]);

  useEffect(() => {
    return subscribeBackgroundSettings((externalNext) => {
      setSettings((prev) => {
        if (
          prev.activeId === externalNext.activeId &&
          prev.opacity === externalNext.opacity &&
          prev.blurPx === externalNext.blurPx &&
          prev.customSlots.length === externalNext.customSlots.length &&
          prev.customSlots.every((s, idx) => s.id === externalNext.customSlots[idx]?.id)
        ) {
          return prev;
        }
        return externalNext;
      });
    });
  }, []);

  const activeCustomSlot =
    settings.customSlots.find((s) => s.id === settings.activeId) ?? null;

  return <BackgroundLayer activeId={settings.activeId} customSlot={activeCustomSlot} />;
}
