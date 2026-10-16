import { create } from 'zustand';

/**
 * A desk sheet: a card laid on the desk in 3D (`src/three/Sheet.tsx`) with its words and
 * rules described here, in card units (x right, y up, origin at the centre of the card;
 * one unit is a little under a third of the card's width). The same description feeds the
 * accessible twin in `SheetLayer`, so the drawn labels and the real buttons cannot drift apart.
 */
export type SheetFont = 'roman' | 'smcp' | 'italic' | 'figures';
export type SheetInk = 'ink' | 'soft' | 'quiet' | 'danger';

export interface SheetText {
  kind: 'text';
  text: string;
  x: number;
  /** Baseline of a single line; the top of the first line when `maxWidth` wraps it. */
  y: number;
  size: number;
  font?: SheetFont;
  ink?: SheetInk;
  align?: 'left' | 'center' | 'right';
  /** Wrap width; the text block is anchored by `align` around `x`. */
  maxWidth?: number;
  lineHeight?: number;
}

export interface SheetRule {
  kind: 'rule';
  y: number;
  x0: number;
  x1: number;
  /** `double` is the ledger's heading rule: a heavy line over a hairline. */
  weight?: 'hair' | 'double';
}

export interface SheetBar {
  kind: 'bar';
  y: number;
  x0: number;
  x1: number;
  /** 0–1: the brass part of the hairline. */
  fill: number;
}

export interface SheetLozenge {
  kind: 'lozenge';
  x: number;
  y: number;
}

export type SheetItem = SheetText | SheetRule | SheetBar | SheetLozenge;

/** A real control, centred at (x, y) in card units, drawn over its 3D label. */
export interface SheetRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetGeom {
  /** A new key makes a new sheet: it slides in again. The same key only redraws. */
  key: string;
  width: number;
  height: number;
  items: SheetItem[];
  rects: SheetRect[];
}

/** The sheet currently on the desk (published by `SheetLayer`, read by the scene). */
export const useSheet = create<{ geom: SheetGeom | null; last: SheetGeom | null; show(g: SheetGeom | null): void }>()(
  (set, get) => ({
    geom: null,
    /** The sheet most recently shown: it stays drawn while it slides off the desk. */
    last: null,
    show: (geom) => set({ geom, last: geom ?? get().last }),
  }),
);

export const SHEET_WIDTH = 3.2;

/** A row cursor: sheets are laid out top to bottom. */
export function flow(width: number, top: number) {
  let y = top;
  return {
    get y() {
      return y;
    },
    gap(d: number) {
      y -= d;
      return y;
    },
    /** Returns the y it was placed at, then moves down by `h`. */
    take(h: number) {
      const at = y;
      y -= h;
      return at;
    },
    left: -width / 2,
    right: width / 2,
  };
}

/** Rough width of a run of Garamond at `size`, for placing a mark beside a word. */
export function measure(text: string, size: number, font: SheetFont = 'roman') {
  return text.length * size * (font === 'smcp' ? 0.6 : 0.44);
}
