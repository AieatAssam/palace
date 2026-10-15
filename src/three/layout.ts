import { type Position, STRING_COUNT } from '../game/notes';

/**
 * Neck geometry in local units. The neck runs along +X from the nut (x = 0);
 * strings are spread across Z with the low E (string 0) at +Z (nearest the
 * player); the fretboard surface is at y = 0.
 */
export const SCALE = 26;
export const RENDERED_FRETS = 15;
export const HEADSTOCK_GAP = 0.95; // open-string tap zone behind the nut
export const NUT_WIDTH = 2.55;
export const BOARD_TAPER = 0.36; // extra width by the 12th fret
export const EDGE_MARGIN = 0.19;
export const BOARD_THICKNESS = 0.16;
export const STRING_HEIGHT_NUT = 0.11;
export const STRING_HEIGHT_FAR = 0.2;

export const STRING_RADII = [0.03, 0.026, 0.021, 0.016, 0.012, 0.0105] as const;
export const WOUND = [true, true, true, false, false, false] as const;

export const INLAY_FRETS = [3, 5, 7, 9, 12] as const;

export function fretX(n: number): number {
  return SCALE * (1 - Math.pow(2, -n / 12));
}

export const BOARD_END = fretX(RENDERED_FRETS) + 0.5;

export function neckWidth(x: number): number {
  return NUT_WIDTH + (BOARD_TAPER * Math.max(0, x)) / fretX(12);
}

export function stringSpacing(x: number): number {
  return (neckWidth(x) - 2 * EDGE_MARGIN) / (STRING_COUNT - 1);
}

export function stringZ(string: number, x: number): number {
  return (2.5 - string) * stringSpacing(x);
}

export function stringHeight(x: number): number {
  return STRING_HEIGHT_NUT + ((STRING_HEIGHT_FAR - STRING_HEIGHT_NUT) * Math.max(0, x)) / SCALE;
}

/** Where a finger (and the highlight) sits for a position. */
export function markerX(fret: number): number {
  if (fret === 0) return -HEADSTOCK_GAP * 0.48;
  const a = fretX(fret - 1);
  const b = fretX(fret);
  return a + (b - a) * 0.58;
}

export function markerPoint(p: Position): [number, number, number] {
  const x = markerX(p.fret);
  const sx = Math.max(0, x);
  return [x, stringHeight(sx), stringZ(p.string, sx)];
}

/** Tap cell for a position: [xMin, xMax, zMin, zMax]. */
export function cellRect(p: Position): [number, number, number, number] {
  const x0 = p.fret === 0 ? -HEADSTOCK_GAP : fretX(p.fret - 1) + 0.02;
  const x1 = p.fret === 0 ? -0.06 : fretX(p.fret) - 0.02;
  const xc = Math.max(0, (x0 + x1) / 2);
  const z = stringZ(p.string, xc);
  const half = stringSpacing(xc) / 2;
  return [x0, x1, z - half, z + half];
}

/** Local-space rectangle to frame for a region of frets. */
export function regionBounds(maxFret: number): { x0: number; x1: number; z0: number; z1: number } {
  const x1 = fretX(maxFret);
  const half = neckWidth(x1) / 2;
  return { x0: -HEADSTOCK_GAP - 0.2, x1: x1 + 0.35, z0: -half, z1: half };
}

/** Extra reach for tap cells whose neighbour is off the board or locked. */
export const EDGE_REACH = 0.5;
/** How far beyond a cell boundary (fraction of string spacing) a tap is forgiven toward a target. */
export const FORGIVE = 0.3;

/**
 * Tap rectangle for an unlocked position: the plain cell, widened outward
 * when the neighbouring string is absent or locked, so edge strings are
 * comfortably tappable on a phone.
 */
export function tapRect(p: Position, unlockedStrings: readonly number[]): [number, number, number, number] {
  const [x0, x1, z0, z1] = cellRect(p);
  const xc = Math.max(0, (x0 + x1) / 2);
  const sp = stringSpacing(xc);
  // Lower strings sit at +Z: string - 1 is the +Z neighbour, string + 1 the -Z one.
  const plusOpen = !unlockedStrings.includes(p.string - 1);
  const minusOpen = !unlockedStrings.includes(p.string + 1);
  return [x0, x1, minusOpen ? z0 - sp * EDGE_REACH : z0, plusOpen ? z1 + sp * EDGE_REACH : z1];
}

/**
 * Resolve a tap at local (x, z) to a position, preferring an adjacent
 * `preferred` position (e.g. an unfound Find-all target) when the tap lands
 * within FORGIVE × string spacing of it.
 */
export function resolveTap(hit: Position, x: number, z: number, preferred: readonly Position[]): Position {
  if (preferred.some((q) => q.string === hit.string && q.fret === hit.fret)) return hit;
  const sx = Math.max(0, x);
  const sp = stringSpacing(sx);
  for (const q of preferred) {
    if (q.fret !== hit.fret || Math.abs(q.string - hit.string) !== 1) continue;
    const d = Math.abs(z - stringZ(q.string, sx));
    if (d <= sp * (0.5 + FORGIVE)) return q;
  }
  return hit;
}
