/**
 * Where Echo's bells stand on the desk, in world units relative to the centre of the
 * leather mat (x right on screen, z towards the player). Landscape stands every bell on
 * one long walnut plinth; a phone, with the mat running up the screen, stands them on two
 * shorter plinths, one behind the other, so each bell stays a fingertip wide. Bells are
 * graduated: the lowest note is the largest, on the left, and the numbers run in reading
 * order (back row first on a phone).
 */
export interface BellSpot {
  x: number;
  z: number;
  /** Mouth radius. */
  r: number;
  row: number;
}

export interface Plinth {
  x: number;
  z: number;
  /** Length along x and depth along z. */
  w: number;
  d: number;
}

export interface BellLayout {
  bells: BellSpot[];
  plinths: Plinth[];
}

/** Rows on screen for `n` bells. */
export function bellRows(n: number, portrait: boolean): number {
  return portrait && n > 4 ? 2 : 1;
}

export function bellLayout(n: number, portrait: boolean): BellLayout {
  const rows = bellRows(n, portrait);
  const perRow = Math.ceil(n / rows);
  const spacing = portrait ? 1.06 : n <= 4 ? 1.36 : 1.18;
  const rMax = portrait ? 0.43 : n <= 4 ? 0.54 : 0.47;
  const rowGap = portrait ? 1.78 : 1.62;
  const bells: BellSpot[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const inRow = row === rows - 1 ? n - perRow * (rows - 1) : perRow;
    const col = i - row * perRow;
    const x = (col - (inRow - 1) / 2) * spacing;
    // Bells stand a little back on the plinth; the numbered tablets lie in front.
    const z = (rows === 1 ? 0 : (row - (rows - 1) / 2) * rowGap) - TABLET_STRIP / 2;
    // Graduated by pitch: the highest bell is 70% of the lowest.
    const r = rMax * (1 - (0.3 * i) / Math.max(1, n - 1));
    bells.push({ x, z, r, row });
  }
  const plinths: Plinth[] = [];
  for (let row = 0; row < rows; row++) {
    const inRow = bells.filter((b) => b.row === row);
    const d = 2 * rMax + 0.3 + TABLET_STRIP;
    plinths.push({ x: 0, z: inRow[0]!.z + TABLET_STRIP / 2, w: inRow.length * spacing + 0.34, d });
  }
  return { bells, plinths };
}

/** Depth of the strip along a plinth's front where the numbered tablets lie. */
export const TABLET_STRIP = 0.34;

/** Plinth height and the height of a bell (mouth to handle top) over its mouth radius. */
export const PLINTH_H = 0.2;
export const BELL_HEIGHT = 1.32;
export const HANDLE_HEIGHT = 1.02;
