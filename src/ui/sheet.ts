import { create } from 'zustand';

/**
 * A desk sheet: a card laid on the desk in 3D (`src/three/Sheet.tsx`) with its words and
 * rules described here, in card units (x right, y up, origin at the centre of the card;
 * one unit is a little under a third of the card's width). The same description feeds the
 * accessible twin in `SheetLayer`, so the drawn labels and the real buttons cannot drift apart.
 */
export type SheetFont = 'roman' | 'smcp' | 'italic' | 'figures' | 'script';
export type SheetInk = 'ink' | 'soft' | 'quiet' | 'danger' | 'gilt' | 'iron';

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
  /** Degrees anticlockwise: a signature rides a little uphill. */
  tilt?: number;
  /** The control's own label: where its focus rule and press impression go when its rect holds several lines. */
  label?: boolean;
}

export interface SheetRule {
  kind: 'rule';
  y: number;
  x0: number;
  x1: number;
  /** `double` is the ledger's heading rule: a heavy line over a hairline; `ledger` the faint blue ruling of an account book. */
  weight?: 'hair' | 'double' | 'ledger';
}

/** A vertical rule from `y0` down to `y1`: the oxblood money columns of a ledger page (`double`: two close lines). */
export interface SheetColumn {
  kind: 'column';
  x: number;
  y0: number;
  y1: number;
  double?: boolean;
}

/** A wall on the floor plan, in iron-gall ink: an axis-aligned stroke from (x0, y0) to (x1, y1). */
export interface SheetWall {
  kind: 'wall';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Outer walls are drawn heavier. */
  outer?: boolean;
}

/**
 * A doorway on the floor plan, set in a gap of width `w` centred at (x, y) on a wall along `axis`.
 * The leaf hangs from the `hinge` end (−1: left or bottom, 1: right or top) and swings to `swing`
 * (−1: down or left, 1: up or right), drawn open with its arc; a `locked` door is drawn shut with a keyhole.
 */
export interface SheetDoor {
  kind: 'door';
  x: number;
  y: number;
  w: number;
  axis: 'h' | 'v';
  hinge: 1 | -1;
  swing: 1 | -1;
  locked?: boolean;
}

/** A chamber on the floor plan: a gilt wash over the floor and a gilt hairline cornice inside its walls. */
export interface SheetChamber {
  kind: 'chamber';
  x: number;
  y: number;
  w: number;
  h: number;
  quiet?: boolean;
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

/** A gilt rosette: the mark of a mastered stage. */
export interface SheetMark {
  kind: 'mark';
  x: number;
  y: number;
  /** Radius, card units (default 0.07). */
  r?: number;
}

/** A brass hairline frame round a cell, centred at (x, y). */
export interface SheetBox {
  kind: 'box';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A small gilt drawing for a room, centred at (x, y), `size` card units across. */
export interface SheetEmblem {
  kind: 'emblem';
  shape: 'fretboard' | 'echo' | 'blocks' | 'faces' | 'ledger' | 'nback';
  x: number;
  y: number;
  size: number;
  quiet?: boolean;
}

export type SheetItem =
  | SheetText
  | SheetRule
  | SheetColumn
  | SheetBar
  | SheetLozenge
  | SheetMark
  | SheetBox
  | SheetEmblem
  | SheetWall
  | SheetDoor
  | SheetChamber;

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
  /** A cypher engraved at the head of the page. */
  monogram?: boolean;
  /** A wax seal pressed on the page, centred here in card units. */
  seal?: { x: number; y: number };
  /** Frame the card alone, as large as the screen allows (a dense card; the neck leaves the shot). */
  solo?: boolean;
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
