import { NOTE_NAMES, type NoteName, type Position, noteAt, parsePositionKey, positionsOfNote } from './notes';
import { type Deck, type Rng, pickNext } from './srs';
import { type UnlockStage, findItemId, nameItemId, notesInPositions, stagePositions } from './unlocks';

export type DrillKind = 'name' | 'find';

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
  /** Every unlocked position sounding `note`. */
  targets: Position[];
}

export type Question = NameQuestion | FindQuestion;

export function makeQuestion(
  kind: DrillKind,
  stage: UnlockStage,
  deck: Deck,
  now: number,
  rng: Rng = Math.random,
  avoid?: string,
): Question {
  const positions = stagePositions(stage);
  if (kind === 'name') {
    const ids = positions.map(nameItemId);
    const id = pickNext(deck, ids, now, rng, avoid)!;
    const position = parsePositionKey(id.slice('name:'.length));
    return { kind, itemId: id, position, answer: noteAt(position), choices: NOTE_NAMES };
  }
  const notes = notesInPositions(positions);
  const ids = notes.map(findItemId);
  const id = pickNext(deck, ids, now, rng, avoid)!;
  const note = id.slice('find:'.length) as NoteName;
  return { kind, itemId: id, note, targets: positionsOfNote(note, positions) };
}
