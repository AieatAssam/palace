import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_FRET, type Position, STRING_COUNT } from '../game/notes';
import {
  NUT_X0,
  type NeckView,
  OPEN_HALO,
  cellRect,
  fretX,
  followWindow,
  markerPoint,
  markerX,
  neckMatrix,
  neckToWorld,
  regionBounds,
  regionSpan,
  resolveTap,
  stringPoint,
  stringSpacing,
  stringZ,
  tapRect,
  wrapPoint,
} from './layout';

describe('neck layout', () => {
  it('places the 12th fret at half the scale length', () => {
    expect(fretX(12)).toBeCloseTo(13);
    expect(fretX(0)).toBe(0);
  });

  it('frets get closer together up the neck', () => {
    for (let n = 1; n < 12; n++) expect(fretX(n + 1) - fretX(n)).toBeLessThan(fretX(n) - fretX(n - 1));
  });

  it('puts markers inside their cells', () => {
    for (let f = 0; f <= 12; f++) {
      const [x0, x1] = cellRect({ string: 0, fret: f });
      expect(markerX(f)).toBeGreaterThan(x0);
      expect(markerX(f)).toBeLessThan(x1);
    }
  });

  it('low E sits nearest the player (+Z)', () => {
    expect(stringZ(0, 0)).toBeGreaterThan(stringZ(5, 0));
  });

  it('widens edge tap cells when the neighbour is locked', () => {
    const p = { string: 1, fret: 3 };
    const plain = cellRect(p);
    const wide = tapRect(p, [0, 1]);
    expect(wide[2]).toBeLessThan(plain[2]); // -Z side (towards locked D) grows
    expect(wide[3]).toBe(plain[3]); // +Z neighbour (low E) is unlocked
  });

  it('forgives a near-miss toward an adjacent target, but not a clear miss', () => {
    const target = { string: 0, fret: 3 };
    const hit = { string: 1, fret: 3 };
    const x = markerX(3);
    const sp = stringSpacing(x);
    const nearBoundary = stringZ(0, x) - sp * 0.6;
    expect(resolveTap(hit, x, nearBoundary, [target])).toEqual(target);
    const onString = stringZ(1, x);
    expect(resolveTap(hit, x, onString, [target])).toEqual(hit);
    // Different fret: never forgiven.
    expect(resolveTap({ string: 1, fret: 2 }, x, nearBoundary, [target])).toEqual({ string: 1, fret: 2 });
  });
});

