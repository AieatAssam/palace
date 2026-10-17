import { describe, expect, it } from 'vitest';
import {
  BLOCK_SIZE,
  BLOTTER_RIM,
  MAX_TURN,
  MIN_CENTRES,
  blockLayout,
  blockReach,
  boardArea,
  seedOf,
  seeded,
  type BlockBoard,
} from './layout';

const COUNTS = [9, 12, 16] as const;
const ORIENTATIONS = [true, false] as const;
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const EPS = 1e-9;
const PHONE_PX = 412;
const DESKTOP_PX = 960;

/** A label for one board, so a failure names the seed, count and orientation. */
function where(n: number, portrait: boolean, seed: number): string {
  return `n=${n} ${portrait ? 'portrait' : 'landscape'} seed=${seed}`;
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('blockLayout', () => {
  for (const n of COUNTS) {
    for (const portrait of ORIENTATIONS) {
      describe(`${n} blocks, ${portrait ? 'portrait' : 'landscape'}`, () => {
        it('places exactly n blocks inside the scatter area', () => {
          const bad: string[] = [];
          for (const seed of SEEDS) {
            const { blocks, w, d } = blockLayout(n, portrait, seed);
            if (blocks.length !== n) bad.push(`${where(n, portrait, seed)} got ${blocks.length}`);
            for (const b of blocks) {
              const r = blockReach(b.turn);
              if (Math.abs(b.x) + r > w / 2 + EPS) bad.push(`${where(n, portrait, seed)} x=${b.x.toFixed(3)} reach=${r.toFixed(3)} w/2=${(w / 2).toFixed(3)}`);
              if (Math.abs(b.z) + r > d / 2 + EPS) bad.push(`${where(n, portrait, seed)} z=${b.z.toFixed(3)} reach=${r.toFixed(3)} d/2=${(d / 2).toFixed(3)}`);
            }
          }
          expect(bad).toEqual([]);
        });

        it('keeps every turn within MAX_TURN', () => {
          const bad: string[] = [];
          for (const seed of SEEDS) {
            for (const b of blockLayout(n, portrait, seed).blocks) {
              if (Math.abs(b.turn) > MAX_TURN + EPS) bad.push(`${where(n, portrait, seed)} turn=${b.turn}`);
            }
          }
          expect(bad).toEqual([]);
        });

        it('never overlaps: centres stay MIN_CENTRES apart and turned squares do not intersect', () => {
          const bad: string[] = [];
          for (const seed of SEEDS) {
            const { blocks } = blockLayout(n, portrait, seed);
            for (let i = 0; i < blocks.length; i++) {
              for (let j = i + 1; j < blocks.length; j++) {
                const a = blocks[i]!;
                const b = blocks[j]!;
                const d = dist(a, b);
                if (d < MIN_CENTRES - EPS) bad.push(`${where(n, portrait, seed)} pair ${i},${j} centres ${d.toFixed(3)} < MIN_CENTRES ${MIN_CENTRES}`);
                const sep = blockReach(a.turn) + blockReach(b.turn);
                if (d <= sep) bad.push(`${where(n, portrait, seed)} pair ${i},${j} centres ${d.toFixed(3)} <= reach sum ${sep.toFixed(3)}`);
              }
            }
          }
          expect(bad).toEqual([]);
        });

        it('keeps blocks tappable on the phone or desktop viewport it is meant for', () => {
          const [w] = boardArea(n, portrait);
          const viewport = portrait ? PHONE_PX : DESKTOP_PX;
          const pxPerUnit = (viewport * 0.92) / (w + 2 * BLOTTER_RIM);
          expect(BLOCK_SIZE * pxPerUnit).toBeGreaterThanOrEqual(44);
          expect(MIN_CENTRES * pxPerUnit).toBeGreaterThanOrEqual(48);
        });

        it('gives the identical board from the same seed', () => {
          for (const seed of [1, 77, 4096]) {
            expect(blockLayout(n, portrait, seed)).toEqual(blockLayout(n, portrait, seed));
          }
        });

        it('gives different boards from different seeds', () => {
          for (const seed of [1, 2, 3, 50]) {
            const a = blockLayout(n, portrait, seed);
            const b = blockLayout(n, portrait, seed + 1000);
            const differs = a.blocks.some((blk, i) => blk.x !== b.blocks[i]!.x || blk.z !== b.blocks[i]!.z);
            expect(differs, where(n, portrait, seed)).toBe(true);
          }
        });

        it('lists blocks in reading order, back rows first', () => {
          const bad: string[] = [];
          for (const seed of SEEDS) {
            const { blocks } = blockLayout(n, portrait, seed);
            for (let i = 0; i < blocks.length; i++) {
              for (let j = i + 1; j < blocks.length; j++) {
                if (blocks[j]!.z < blocks[i]!.z - BLOCK_SIZE * 0.9 - EPS) {
                  bad.push(`${where(n, portrait, seed)} block ${j} z=${blocks[j]!.z.toFixed(3)} sits behind block ${i} z=${blocks[i]!.z.toFixed(3)}`);
                }
              }
            }
          }
          expect(bad).toEqual([]);
        });

        it('uses at least three of the four finishes', () => {
          const bad: string[] = [];
          for (const seed of SEEDS) {
            const used = new Set(blockLayout(n, portrait, seed).blocks.map((b) => b.finish));
            if (used.size < 3) bad.push(`${where(n, portrait, seed)} only ${used.size} finishes`);
          }
          expect(bad).toEqual([]);
        });
      });
    }
  }
});

describe('blockLayout board area', () => {
  it('gives every board the area its block count and orientation asks for', () => {
    const board: BlockBoard = blockLayout(9, true, 5);
    expect([board.w, board.d]).toEqual(boardArea(9, true));
  });
});

describe('seedOf', () => {
  it('gives the same seed for the same string', () => {
    expect(seedOf('blocks:span')).toBe(seedOf('blocks:span'));
  });

  it('gives different seeds for different strings', () => {
    expect(seedOf('blocks:span')).not.toBe(seedOf('blocks:long'));
    expect(seedOf('blocks:shifting')).not.toBe(seedOf('blocks:span'));
  });

  it('gives an unsigned 32-bit seed', () => {
    for (const s of ['', 'blocks:span', 'a much longer string for the hash to chew on']) {
      const v = seedOf(s);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('seeded', () => {
  it('returns values in [0, 1)', () => {
    for (const seed of [0, 1, 12345, 0xffffffff]) {
      const rng = seeded(seed);
      for (let i = 0; i < 1000; i++) {
        const v = rng();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('repeats the same sequence from the same seed', () => {
    const a = seeded(99);
    const b = seeded(99);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
});
