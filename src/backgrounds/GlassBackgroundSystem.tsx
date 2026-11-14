import { useCallback, useEffect, useState } from 'react';
import './backgrounds.css';
import { BackgroundLayer } from './BackgroundLayer';
import { BackgroundPicker } from './BackgroundPicker';
import {
  applyBackgroundCssVars,
  clampBlurPx,
  clampOpacity,
  hydrateBackgroundVarsOnBoot,
  saveBackgroundSettings,
  subscribeBackgroundSettings,
} from './persistence';
import { DEFAULT_PRESET_ID } from './presets';
import type { BackgroundCustomSlot, BackgroundSettings } from './types';

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

  const handleSelectActive = useCallback((id: string) => {
    setSettings((prev) => ({ ...prev, activeId: id }));
  }, []);

  const handleChangeOpacity = useCallback((rawOpacity: number) => {
    const opacity = clampOpacity(rawOpacity);
    setSettings((prev) => {
      const next = { ...prev, opacity };
      applyBackgroundCssVars(next);
      return next;
    });
  }, []);

  const handleChangeBlurPx = useCallback((rawBlurPx: number) => {
    const blurPx = clampBlurPx(rawBlurPx);
    setSettings((prev) => {
      const next = { ...prev, blurPx };
      applyBackgroundCssVars(next);
      return next;
    });
  }, []);

  const handleAddCustomSlot = useCallback((slot: BackgroundCustomSlot) => {
    setSettings((prev) => ({
      ...prev,
      activeId: slot.id,
      customSlots: [slot, ...prev.customSlots].slice(0, 6),
    }));
  }, []);

  const handleRemoveCustomSlot = useCallback((id: string) => {
    setSettings((prev) => ({
      ...prev,
      activeId: prev.activeId === id ? DEFAULT_PRESET_ID : prev.activeId,
      customSlots: prev.customSlots.filter((s) => s.id !== id),
    }));
  }, []);

  const activeCustomSlot =
    settings.customSlots.find((s) => s.id === settings.activeId) ?? null;

  return (
    <>
      <BackgroundLayer activeId={settings.activeId} customSlot={activeCustomSlot} />
      <BackgroundPicker
        settings={settings}
        onSelectActive={handleSelectActive}
        onChangeOpacity={handleChangeOpacity}
        onChangeBlurPx={handleChangeBlurPx}
        onAddCustomSlot={handleAddCustomSlot}
        onRemoveCustomSlot={handleRemoveCustomSlot}
      />
    </>
  );
}