describe('highlight ↔ string mapping', () => {
  const views: NeckView[] = [
    { portrait: false, leftHanded: false },
    { portrait: false, leftHanded: true },
    { portrait: true, leftHanded: false },
    { portrait: true, leftHanded: true },
  ];
  const positions: Position[] = [];
  for (let s = 0; s < STRING_COUNT; s++) for (let f = 0; f <= MAX_FRET; f++) positions.push({ string: s, fret: f });

  const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

  it('puts every marker on its own string, and nearer it than any other', () => {
    for (const p of positions) {
      const mk = markerPoint(p);
      expect(dist(mk, stringPoint(p.string, mk[0]))).toBeCloseTo(0, 9);
      for (let s = 0; s < STRING_COUNT; s++) {
        if (s === p.string) continue;
        // Clearly closer: at least 80% of the way out to the neighbour.
        expect(dist(mk, stringPoint(s, mk[0]))).toBeGreaterThan(stringSpacing(Math.max(0, mk[0])) * 0.8);
      }
    }
  });

  it('puts open-string markers on the nut, fretted ones between their frets', () => {
    for (const p of positions) {
      const x = markerX(p.fret);
      if (p.fret === 0) {
        expect(x).toBeGreaterThanOrEqual(NUT_X0);
        expect(x).toBeLessThanOrEqual(0);
      } else {
        expect(x).toBeGreaterThan(fretX(p.fret - 1));
        expect(x).toBeLessThan(fretX(p.fret));
      }
    }
  });

  it('keeps the open-string halo narrower than the gap to the next string', () => {
    expect(OPEN_HALO.width).toBeLessThan(stringSpacing(0));
  });

  it('runs each string straight back from its nut slot to its own post, without crossing', () => {
    for (let s = 0; s < STRING_COUNT; s++) {
      expect(stringPoint(s, NUT_X0 - 1e-6)[2]).toBeCloseTo(stringZ(s, 0));
      expect(stringPoint(s, -50)[2]).toBeCloseTo(wrapPoint(s)[2]);
    }
    for (let x = -0.5; x > -4; x -= 0.25) {
      for (let s = 1; s < STRING_COUNT; s++) expect(stringPoint(s - 1, x)[2]).toBeGreaterThan(stringPoint(s, x)[2]);
    }
  });

  it('agrees with three.js: the neck matrix maps points exactly as the framing does', () => {
    for (const view of views) {
      const m = new THREE.Matrix4().set(...(neckMatrix(view) as Parameters<THREE.Matrix4['set']>));
      expect(Math.sign(m.determinant())).toBe(view.leftHanded ? -1 : 1);
      for (const p of positions) {
        const [x, y, z] = markerPoint(p);
        const w = new THREE.Vector3(x, y, z).applyMatrix4(m);
        const [wx, wz] = neckToWorld(x, z, view);
        expect(w.x).toBeCloseTo(wx);
        expect(w.y).toBeCloseTo(y);
        expect(w.z).toBeCloseTo(wz);
      }
    }
  });

  // On screen: world +X is right, world +Z is down (towards the player).
  const screen = (p: Position, view: NeckView) => {
    const [x, , z] = markerPoint(p);
    const [sx, sy] = neckToWorld(x, z, view);
    return { sx, sy };
  };

  it('orients the neck as a player expects, in both hands and both orientations', () => {
    for (const view of views) {
      const nut = screen({ string: 0, fret: 0 }, view);
      const twelfth = screen({ string: 0, fret: 12 }, view);
      const lowE = screen({ string: 0, fret: 5 }, view);
      const highE = screen({ string: 5, fret: 5 }, view);
      if (!view.portrait) {
        // Landscape: low E along the bottom (nearest the player); nut left, or right when left-handed.
        expect(lowE.sy).toBeGreaterThan(highE.sy);
        expect(Math.sign(twelfth.sx - nut.sx)).toBe(view.leftHanded ? -1 : 1);
      } else {
        // Portrait: nut at the top; low E on the left, or the right when left-handed.
        expect(twelfth.sy).toBeGreaterThan(nut.sy);
        expect(Math.sign(highE.sx - lowE.sx)).toBe(view.leftHanded ? -1 : 1);
      }
    }
  });

  it('keeps all six strings in order across the neck in every view (no swapped neighbours)', () => {
    for (const view of views) {
      for (const fret of [0, 1, 7, 12]) {
        const across = Array.from({ length: STRING_COUNT }, (_, s) => {
          const q = screen({ string: s, fret }, view);
          return view.portrait ? q.sx : q.sy;
        });
        const steps = across.slice(1).map((v, i) => Math.sign(v - across[i]!));
        expect(new Set(steps).size).toBe(1);
        expect(steps[0]).not.toBe(0);
      }
    }
  });
});

describe('follow window and region spans', () => {
  it('leaves x0 alone when the span is already covered', () => {
    expect(followWindow(5, 10, 0, 100, 6, 8)).toBe(5);
  });

  it('slides the least distance when the span runs past the window end', () => {
    // [0, 10] must cover [5, 14]: the minimal slide is to x0 = 4.
    expect(followWindow(0, 10, 0, 100, 5, 14)).toBe(4);
  });

  it('slides back when the span starts before the window', () => {
    expect(followWindow(20, 10, 0, 100, 12, 15)).toBe(12);
  });

  it('clamps the result into [lo, hi - len]', () => {
    // Would slide to -4 without the clamp; lo = 5 wins.
    expect(followWindow(30, 10, 5, 50, -20, -18)).toBe(5);
    // Span beyond hi forces x = 45, clamped to hi - len = 40.
    expect(followWindow(0, 10, 0, 50, 55, 55)).toBe(40);
  });

  it('centres a span wider than the window', () => {
    // Span [20, 40] has centre 30; a window of 10 centred there starts at 25.
    expect(followWindow(0, 10, 0, 100, 20, 40)).toBe(25);
  });

  it('regionSpan grows with the fret limit and keeps the same start', () => {
    expect(regionSpan(5).x0).toBe(regionSpan(12).x0);
    expect(regionSpan(5).x1).toBeLessThan(regionSpan(12).x1);
  });

  it('regionBounds echoes a span override in x0/x1', () => {
    const span = { x0: -1, x1: 20 };
    const b = regionBounds(12, undefined, span);
    expect(b.x0).toBe(-1);
    expect(b.x1).toBe(20);
    const banded = regionBounds(12, [0, 1], span);
    expect(banded.x0).toBe(-1);
    expect(banded.x1).toBe(20);
  });

  it('regionBounds without an override uses regionSpan', () => {
    const b = regionBounds(9);
    expect(b.x0).toBe(regionSpan(9).x0);
    expect(b.x1).toBe(regionSpan(9).x1);
  });
});
