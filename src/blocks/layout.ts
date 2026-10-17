/**
 * Where the blocks lie on the blotter, in world units relative to the blotter's centre
 * (x right on screen, z towards the player). Like Corsi's board the blocks are scattered,
 * not gridded: each is placed by best-candidate sampling (of a dozen tries, the one
 * farthest from the blocks already down), so the board spreads evenly without rows. Every
 * pair of blocks keeps `MIN_CENTRES` apart, which holds even when both are turned to their
 * full `MAX_TURN`; if sampling ever fails, a jittered grid stands in.
 *
 * A phone, with the mat running up the screen, gets a tall board; a wide screen a wide one.
 * Blocks are numbered in reading order: back row first, left to right.
 */
import type { Rng } from './logic';

export type Finish = 'rosewood' | 'ebony' | 'rosewood-brass' | 'ebony-brass';

export interface BlockSpot {
  x: number;
  z: number;
  /** Turn about the vertical, radians. */
  turn: number;
  finish: Finish;
}

export interface BlockBoard {
  blocks: BlockSpot[];
  /** The scatter area (block centres keep `MARGIN` inside it); the blotter is a little larger. */
  w: number;
  d: number;
}

/** A block: a lacquered cube a little lower than it is wide. */
export const BLOCK_SIZE = 0.62;
export const BLOCK_HEIGHT = 0.34;
/** Most a block is turned from square, radians (about 12°). */
export const MAX_TURN = 0.21;
/** Block centres stay this far apart: two blocks at full turn still keep a gap of a quarter block. */
export const MIN_CENTRES = 0.94;
/** Block centres stay this far inside the scatter area's edge. */
export const MARGIN = 0.42;
/** The blotter's border beyond the scatter area. */
export const BLOTTER_RIM = 0.3;

/** Half the widest a block reaches from its centre at a given turn (its footprint is a turned square). */
export function blockReach(turn: number): number {
  return (BLOCK_SIZE / 2) * (Math.abs(Math.cos(turn)) + Math.abs(Math.sin(turn)));
}

const AREAS: Record<9 | 12 | 16, { landscape: [number, number]; portrait: [number, number] }> = {
  9: { landscape: [6.0, 3.3], portrait: [3.5, 5.2] },
  12: { landscape: [6.8, 3.5], portrait: [3.7, 5.9] },
  16: { landscape: [7.6, 3.9], portrait: [3.9, 6.8] },
};

/** The scatter area for a board of `n` blocks, [width, depth]. */
export function boardArea(n: 9 | 12 | 16, portrait: boolean): [number, number] {
  return AREAS[n][portrait ? 'portrait' : 'landscape'];
}

/** A small seeded random source (mulberry32), so a stage's board is the same every visit. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string's seed (FNV-1a): a fixed stage's board comes from its id. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const FINISHES: readonly Finish[] = ['rosewood', 'ebony', 'rosewood-brass', 'ebony-brass'];

/** Best-candidate scatter; null if a block found no room. */
function scatter(n: number, w: number, d: number, rng: Rng): { x: number; z: number }[] | null {
  const pts: { x: number; z: number }[] = [];
  const hx = w / 2 - MARGIN;
  const hz = d / 2 - MARGIN;
  for (let i = 0; i < n; i++) {
    let best: { x: number; z: number } | null = null;
    let bestGap = -Infinity;
    for (let k = 0; k < 14; k++) {
      const c = { x: (rng() * 2 - 1) * hx, z: (rng() * 2 - 1) * hz };
      const gap = pts.reduce((m, p) => Math.min(m, Math.hypot(p.x - c.x, p.z - c.z)), Infinity);
      if (gap > bestGap) {
        bestGap = gap;
        best = c;
      }
    }
    if (!best || bestGap < MIN_CENTRES) return null;
    pts.push(best);
  }
  return pts;
}

/** The stand-in: a grid of cells a block wide or more, a block in some of them, nudged off centre. */
function jitteredGrid(n: number, w: number, d: number, rng: Rng): { x: number; z: number }[] {
  const uw = w - 2 * MARGIN;
  const ud = d - 2 * MARGIN;
  let cols = Math.max(1, Math.floor(uw / MIN_CENTRES) + 1);
  let rows = Math.max(1, Math.floor(ud / MIN_CENTRES) + 1);
  while (cols * rows < n) {
    if (cols <= rows) cols++;
    else rows++;
  }
  const sx = cols > 1 ? uw / (cols - 1) : 0;
  const sz = rows > 1 ? ud / (rows - 1) : 0;
  const cells = Array.from({ length: cols * rows }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  // Each block may wander from its cell's centre by whatever the spacing spares.
  const jx = Math.max(0, (sx - MIN_CENTRES) / 2);
  const jz = Math.max(0, (sz - MIN_CENTRES) / 2);
  return cells.slice(0, n).map((c) => {
    const col = c % cols;
    const row = Math.floor(c / cols);
    return {
      x: -uw / 2 + col * sx + (rng() * 2 - 1) * jx,
      z: -ud / 2 + row * sz + (rng() * 2 - 1) * jz,
    };
  });
}

/** A board of `n` blocks from the given seed. */
export function blockLayout(n: 9 | 12 | 16, portrait: boolean, seed: number): BlockBoard {
  const [w, d] = boardArea(n, portrait);
  const rng = seeded(seed);
  let pts: { x: number; z: number }[] | null = null;
  for (let attempt = 0; attempt < 40 && !pts; attempt++) pts = scatter(n, w, d, rng);
  pts ??= jitteredGrid(n, w, d, rng);
  // Reading order: rows by depth (blocks within a block's depth of each other share a row), then left to right.
  const sorted = [...pts].sort((a, b) => a.z - b.z);
  const rowsOf: { x: number; z: number }[][] = [];
  for (const p of sorted) {
    const row = rowsOf[rowsOf.length - 1];
    if (row && Math.abs(p.z - row[0]!.z) < BLOCK_SIZE * 0.9) row.push(p);
    else rowsOf.push([p]);
  }
  const ordered = rowsOf.flatMap((r) => r.sort((a, b) => a.x - b.x));
  // Finishes are dealt round the board so neighbours rarely match.
  const deal = Math.floor(rng() * FINISHES.length);
  const blocks = ordered.map((p, i) => ({
    x: p.x,
    z: p.z,
    turn: (rng() * 2 - 1) * MAX_TURN,
    finish: FINISHES[(i * 3 + deal) % FINISHES.length]!,
  }));
  return { blocks, w, d };
}
