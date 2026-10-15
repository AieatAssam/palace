import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING, STRING_LABELS, noteAt } from '../game/notes';
import { STRING_NAMES, positionLabel } from './format';

describe('position labels', () => {
  it('names strings in the data model order (0 = low E … 5 = high E)', () => {
    expect(STRING_NAMES).toHaveLength(STANDARD_TUNING.length);
    STRING_NAMES.forEach((name, s) => {
      // The label's letter is the open string's actual pitch.
      expect(name.slice(-1).toUpperCase()).toBe(noteAt({ string: s, fret: 0 }));
      expect(name.slice(-1).toUpperCase()).toBe(STRING_LABELS[s]!.toUpperCase());
    });
    expect(STRING_NAMES[0]).toBe('low E');
    expect(STRING_NAMES[5]).toBe('high E');
  });

  it('describes open and fretted positions', () => {
    expect(positionLabel({ string: 1, fret: 0 })).toBe('open A string');
    expect(positionLabel({ string: 0, fret: 0 })).toBe('open low E string');
    expect(positionLabel({ string: 2, fret: 3 })).toBe('D string, 3rd fret');
    expect(positionLabel({ string: 5, fret: 12 })).toBe('high E string, 12th fret');
  });

  it('rejects strings that do not exist', () => {
    expect(() => positionLabel({ string: 6, fret: 0 })).toThrow(RangeError);
  });
});
