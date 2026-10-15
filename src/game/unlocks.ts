import { NOTE_NAMES, type NoteName, type Position, noteAt, positionKey } from './notes';
import { type Deck, mastery } from './srs';

/**
 * Data-driven unlock table. Each stage defines the playable region of the neck.
 * A stage opens once the region of the *previous* stage is solid:
 * enough of its items have been seen and their mean mastery clears the bar.
 */
export interface UnlockStage {
  id: string;
  title: string;
  /** String indices (0 = low E … 5 = high e). */
  strings: readonly number[];
  minFret: number;
  maxFret: number;
  /** Required to move *past* this stage. */
  requires: { meanMastery: number; seenFraction: number };
}

export const UNLOCK_STAGES: readonly UnlockStage[] = [
  {
    id: 'low-0-5',
    title: 'Low E & A · frets 0–5',
    strings: [0, 1],
    minFret: 0,
    maxFret: 5,
    requires: { meanMastery: 0.6, seenFraction: 1 },
  },
  {
    id: 'mid-0-5',
    title: 'Add D & G · frets 0–5',
    strings: [0, 1, 2, 3],
    minFret: 0,
    maxFret: 5,
    requires: { meanMastery: 0.6, seenFraction: 1 },
  },
  {
    id: 'all-0-5',
    title: 'All six strings · frets 0–5',
    strings: [0, 1, 2, 3, 4, 5],
    minFret: 0,
    maxFret: 5,
    requires: { meanMastery: 0.6, seenFraction: 0.9 },
  },
  {
    id: 'all-0-7',
    title: 'Frets 0–7',
    strings: [0, 1, 2, 3, 4, 5],
    minFret: 0,
    maxFret: 7,
    requires: { meanMastery: 0.6, seenFraction: 0.9 },
  },
  {
    id: 'all-0-9',
    title: 'Frets 0–9',
    strings: [0, 1, 2, 3, 4, 5],
    minFret: 0,
    maxFret: 9,
    requires: { meanMastery: 0.6, seenFraction: 0.9 },
  },
  {
    id: 'all-0-12',
    title: 'Full neck · frets 0–12',
    strings: [0, 1, 2, 3, 4, 5],
    minFret: 0,
    maxFret: 12,
    requires: { meanMastery: 1.01, seenFraction: 1 }, // final stage
  },
];

export function stagePositions(stage: UnlockStage): Position[] {
  const out: Position[] = [];
  // Curriculum order: lower strings first, nut outward — open strings come first.
  for (let f = stage.minFret; f <= stage.maxFret; f++) {
    for (const s of stage.strings) out.push({ string: s, fret: f });
  }
  return out.sort((a, b) => a.fret - b.fret || a.string - b.string);
}

export const nameItemId = (p: Position) => `name:${positionKey(p)}`;
export const findItemId = (n: NoteName) => `find:${n}`;

export function notesInPositions(positions: readonly Position[]): NoteName[] {
  const set = new Set(positions.map(noteAt));
  return NOTE_NAMES.filter((n) => set.has(n));
}

export function stageNameItems(stage: UnlockStage): string[] {
  return stagePositions(stage).map(nameItemId);
}

export function stageFindItems(stage: UnlockStage): string[] {
  return notesInPositions(stagePositions(stage)).map(findItemId);
}

/** Progress toward clearing a stage, measured on its Name-it items. */
export function stageProgress(stage: UnlockStage, deck: Deck) {
  const ids = stageNameItems(stage);
  let seen = 0;
  let sum = 0;
  for (const id of ids) {
    const c = deck[id];
    if (c && c.seen > 0) seen++;
    sum += mastery(c);
  }
  const meanMastery = ids.length ? sum / ids.length : 0;
  const seenFraction = ids.length ? seen / ids.length : 0;
  const cleared =
    meanMastery >= stage.requires.meanMastery && seenFraction >= stage.requires.seenFraction;
  // 0..1 progress toward the unlock bar (for a quiet progress hairline in the UI).
  const toward = Math.min(
    1,
    0.5 * Math.min(1, seenFraction / stage.requires.seenFraction) +
      0.5 * Math.min(1, meanMastery / stage.requires.meanMastery),
  );
  return { meanMastery, seenFraction, cleared, toward };
}

/**
 * Highest unlocked stage index given the deck. Stages unlock sequentially and
 * never re-lock: `floor` is the previously reached stage.
 */
export function unlockedStageIndex(deck: Deck, floor = 0): number {
  let idx = Math.max(0, Math.min(floor, UNLOCK_STAGES.length - 1));
  while (idx < UNLOCK_STAGES.length - 1 && stageProgress(UNLOCK_STAGES[idx]!, deck).cleared) {
    idx++;
  }
  return idx;
}

export function stageAt(index: number): UnlockStage {
  return UNLOCK_STAGES[Math.max(0, Math.min(index, UNLOCK_STAGES.length - 1))]!;
}

export function isUnlocked(stage: UnlockStage, p: Position): boolean {
  return stage.strings.includes(p.string) && p.fret >= stage.minFret && p.fret <= stage.maxFret;
}
