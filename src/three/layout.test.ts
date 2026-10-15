import { describe, expect, it } from 'vitest';
import { cellRect, fretX, markerX, resolveTap, stringSpacing, stringZ, tapRect } from './layout';

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
