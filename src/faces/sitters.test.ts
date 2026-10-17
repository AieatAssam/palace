import { describe, expect, it } from 'vitest';
import { seedOf } from '../blocks/layout';
import { TRADES, castSeed, describe as describeLook, likeness, makeCast, makeSitter, type Look } from './sitters';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

describe('makeSitter', () => {
  it('gives the same sitter from the same seed', () => {
    const a = makeSitter(123456);
    const b = makeSitter(123456);
    expect(a).toEqual(b);
    expect(makeSitter(123456)).toEqual(a);
  });

  it('gives different ids for different seeds', () => {
    const ids = new Set(SEEDS.map((s) => makeSitter(s).id));
    expect(ids.size).toBe(SEEDS.length);
    expect(makeSitter(1).id).not.toBe(makeSitter(2).id);
  });

  it('uses the seed, in base 36, as its id', () => {
    expect(makeSitter(0).id).toBe('0');
    expect(makeSitter(35).id).toBe('z');
    expect(makeSitter(1_000_000).id).toBe((1_000_000).toString(36));
  });

  it('keeps the name, given and family consistent', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const s = makeSitter(seed);
      expect(s.name).toBe(`${s.given} ${s.family}`);
      expect(TRADES).toContain(s.trade);
    }
  });

  it('keeps every numeric field inside its documented range', () => {
    for (const seed of SEEDS) {
      const { look: l } = makeSitter(seed);
      const f = l.presenting === 'f';
      expect(l.headW).toBeGreaterThanOrEqual(f ? 0.7 : 0.74);
      expect(l.headW).toBeLessThanOrEqual(f ? 0.8 : 0.86);
      expect(l.jaw).toBeGreaterThanOrEqual(f ? 0.55 : 0.66);
      expect(l.jaw).toBeLessThanOrEqual(f ? 0.74 : 0.9);
      for (const v of [l.chin, l.eyeSet, l.nose, l.mouth, l.brow]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(l.turn).toBeGreaterThanOrEqual(-0.6);
      expect(l.turn).toBeLessThanOrEqual(0.6);
      expect(l.grey === 0 || (l.grey >= 0.35 && l.grey <= 0.85)).toBe(true);
    }
  });

  it('gives women no beard', () => {
    const women = SEEDS.map(makeSitter).filter((s) => s.look.presenting === 'f');
    expect(women.length).toBeGreaterThan(0);
    for (const s of women) expect(s.look.beard).toBe('none');
  });

  it('gives men no pearls', () => {
    // Spec said "pearls false for presenting 'f'"; the code gates pearls on women (f && roll),
    // so men are never pearled and some women are. This test pins the code's behaviour.
    const men = SEEDS.map(makeSitter).filter((s) => s.look.presenting === 'm');
    expect(men.length).toBeGreaterThan(0);
    for (const s of men) expect(s.look.pearls).toBe(false);
  });
});

describe('makeCast', () => {
  it('gives the same cast from the same seed, in the same order', () => {
    const a = makeCast(castSeed('four'), 4).map((s) => [s.id, s.name]);
    const b = makeCast(castSeed('four'), 4).map((s) => [s.id, s.name]);
    expect(a).toEqual(b);
  });

  it('returns exactly n sitters for n of 4, 6 and 8', () => {
    for (const n of [4, 6, 8]) {
      for (const seed of [1, 2, 3, 99, 4096]) {
        expect(makeCast(seed, n)).toHaveLength(n);
      }
    }
  });

  it('gives unique given names, family names and trades', () => {
    for (const seed of [1, 2, 3, 17, 42, 1234]) {
      const cast = makeCast(seed, 8);
      expect(new Set(cast.map((s) => s.given)).size).toBe(8);
      expect(new Set(cast.map((s) => s.family)).size).toBe(8);
      expect(new Set(cast.map((s) => s.trade)).size).toBe(8);
    }
  });

  it('alternates presenting, so women and men are near-equal', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 100, 101]) {
      for (const n of [4, 6, 8]) {
        const cast = makeCast(seed, n);
        const f = cast.filter((s) => s.look.presenting === 'f').length;
        const m = cast.filter((s) => s.look.presenting === 'm').length;
        expect(Math.abs(f - m)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives different casts from different seeds', () => {
    const ids = (seed: number) => makeCast(seed, 6).map((s) => s.id).join(',');
    expect(ids(1)).not.toBe(ids(2));
    expect(ids(castSeed('four'))).not.toBe(ids(castSeed('eight')));
  });
});

describe('castSeed', () => {
  it('is stable for the same key', () => {
    expect(castSeed('four')).toBe(castSeed('four'));
    expect(castSeed('four')).toBe(seedOf('faces:four'));
  });

  it('differs between stage keys', () => {
    expect(castSeed('four')).not.toBe(castSeed('eight'));
  });
});

describe('describe', () => {
  it('opens with "A woman" or "A man" and ends with "ground."', () => {
    for (const seed of SEEDS) {
      const s = makeSitter(seed);
      const text = describeLook(s.look);
      expect(text.startsWith(s.look.presenting === 'f' ? 'A woman' : 'A man')).toBe(true);
      expect(text.endsWith('ground.')).toBe(true);
    }
  });

  it('never contains "undefined"', () => {
    for (const seed of SEEDS) {
      expect(describeLook(makeSitter(seed).look)).not.toContain('undefined');
    }
  });

  it('does not contain the sitter name', () => {
    for (const seed of SEEDS) {
      const s = makeSitter(seed);
      const text = describeLook(s.look);
      expect(text).not.toContain(s.name);
      expect(text).not.toContain(s.given);
      expect(text).not.toContain(s.family);
    }
  });
});

describe('likeness', () => {
  it('scores a look against itself above a different-looking sitter', () => {
    const a = makeSitter(777).look;
    const b: Look = {
      ...a,
      presenting: a.presenting === 'f' ? 'm' : 'f',
      hairStyle: a.hairStyle === 'bun' ? 'crop' : 'bun',
      hair: a.hair === '#1c1512' ? '#c9a46a' : '#1c1512',
      ground: a.ground === '#3a2a1c' ? '#22304a' : '#3a2a1c',
      coat: a.coat === '#5a1a1e' ? '#1c2840' : '#5a1a1e',
      attire: a.attire === 'gown' ? 'tweed' : 'gown',
      beard: 'none',
    };
    expect(likeness(a, a)).toBeGreaterThan(likeness(a, b));
    expect(likeness(a, b)).toBe(0);
  });

  it('is symmetric', () => {
    const a = makeSitter(11).look;
    const b = makeSitter(12).look;
    expect(likeness(a, b)).toBe(likeness(b, a));
  });
});
