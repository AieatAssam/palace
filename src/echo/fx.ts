/**
 * Echo's transient, per-frame state shared between the store, the scene and the overlay,
 * kept out of React so a stroke never re-renders anything: when each bell was last struck
 * (and why), and the real buttons the scene keeps over each bell on screen.
 */

export type StrikeKind =
  /** The room plays the line. */
  | 'cue'
  /** The player's stroke, right so far. */
  | 'tap'
  /** The player's stroke on the wrong bell. */
  | 'slip'
  /** After a slip: the bell that was wanted, shown in green. */
  | 'show';

export interface Strike {
  /** performance.now() of the stroke; -Infinity before any. */
  at: number;
  kind: StrikeKind;
  /** How long the light holds before it fades (ms). */
  hold: number;
}

export const MAX_BELLS = 8;

export const echoFx = {
  strikes: Array.from({ length: MAX_BELLS }, (): Strike => ({ at: -Infinity, kind: 'cue', hold: 0 })),
  /** The bell struck last (where the gilt rises from), or -1. */
  last: -1,
};

export function markStrike(bell: number, kind: StrikeKind, hold: number) {
  const s = echoFx.strikes[bell];
  if (!s) return;
  s.at = performance.now();
  s.kind = kind;
  s.hold = hold;
  if (kind !== 'show') echoFx.last = bell;
}

export function clearStrikes() {
  for (const s of echoFx.strikes) s.at = -Infinity;
  echoFx.last = -1;
}

/** The real buttons over the bells, by bell index (written by the overlay, placed by the scene). */
export const bellDom = new Map<number, HTMLElement>();

/** Page rectangles of the bell buttons as last placed (for the test hooks). */
export const bellRects = new Map<number, { x: number; y: number; w: number; h: number }>();
