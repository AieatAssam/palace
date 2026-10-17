import { NOTE_NAMES, type NoteName, type Position, STRING_COUNT, midiAt, noteNameOfMidi } from './notes';

/**
 * Public-domain tunes for the Melody drill, written as sounding pitches (scientific
 * pitch notation, C4 = MIDI 60) with lengths in beats. `|` ends a line of the tune
 * (the card shows one line at a time). Keys are chosen so every tune sits on the
 * treble strings in first position; any octave of the right note counts in play.
 */
export interface MelodyNote {
  midi: number;
  /** Length in beats (1 = a crotchet at the tune's tempo). */
  beats: number;
}

export interface Tune {
  id: string;
  title: string;
  /** Who wrote it down, for the card's foot. */
  source: string;
  /** Beats per minute for playback. */
  tempo: number;
  /** Lines of the tune, in order. */
  lines: MelodyNote[][];
  /** The opening phrase: how many lines the Phrases stage asks for. */
  phraseLines: number;
}

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "F#4" → 66, "Bb3" → 58. */
export function midiOfName(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad pitch: ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + LETTER_PC[m[1]!]! + acc;
}

/** 66 → "F#4". */
export function nameOfMidi(midi: number): string {
  return `${noteNameOfMidi(midi)}${Math.floor(midi / 12) - 1}`;
}

/** "E4 E4 F4 G4*2 | ..." → lines of notes. `*n` gives a length in beats (default 1). */
export function parseTune(src: string): MelodyNote[][] {
  return src
    .split('|')
    .map((line) =>
      line
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((tok) => {
          const [pitch, beats] = tok.split('*');
          return { midi: midiOfName(pitch!), beats: beats ? Number(beats) : 1 };
        }),
    )
    .filter((l) => l.length > 0);
}

function tune(id: string, title: string, source: string, tempo: number, phraseLines: number, src: string): Tune {
  return { id, title, source, tempo, phraseLines, lines: parseTune(src) };
}

export const TUNES: readonly Tune[] = [
  tune(
    'ode',
    'Ode to Joy',
    'Beethoven, 1824',
    100,
    2,
    `E4 E4 F4 G4 G4 F4 E4 D4 | C4 C4 D4 E4 E4*1.5 D4*0.5 D4*2 |
     E4 E4 F4 G4 G4 F4 E4 D4 | C4 C4 D4 E4 D4*1.5 C4*0.5 C4*2`,
  ),
  tune(
    'twinkle',
    'Twinkle, Twinkle',
    'French air, 1761',
    100,
    1,
    `C4 C4 G4 G4 A4 A4 G4*2 | F4 F4 E4 E4 D4 D4 C4*2`,
  ),
  tune(
    'frere',
    'Frère Jacques',
    'French round',
    110,
    1,
    `C4 D4 E4 C4 C4 D4 E4 C4 | E4 F4 G4*2 E4 F4 G4*2 |
     G4*0.5 A4*0.5 G4*0.5 F4*0.5 E4 C4 G4*0.5 A4*0.5 G4*0.5 F4*0.5 E4 C4 | C4 G3 C4*2 C4 G3 C4*2`,
  ),
  tune(
    'greensleeves',
    'Greensleeves',
    'English ballad, 1580',
    120,
    1,
    `A3 C4*2 D4 E4*1.5 F4*0.5 E4 D4*2 B3 | G3*1.5 A3*0.5 B3 C4*2 A3 A3*1.5 G#3*0.5 A3 B3*2 G#3 E3*2 |
     A3 C4*2 D4 E4*1.5 F4*0.5 E4 D4*2 B3 | G3*1.5 A3*0.5 B3 C4*1.5 B3*0.5 A3 G#3*1.5 F#3*0.5 G#3 A3*3`,
  ),
  tune(
    'scarborough',
    'Scarborough Fair',
    'English ballad',
    96,
    1,
    `A3*2 A3 E4*2 E4 B3*1.5 C4*0.5 B3 A3*3 | E4 G4*2 A4 G4*2 E4 F#4 D4 E4*3`,
  ),
  tune(
    'grace',
    'Amazing Grace',
    'American tune, 1829',
    84,
    1,
    `A3 D4*2 F#4*0.5 D4*0.5 F#4*2 E4 D4*2 B3 A3*2 | A3 D4*2 F#4*0.5 D4*0.5 F#4*2 E4 A4*3 |
     F#4 A4*1.5 F#4*0.5 A4*0.5 F#4*0.5 D4*2 A3 B3*1.5 D4*0.5 D4*0.5 B3*0.5 A3*2 | A3 D4*2 F#4*0.5 D4*0.5 F#4*2 E4 D4*3`,
  ),
];

export function tuneById(id: string): Tune {
  const t = TUNES.find((x) => x.id === id);
  if (!t) throw new Error(`No tune ${id}`);
  return t;
}

/** The lines a stage asks for: the opening phrase, or the whole tune. */
export function tuneLines(t: Tune, part: 'phrase' | 'whole'): MelodyNote[][] {
  return part === 'phrase' ? t.lines.slice(0, t.phraseLines) : t.lines;
}

/** A stage's region, as the melody logic needs it. */
export interface Region {
  strings: readonly number[];
  maxFret: number;
}

/** Every position in the region sounding exactly `midi`, lowest fret first. */
export function positionsOfMidi(midi: number, region: Region): Position[] {
  const out: Position[] = [];
  for (const s of region.strings) {
    if (s < 0 || s >= STRING_COUNT) continue;
    const f = midi - midiAt({ string: s, fret: 0 });
    if (f >= 0 && f <= region.maxFret) out.push({ string: s, fret: f });
  }
  return out.sort((a, b) => a.fret - b.fret || b.string - a.string);
}

/** Every position in the region whose note is the same letter and accidental as `midi`, at any octave. */
export function positionsOfPitchClass(midi: number, region: Region): Position[] {
  const pc = ((midi % 12) + 12) % 12;
  const out: Position[] = [];
  for (let f = 0; f <= region.maxFret; f++)
    for (const s of region.strings) if (((midiAt({ string: s, fret: f }) % 12) + 12) % 12 === pc) out.push({ string: s, fret: f });
  return out;
}

/** True when `p` plays the note asked for (the same pitch class, any octave). */
export function soundsNote(p: Position, midi: number): boolean {
  return (midiAt(p) - midi) % 12 === 0;
}

/**
 * One way to play a run of notes inside the region, at their written pitch: each note on the
 * place nearest the last one (fewest frets moved, then fewest strings crossed). Notes the
 * region cannot reach at pitch fall back to the nearest octave that it can.
 */
export function fingering(notes: readonly MelodyNote[], region: Region): Position[] {
  const out: Position[] = [];
  let prev: Position | null = null;
  for (const n of notes) {
    let cands = positionsOfMidi(n.midi, region);
    if (!cands.length) cands = positionsOfPitchClass(n.midi, region);
    if (!cands.length) throw new Error(`No place for ${nameOfMidi(n.midi)} in region`);
    const from = prev;
    const best: Position = from
      ? cands.reduce((a, b) => {
          const cost = (p: Position) => Math.abs(p.fret - from.fret) * 2 + Math.abs(p.string - from.string);
          return cost(b) < cost(a) ? b : a;
        })
      : cands[0]!;
    out.push(best);
    prev = best;
  }
  return out;
}

/** The note's name for the card, e.g. "F#". */
export function letterOf(midi: number): NoteName {
  return NOTE_NAMES[((midi % 12) + 12) % 12]!;
}
