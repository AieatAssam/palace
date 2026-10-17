import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING, frequencyOfMidi, midiAt, noteAt, positionKey } from './notes';
import {
  TUNES,
  fingering,
  letterOf,
  midiOfName,
  nameOfMidi,
  positionsOfMidi,
  positionsOfPitchClass,
  soundsNote,
  tuneById,
  tuneLines,
} from './melodies';
import { MELODY_STAGES, inRegion } from './stages';

/** The pitch names of a run of notes, for comparing against a hard-coded opening. */
const namesOf = (notes: { midi: number }[]) => notes.map((n) => nameOfMidi(n.midi));

describe('midiOfName and nameOfMidi', () => {
  it('knows the anchor pitches', () => {
    expect(midiOfName('C4')).toBe(60);
    expect(midiOfName('A4')).toBe(69);
    expect(midiOfName('E2')).toBe(40);
    expect(midiOfName('F#4')).toBe(66);
    expect(midiOfName('G#3')).toBe(56);
    expect(midiOfName('Bb3')).toBe(58);
  });

  it('reads flats and sharps of the same pitch as one MIDI number', () => {
    expect(midiOfName('Bb3')).toBe(midiOfName('A#3'));
    expect(midiOfName('Gb4')).toBe(midiOfName('F#4'));
  });

  it('names MIDI numbers with sharps and the scientific octave', () => {
    expect(nameOfMidi(60)).toBe('C4');
    expect(nameOfMidi(69)).toBe('A4');
    expect(nameOfMidi(40)).toBe('E2');
    expect(nameOfMidi(66)).toBe('F#4');
    expect(nameOfMidi(56)).toBe('G#3');
    expect(nameOfMidi(58)).toBe('A#3');
  });

  it('round-trips every MIDI number from 0 to 127', () => {
    for (let m = 0; m <= 127; m++) expect(midiOfName(nameOfMidi(m))).toBe(m);
  });

  it('round-trips every name the tunes use', () => {
    for (const name of ['C4', 'F#4', 'G#3', 'A3', 'E3', 'B3', 'D4', 'E4', 'G4', 'A4']) {
      expect(nameOfMidi(midiOfName(name))).toBe(name);
    }
  });

  it('rejects a malformed pitch name', () => {
    expect(() => midiOfName('H4')).toThrow();
    expect(() => midiOfName('C')).toThrow();
    expect(() => midiOfName('')).toThrow();
  });

  it('letterOf gives the pitch class name without an octave', () => {
    expect(letterOf(66)).toBe('F#');
    expect(letterOf(60)).toBe('C');
    expect(letterOf(40)).toBe('E');
  });
});

