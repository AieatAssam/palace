/**
 * Render quality, decided once at startup.
 *
 * `lite` is a reduced path for automated browsers (navigator.webdriver) and
 * `?lite`: DPR 1, no post-processing, standard (not physical) materials and
 * small procedural textures. Headless Chrome renders WebGL on the CPU
 * (SwiftShader), where the full path manages ~2 fps; lite keeps the app
 * interactive there. `?quality=full` forces the full path even under
 * automation (e.g. for screenshots).
 */
function detectLite(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('quality') === 'full') return false;
  if (params.has('lite') || params.has('e2e')) return true;
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

export const LITE = detectLite();

/** `?capture`: full path held at its starting tier (no frame-rate downgrade), for screenshots on slow renderers. */
export const CAPTURE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('capture');

/** Coarse pointer (phones/tablets): the cue is lifted a touch for small screens and daylight. */
export const COARSE = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
