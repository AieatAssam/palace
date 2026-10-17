import { NOTE_NAMES, type NoteName, type Position, noteAt, parsePositionKey, positionsOfNote } from './notes';
import { type Deck, type Rng, pickNext } from './srs';
import { type Stage, regionPositions, octaveTargets, stageItems } from './stages';

export type DrillKind = 'name' | 'find' | 'octave';

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

export type Question = NameQuestion | FindQuestion | OctaveQuestion;

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
  }
}

/** Positions a question accepts as answers on the neck (Name-it: the lit one). */
export function questionTargets(q: Question): Position[] {
  return q.kind === 'name' ? [q.position] : q.targets;
}
