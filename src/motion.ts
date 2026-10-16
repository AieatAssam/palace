import { useSyncExternalStore } from 'react';
import { usePalace } from './store';

const QUERY = '(prefers-reduced-motion: reduce)';

function media() {
  return typeof matchMedia === 'undefined' ? null : matchMedia(QUERY);
}

/** The OS asks for less motion. */
export function prefersReducedMotion(): boolean {
  return media()?.matches ?? false;
}

/** Calm the room: the player's setting or the OS preference. Non-reactive, for frame loops. */
export function isCalm(): boolean {
  return usePalace.getState().saved.settings.reduceMotion || prefersReducedMotion();
}

function subscribe(cb: () => void) {
  const m = media();
  m?.addEventListener('change', cb);
  return () => m?.removeEventListener('change', cb);
}

export function useCalm(): boolean {
  const os = useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
  const setting = usePalace((s) => s.saved.settings.reduceMotion);
  return os || setting;
}
