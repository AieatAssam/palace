import { describe, expect, it } from 'vitest';
import { HANDBELL_PARTIALS, bellScale, pairGain } from './bells';

const SETS = [4, 6, 8] as const;

describe('bellScale', () => {
  it('gives four, six or eight bells as asked', () => {
    expect(bellScale(4)).toHaveLength(4);
    expect(bellScale(6)).toHaveLength(6);
    expect(bellScale(8)).toHaveLength(8);
  });

  it('rises strictly in pitch, lowest bell first', () => {
    for (const n of SETS) {
      const freqs = bellScale(n).map((b) => b.freq);
      for (let i = 1; i < freqs.length; i++) {
        expect(freqs[i]!).toBeGreaterThan(freqs[i - 1]!);
      }
    }
  });

  it('tunes C5 to about 523.25 Hz where the set includes it', () => {
    for (const n of SETS) {
      const c5 = bellScale(n).find((b) => b.name === 'C5');
      if (c5) expect(Math.abs(c5.freq - 523.25)).toBeLessThan(0.01);
    }
  });

  it('tunes A4 to 440 Hz in the eight-bell set', () => {
    const a4 = bellScale(8).find((b) => b.name === 'A4');
    expect(a4).toBeDefined();
    expect(Math.abs(a4!.freq - 440)).toBeLessThan(0.01);
  });

  it('never pairs two bells on a minor second or tritone', () => {
    for (const n of SETS) {
      const freqs = bellScale(n).map((b) => b.freq);
      for (let i = 0; i < freqs.length; i++) {
        for (let j = i + 1; j < freqs.length; j++) {
          const semitones = Math.round(12 * Math.log2(freqs[j]! / freqs[i]!));
          expect([1, 6, 11]).not.toContain(((semitones % 12) + 12) % 12);
        }
      }
    }
  });
});

describe('HANDBELL_PARTIALS', () => {
  it('has the struck note at unity gain', () => {
    const prime = HANDBELL_PARTIALS.find((p) => p.ratio === 1);
    expect(prime).toBeDefined();
    expect(prime!.gain).toBe(1);
  });

  it('has the twelfth (ratio 3) as the second-loudest partial', () => {
    const byGain = [...HANDBELL_PARTIALS].sort((a, b) => b.gain - a.gain);
    expect(byGain[0]!.ratio).toBe(1);
    expect(byGain[1]!.ratio).toBe(3);
  });
});

describe('pairGain', () => {
  it('leaves a single bell at full level', () => {
    expect(pairGain(1)).toBe(1);
  });

  it('drops a pair to about 0.7071 each', () => {
    expect(pairGain(2)).toBeCloseTo(0.7071, 4);
  });
});
