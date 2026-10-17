/**
 * Where the portraits stand on the desk. Each frame leans back on its brass stand at the
 * camera's own angle, so it faces the player square on; a frame's place is set in the
 * picture plane (x across the screen, v up it, in world units) and then put down on the
 * desk. Two arrangements share one camera: a single portrait large in the middle, and four
 * smaller ones (a row on a wide screen, two by two on a phone), so the camera holds still
 * from question to question.
 */

/** The painted canvas, and the frame's moulding round it (world units at scale 1). */
export const CANVAS_W = 1.6;
export const CANVAS_H = 2.0;
export const MOULDING = 0.2;
export const FRAME_W = CANVAS_W + 2 * MOULDING;
export const FRAME_H = CANVAS_H + 2 * MOULDING;

/** Camera elevation (degrees above the desk), and so the frames' lean. */
export const elevation = (portrait: boolean) => (portrait ? 36 : 28);

export interface Slot {
  /** Across the screen, and up it (the frame's centre), world units. */
  x: number;
  v: number;
  scale: number;
}

const SINGLE = { landscape: 1.45, portrait: 1.42 };
const FOUR = { landscape: 0.86, portrait: 0.84 };
const GAP = 0.34;

/** The large single portrait. */
export function singleSlot(portrait: boolean): Slot {
  return { x: 0, v: portrait ? 0 : 0, scale: SINGLE[portrait ? 'portrait' : 'landscape'] };
}

/** Four portraits: a row on a wide screen, two by two on a phone, in reading order. */
export function fourSlots(portrait: boolean): Slot[] {
  const s = FOUR[portrait ? 'portrait' : 'landscape'];
  const w = FRAME_W * s + GAP;
  const h = FRAME_H * s + GAP;
  if (portrait)
    return [
      { x: -w / 2, v: h / 2, scale: s },
      { x: w / 2, v: h / 2, scale: s },
      { x: -w / 2, v: -h / 2, scale: s },
      { x: w / 2, v: -h / 2, scale: s },
    ];
  return [0, 1, 2, 3].map((i) => ({ x: (i - 1.5) * w, v: 0, scale: s }));
}

/** A frame's foot on the desk (x, z) for a slot: the lean carries its centre up the screen. */
export function footOf(slot: Slot, portrait: boolean): { x: number; z: number } {
  const el = (elevation(portrait) * Math.PI) / 180;
  // The picture plane's up runs (0, cos el, -sin el); a foot at depth z sits -z·sin(el) up it.
  return { x: slot.x, z: ((FRAME_H * slot.scale) / 2 - slot.v) / Math.sin(el) };
}
