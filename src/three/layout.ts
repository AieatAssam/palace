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
export const NUT_DEPTH = 0.14; // the nut spans x ∈ [-NUT_DEPTH, 0]
export const NUT_X0 = -NUT_DEPTH;
export const HEADSTOCK_LEN = 4.2;
export const HEADSTOCK_TILT = 0.16; // back-angle (radians), pivoting at the nut
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

/** Rotate a point about the nut pivot to follow the headstock's back-angle. */
export function headstockPoint(x: number, y: number, z: number): [number, number, number] {
  const dx = x - NUT_X0;
  const c = Math.cos(HEADSTOCK_TILT);
  const s = Math.sin(HEADSTOCK_TILT);
  return [NUT_X0 + dx * c - y * s, dx * s + y * c, z];
}

/** Inline tuner posts, one per string, each directly behind its slot in the nut. */
export function postX(string: number): number {
  return -1.15 - string * 0.46;
}

export function postPoint(string: number): [number, number, number] {
  return headstockPoint(postX(string), 0, stringZ(string, 0));
}

/** Where a string wraps around its post (post-local y ≈ 0.12). */
export function wrapPoint(string: number): [number, number, number] {
  const [x, y, z] = postPoint(string);
  return [x - 0.12 * Math.sin(HEADSTOCK_TILT), y + 0.12 * Math.cos(HEADSTOCK_TILT), z];
}

/** Behind the nut the string leaves its slot slightly below the nut top. */
export const BEHIND_NUT_DROP = 0.005;

/**
 * The single source of truth for where a string physically runs, in
 * neck-local space: over the board (x ≥ 0), through its nut slot, and back to
 * its tuner post. The rendered strings, the highlight and the tap targets all
 * derive from this, so a highlight can only ever sit on its own string.
 */
export function stringPoint(string: number, x: number): [number, number, number] {
  if (x >= 0) return [x, stringHeight(x), stringZ(string, x)];
  if (x >= NUT_X0) return [x, stringHeight(0), stringZ(string, 0)];
  const a: [number, number, number] = [NUT_X0, stringHeight(0) - BEHIND_NUT_DROP, stringZ(string, 0)];
  const b = wrapPoint(string);
  const t = Math.min(1, (NUT_X0 - x) / (NUT_X0 - b[0]));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Where a finger (and the highlight) sits for a position. Open strings: on the nut. */
export function markerX(fret: number): number {
  if (fret === 0) return -NUT_DEPTH / 2;
  const a = fretX(fret - 1);
  const b = fretX(fret);
  return a + (b - a) * 0.58;
}

export function markerPoint(p: Position): [number, number, number] {
  return stringPoint(p.string, markerX(p.fret));
}

/**
 * Open-string halo footprint (neck-local): long along the string, narrower
 * than the string spacing across it, so it can't spill onto a neighbour.
 */
export const OPEN_HALO = { length: 1.1, width: 0.36 } as const;

/* ------------------------------------------------------------------ */
/* Neck → world (orientation and handedness)                          */
/* ------------------------------------------------------------------ */

export interface NeckView {
  /** Phone portrait: nut at the top of the screen, neck running down. */
  portrait: boolean;
  /** Mirror the neck for left-handed players. */
  leftHanded: boolean;
}

/**
 * Neck-local (x, z) → world (x, z) on the ground plane. The camera looks down
 * with world +X to the right of the screen and +Z towards its bottom (towards
 * the player). Landscape: nut at the left (right when left-handed), low E at
 * the bottom. Portrait: nut at the top, low E on the left (right when
 * left-handed). Used both to place the neck and to frame it, so the two can't
 * disagree.
 */
export function neckToWorld(x: number, z: number, view: NeckView): [number, number] {
  const wx = view.portrait ? -z : x;
  const wz = view.portrait ? x : z;
  return [view.leftHanded ? -wx : wx, wz];
}

/** The same mapping as a row-major 4×4 matrix (y is untouched), for `Matrix4.set`. */
export function neckMatrix(view: NeckView): number[] {
  const [xx, xz] = neckToWorld(1, 0, view);
  const [zx, zz] = neckToWorld(0, 1, view);
  return [xx, 0, zx, 0, 0, 1, 0, 0, xz, 0, zz, 0, 0, 0, 0, 1];
}

/** Tap cell for a position: [xMin, xMax, zMin, zMax]. */
export function cellRect(p: Position): [number, number, number, number] {
  const x0 = p.fret === 0 ? -HEADSTOCK_GAP : fretX(p.fret - 1) + 0.02;
  const x1 = p.fret === 0 ? 0.01 : fretX(p.fret) - 0.02;
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
