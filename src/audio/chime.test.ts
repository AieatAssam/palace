import { describe, expect, it } from 'vitest';
import { BEAT_HZ, BELL_PARTIALS, chimeNotes } from './chime';

describe('chimeNotes milestone', () => {
  it('strikes two notes: the tier note, then the fifth above it a breath later', () => {
    const notes = chimeNotes('milestone', 1);
    expect(notes).toHaveLength(2);
    expect(notes[0]!.delay).toBe(0);
    expect(notes[1]!.delay).toBeGreaterThan(0);
    expect(notes[1]!.freq / notes[0]!.freq).toBeCloseTo(1.4983, 3);
  });

  it('opens on G5 for tier 1', () => {
    expect(chimeNotes('milestone', 1)[0]!.freq).toBeCloseTo(783.99, 1);
  });

  it('does not fall in pitch as tiers rise, and stays below 2000 Hz', () => {
    const roots = [1, 2, 3, 4, 5, 6, 7, 8].map((t) => chimeNotes('milestone', t)[0]!.freq);
    for (let i = 1; i < roots.length; i++) {
      expect(roots[i]!).toBeGreaterThanOrEqual(roots[i - 1]!);
    }
    for (const f of roots) expect(f).toBeLessThan(2000);
  });
});

describe('chimeNotes mastered', () => {
  it('rolls four notes up to the octave with strictly increasing delays and pitches', () => {
    const notes = chimeNotes('mastered');
    expect(notes).toHaveLength(4);
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]!.delay).toBeGreaterThan(notes[i - 1]!.delay);
      expect(notes[i]!.freq).toBeGreaterThan(notes[i - 1]!.freq);
    }
    const last = notes[3]!.freq / notes[0]!.freq;
    expect(last).toBeCloseTo(2, 6);
  });
});

describe('bell voicing', () => {
  it('has a prime partial at unity gain', () => {
    const prime = BELL_PARTIALS.find((p) => p.ratio === 1);
    expect(prime).toBeDefined();
    expect(prime!.gain).toBe(1);
  });

  it('keeps every gain in (0, 1] and every ring time positive', () => {
    for (const p of BELL_PARTIALS) {
      expect(p.gain).toBeGreaterThan(0);
      expect(p.gain).toBeLessThanOrEqual(1);
      expect(p.ring).toBeGreaterThan(0);
    }
  });

  it('beats slowly but audibly', () => {
    expect(BEAT_HZ).toBeGreaterThan(0);
    expect(BEAT_HZ).toBeLessThan(2);
  });
});
