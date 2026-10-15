import { describe, expect, it } from 'vitest';
import {
  frequencyAt,
  midiAt,
  noteAt,
  octaveAt,
  parsePositionKey,
  positionKey,
  positionsOfNote,
} from './notes';

describe('notes', () => {
  it('names open strings in standard tuning', () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => noteAt({ string: s, fret: 0 }))).toEqual([
      'E', 'A', 'D', 'G', 'B', 'E',
    ]);
  });

  it('names fretted notes with sharps', () => {
    expect(noteAt({ string: 0, fret: 1 })).toBe('F');
    expect(noteAt({ string: 0, fret: 2 })).toBe('F#');
    expect(noteAt({ string: 0, fret: 5 })).toBe('A');
    expect(noteAt({ string: 1, fret: 1 })).toBe('A#');
    expect(noteAt({ string: 1, fret: 3 })).toBe('C');
    expect(noteAt({ string: 0, fret: 12 })).toBe('E');
  });

  it('computes octaves and frequencies', () => {
    expect(octaveAt({ string: 0, fret: 0 })).toBe(2);
    expect(octaveAt({ string: 5, fret: 0 })).toBe(4);
    expect(frequencyAt({ string: 1, fret: 0 })).toBeCloseTo(110, 5);
    expect(frequencyAt({ string: 5, fret: 5 })).toBeCloseTo(440, 5);
    expect(frequencyAt({ string: 0, fret: 0 })).toBeCloseTo(82.407, 2);
  });

  it('rejects positions off the neck', () => {
    expect(() => midiAt({ string: 6, fret: 0 })).toThrow();
    expect(() => midiAt({ string: 0, fret: -1 })).toThrow();
  });

  it('round-trips position keys', () => {
    const p = { string: 3, fret: 11 };
    expect(parsePositionKey(positionKey(p))).toEqual(p);
    expect(() => parsePositionKey('nope')).toThrow();
  });

  it('finds every position of a note within a pool', () => {
    const pool = [];
    for (let s = 0; s < 2; s++) for (let f = 0; f <= 5; f++) pool.push({ string: s, fret: f });
    expect(positionsOfNote('A', pool)).toEqual([
      { string: 0, fret: 5 },
      { string: 1, fret: 0 },
    ]);
    expect(positionsOfNote('G#', pool)).toEqual([{ string: 0, fret: 4 }]);
  });
});
