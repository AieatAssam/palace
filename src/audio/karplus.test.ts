import { describe, expect, it } from 'vitest';
import { frequencyAt } from '../game/notes';
import { estimatePitch, karplusStrong } from './karplus';

function lcg(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const SR = 48_000;

describe('karplusStrong', () => {
  it('renders the requested duration', () => {
    const out = karplusStrong(110, SR, { duration: 0.5, rng: lcg() });
    expect(out.length).toBe(SR / 2);
  });

  it.each([
    [0, 0],
    [0, 5],
    [1, 3],
    [2, 7],
    [3, 9],
    [4, 1],
    [5, 0],
    [5, 12],
  ])('is in tune for string %i fret %i (±10 cents)', (string, fret) => {
    const f = frequencyAt({ string, fret });
    const out = karplusStrong(f, SR, { duration: 0.6, rng: lcg(string * 31 + fret) });
    const est = estimatePitch(out.subarray(2000), SR);
    expect(Math.abs(cents(est, f))).toBeLessThan(10);
  });

  it('decays over time and stays bounded', () => {
    const out = karplusStrong(196, SR, { duration: 2, rng: lcg(7) });
    const rms = (from: number, to: number) => {
      let s = 0;
      for (let i = from; i < to; i++) s += out[i]! ** 2;
      return Math.sqrt(s / (to - from));
    };
    expect(rms(0, 4800)).toBeGreaterThan(rms(SR, SR + 4800));
    for (const v of out) expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
  });
});