describe('standard tuning', () => {
  it('has open strings E2 A2 D3 G3 B3 E4, low to high', () => {
    expect(STANDARD_TUNING.map(nameOfMidi)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect([...STANDARD_TUNING]).toEqual([40, 45, 50, 55, 59, 64]);
  });

  it('sounds those open strings from fret 0', () => {
    for (let s = 0; s < STANDARD_TUNING.length; s++) {
      expect(midiAt({ string: s, fret: 0 })).toBe(STANDARD_TUNING[s]);
    }
  });

  it('has open-string frequencies of 82.41, 110.00, 146.83, 196.00, 246.94 and 329.63 Hz', () => {
    const hz = STANDARD_TUNING.map((m) => frequencyOfMidi(m));
    const expected = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
    expect(hz).toHaveLength(expected.length);
    hz.forEach((f, i) => expect(f).toBeCloseTo(expected[i]!, 2));
  });

  it('puts A4 at 440 Hz', () => {
    expect(frequencyOfMidi(midiOfName('A4'))).toBeCloseTo(440, 6);
  });
});

describe('tune notes', () => {
  const openings: Record<string, string[]> = {
    ode: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4'.split(' '),
    twinkle: 'C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4'.split(' '),
    frere: 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4 E4 F4 G4 G4 A4'.split(' '),
    greensleeves: 'A3 C4 D4 E4 F4 E4 D4 B3'.split(' '),
    scarborough: 'A3 A3 E4 E4 B3 C4 B3 A3'.split(' '),
    grace: 'A3 D4 F#4 D4 F#4 E4 D4 B3 A3'.split(' '),
  };

  it('has an opening written out for every tune', () => {
    expect(Object.keys(openings).sort()).toEqual(TUNES.map((t) => t.id).sort());
  });

  for (const [id, opening] of Object.entries(openings)) {
    it(`${id} opens with the right sounding pitches`, () => {
      const notes = tuneById(id).lines.flat();
      expect(namesOf(notes.slice(0, opening.length))).toEqual(opening);
    });
  }

  it('Ode to Joy opens E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4', () => {
    const notes = tuneById('ode').lines.flat();
    expect(namesOf(notes.slice(0, 15))).toEqual(['E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4', 'E4', 'D4', 'D4']);
  });

  it('gives every note a positive length in beats', () => {
    for (const t of TUNES) {
      for (const line of t.lines) for (const n of line) expect(n.beats).toBeGreaterThan(0);
    }
  });

  it('gives every tune at least one line, with a phrase of 1 to all of its lines', () => {
    for (const t of TUNES) {
      expect(t.lines.length).toBeGreaterThan(0);
      expect(t.phraseLines).toBeGreaterThanOrEqual(1);
      expect(t.phraseLines).toBeLessThanOrEqual(t.lines.length);
    }
  });

  it('gives every tune a positive tempo, title and source', () => {
    for (const t of TUNES) {
      expect(t.tempo).toBeGreaterThan(0);
      expect(t.title.trim()).not.toBe('');
      expect(t.source.trim()).not.toBe('');
    }
  });

  it('has unique tune ids and looks them up', () => {
    expect(new Set(TUNES.map((t) => t.id)).size).toBe(TUNES.length);
    for (const t of TUNES) expect(tuneById(t.id)).toBe(t);
    expect(() => tuneById('nope')).toThrow();
  });

  it('tuneLines gives the phrase lines, or every line for the whole tune', () => {
    for (const t of TUNES) {
      expect(tuneLines(t, 'phrase')).toEqual(t.lines.slice(0, t.phraseLines));
      expect(tuneLines(t, 'whole')).toEqual(t.lines);
    }
  });
});

describe('every tune on every melody stage', () => {
  for (const tune of TUNES) {
    for (const stage of MELODY_STAGES) {
      const part = stage.melody!.part;
      const notes = tuneLines(tune, part).flat();

      describe(`${tune.id} on ${stage.id}`, () => {
        it('plays every note at its written pitch inside the region', () => {
          for (const n of notes) {
            const ps = positionsOfMidi(n.midi, stage);
            expect(ps.length, `${nameOfMidi(n.midi)} in ${stage.id}`).toBeGreaterThan(0);
            for (const p of ps) {
              expect(midiAt(p)).toBe(n.midi);
              expect(inRegion(stage, p)).toBe(true);
            }
          }
        });

        it('finds pitch-class positions only inside the region, with the same letter', () => {
          for (const n of notes) {
            const ps = positionsOfPitchClass(n.midi, stage);
            expect(ps.length, `${letterOf(n.midi)} in ${stage.id}`).toBeGreaterThan(0);
            for (const p of ps) {
              expect(((midiAt(p) % 12) + 12) % 12).toBe(((n.midi % 12) + 12) % 12);
              expect(inRegion(stage, p)).toBe(true);
            }
          }
        });

        it('fingers one in-region position per note, each sounding its exact written MIDI', () => {
          const fp = fingering(notes, stage);
          expect(fp).toHaveLength(notes.length);
          fp.forEach((p, i) => {
            expect(inRegion(stage, p)).toBe(true);
            expect(midiAt(p)).toBe(notes[i]!.midi);
            expect(noteAt(p)).toBe(letterOf(notes[i]!.midi));
          });
        });
      });
    }
  }
});

describe('positionsOfMidi', () => {
  it('lists every place in the region sounding the pitch, lowest fret first', () => {
    // B3 (59) in frets 0-5 of all strings: the B string open, and the G string at fret 4.
    const ps = positionsOfMidi(59, { strings: [0, 1, 2, 3, 4, 5], maxFret: 5 });
    expect(ps.map(positionKey)).toEqual(['s4f0', 's3f4']);
  });

  it('returns nothing for a pitch below the region', () => {
    expect(positionsOfMidi(40, { strings: [3, 4, 5], maxFret: 5 })).toEqual([]);
  });

  it('ignores out-of-range string indices', () => {
    expect(positionsOfMidi(40, { strings: [-1, 6, 0], maxFret: 0 })).toEqual([{ string: 0, fret: 0 }]);
  });
});

describe('soundsNote', () => {
  it('is true for the same pitch class in any octave', () => {
    // Low E open (E2) is the note E in every octave.
    expect(soundsNote({ string: 0, fret: 0 }, 64)).toBe(true);
    expect(soundsNote({ string: 0, fret: 0 }, 40)).toBe(true);
    expect(soundsNote({ string: 0, fret: 0 }, 52)).toBe(true);
    // The high E string, fret 1 (F4) is F in every octave too.
    expect(soundsNote({ string: 5, fret: 1 }, 53)).toBe(true);
  });

  it('is false for a different pitch', () => {
    expect(soundsNote({ string: 0, fret: 0 }, 41)).toBe(false);
    expect(soundsNote({ string: 0, fret: 0 }, 65)).toBe(false);
    expect(soundsNote({ string: 2, fret: 5 }, 60)).toBe(false); // G3 is not C
  });
});
