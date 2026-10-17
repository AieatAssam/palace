/**
 * Blocks' transient, per-frame state shared between the store, the scene and the overlay,
 * kept out of React so a light never re-renders anything: when each block last lit (and
 * why), and the real buttons the scene keeps over each block on screen.
 */

export type LightKind =
  /** The board shows the line. */
  | 'cue'
  /** The player's tap, right so far. */
  | 'tap'
  /** The player's tap on the wrong block. */
  | 'slip'
  /** After a slip: the block that was due, shown in green. */
  | 'show';

export interface Light {
  /** performance.now() of the light; -Infinity before any. */
  at: number;
  kind: LightKind;
  /** How long the light holds before it fades (ms). */
  hold: number;
}

export const MAX_BLOCKS = 16;

export const blocksFx = {
  lights: Array.from({ length: MAX_BLOCKS }, (): Light => ({ at: -Infinity, kind: 'cue', hold: 0 })),
  /** The block lit last (where the gilt rises from), or -1. */
  last: -1,
};

export function markLight(block: number, kind: LightKind, hold: number) {
  const s = blocksFx.lights[block];
  if (!s) return;
  s.at = performance.now();
  s.kind = kind;
  s.hold = hold;
  if (kind !== 'show') blocksFx.last = block;
}

export function clearLights() {
  for (const s of blocksFx.lights) s.at = -Infinity;
  blocksFx.last = -1;
}

/** The real buttons over the blocks, by block index (written by the overlay, placed by the scene). */
export const blockDom = new Map<number, HTMLElement>();

/** Page rectangles of the block buttons as last placed (for the test hooks and arrow-key moves). */
export const blockRects = new Map<number, { x: number; y: number; w: number; h: number }>();
