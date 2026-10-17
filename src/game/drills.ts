import { NOTE_NAMES, type NoteName, type Position, noteAt, parsePositionKey, positionsOfNote } from './notes';
import { type MelodyNote, tuneById, tuneLines } from './melodies';
import { type Deck, type Rng, pickNext } from './srs';
import { type Stage, regionPositions, octaveTargets, stageItems } from './stages';

export type DrillKind = 'name' | 'find' | 'octave' | 'melody';

export interface NameQuestion {
  kind: 'name';
  itemId: string;
  position: Position;
  answer: NoteName;
  choices: readonly NoteName[];
}

export interface FindQuestion {
  kind: 'find';
  itemId: string;
  note: NoteName;
  /** Accidentals are asked as sharps or as flats; the pitch is the same. */
  spelling: 'sharp' | 'flat';
  /** Every position in the stage's region sounding `note`. */
  targets: Position[];
}

export interface OctaveQuestion {
  kind: 'octave';
  itemId: string;
  /** The lit position whose octave is wanted. */
  position: Position;
  /** Its octave shapes: one or two positions, two strings over. */
  targets: Position[];
}

export interface MelodyQuestion {
  kind: 'melody';
  itemId: string;
  tuneId: string;
  title: string;
  source: string;
  /** Lines of the tune the stage asks for (the opening phrase, or all of it). */
  lines: MelodyNote[][];
  /** The same notes in one run. */
  notes: MelodyNote[];
  /** Beats per minute for playback (the tune's tempo at the stage's pace). */
  tempo: number;
  /** Hidden from the card after one preview. */
  recall: boolean;
  /** No place is asked for: any place sounding the note counts (kept for the neck's shared code). */
  targets: Position[];
}

export type Question = NameQuestion | FindQuestion | OctaveQuestion | MelodyQuestion;

export function makeQuestion(stage: Stage, deck: Deck, now: number, rng: Rng = Math.random, avoid?: string): Question {
  const ids = stageItems(stage);
  const id = pickNext(deck, ids, now, rng, avoid)!;
  switch (stage.drill) {
    case 'name': {
      const position = parsePositionKey(id.slice('name:'.length));
      return { kind: 'name', itemId: id, position, answer: noteAt(position), choices: NOTE_NAMES };
    }
    case 'find': {
      const note = id.slice('find:'.length) as NoteName;
      const spelling = note.includes('#') && rng() < 0.5 ? 'flat' : 'sharp';
      return { kind: 'find', itemId: id, note, spelling, targets: positionsOfNote(note, regionPositions(stage)) };
    }
    case 'octave': {
      const position = parsePositionKey(id.slice('oct:'.length));
      return { kind: 'octave', itemId: id, position, targets: octaveTargets(position, stage.maxFret) };
    }
    case 'melody': {
      const rule = stage.melody!;
      const tune = tuneById(id.split(':')[2]!);
      const lines = tuneLines(tune, rule.part);
      return {
        kind: 'melody',
        itemId: id,
        tuneId: tune.id,
        title: tune.title,
        source: tune.source,
        lines,
        notes: lines.flat(),
        tempo: Math.round(tune.tempo * rule.pace),
        recall: rule.recall,
        targets: [],
      };
    }
  }
}

/** Positions a question accepts as answers on the neck (Name-it: the lit one; a melody: none fixed). */
export function questionTargets(q: Question): Position[] {
  return q.kind === 'name' ? [q.position] : q.targets;
}
