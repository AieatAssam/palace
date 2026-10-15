import { describe, expect, it } from 'vitest';
import { makeQuestion } from './drills';
import { type Deck, newCard, review } from './srs';
import {
  UNLOCK_STAGES,
  isUnlocked,
  stageAt,
  stageFindItems,
  stageNameItems,
  stagePositions,
  stageProgress,
  unlockedStageIndex,
} from './unlocks';

const T0 = 1_700_000_000_000;

function masterStage(index: number, deck: Deck = {}): Deck {
  const out = { ...deck };
  for (const id of stageNameItems(UNLOCK_STAGES[index]!)) {
    let c = out[id] ?? newCard(id, T0);
    for (let i = 0; i < 3; i++) c = review(c, 5, c.due, 1000);
    out[id] = c;
  }
  return out;
}

describe('unlock table', () => {
  it('starts with frets 0–5 on low E and A', () => {
    const s = UNLOCK_STAGES[0]!;
    expect(s.strings).toEqual([0, 1]);
    expect([s.minFret, s.maxFret]).toEqual([0, 5]);
    expect(stagePositions(s)).toHaveLength(12);
  });

  it('every stage is a superset of the previous one', () => {
    for (let i = 1; i < UNLOCK_STAGES.length; i++) {
      const prev = stagePositions(UNLOCK_STAGES[i - 1]!);
      const cur = UNLOCK_STAGES[i]!;
      for (const p of prev) expect(isUnlocked(cur, p)).toBe(true);
      expect(stagePositions(cur).length).toBeGreaterThan(prev.length);
    }
  });

  it('ends on the full 0–12 neck', () => {
    const last = UNLOCK_STAGES[UNLOCK_STAGES.length - 1]!;
    expect(stagePositions(last)).toHaveLength(6 * 13);
  });

  it('orders positions nut-outward', () => {
    const ps = stagePositions(UNLOCK_STAGES[0]!);
    expect(ps.slice(0, 2)).toEqual([
      { string: 0, fret: 0 },
      { string: 1, fret: 0 },
    ]);
  });

  it('lists find-all notes present in the region (no D# on E/A frets 0–5)', () => {
    expect(stageFindItems(UNLOCK_STAGES[0]!)).toEqual(
      ['C', 'C#', 'D', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((n) => `find:${n}`),
    );
  });

  it('stageAt clamps', () => {
    expect(stageAt(-3)).toBe(UNLOCK_STAGES[0]);
    expect(stageAt(999)).toBe(UNLOCK_STAGES[UNLOCK_STAGES.length - 1]);
  });
});

describe('unlocking', () => {
  it('stays on stage 0 with an empty deck', () => {
    expect(unlockedStageIndex({})).toBe(0);
    expect(stageProgress(UNLOCK_STAGES[0]!, {}).toward).toBe(0);
  });

  it('does not unlock when only some positions are practised', () => {
    const deck = masterStage(0);
    const firstId = stageNameItems(UNLOCK_STAGES[0]!)[0]!;
    delete deck[firstId];
    expect(unlockedStageIndex(deck)).toBe(0);
  });

  it('unlocks the next stage once the current region is solid', () => {
    const deck = masterStage(0);
    expect(stageProgress(UNLOCK_STAGES[0]!, deck).cleared).toBe(true);
    expect(unlockedStageIndex(deck)).toBe(1);
  });

  it('cascades through stages as mastery grows', () => {
    let deck: Deck = {};
    for (let i = 0; i < 3; i++) deck = masterStage(i, deck);
    expect(unlockedStageIndex(deck)).toBe(3);
  });

  it('never re-locks below the floor', () => {
    expect(unlockedStageIndex({}, 2)).toBe(2);
  });

  it('never exceeds the final stage', () => {
    let deck: Deck = {};
    for (let i = 0; i < UNLOCK_STAGES.length; i++) deck = masterStage(i, deck);
    expect(unlockedStageIndex(deck)).toBe(UNLOCK_STAGES.length - 1);
  });
});

describe('makeQuestion', () => {
  it('builds a Name-it question inside the unlocked region', () => {
    const q = makeQuestion('name', UNLOCK_STAGES[0]!, {}, T0, () => 0);
    expect(q.kind).toBe('name');
    if (q.kind !== 'name') return;
    expect(q.position).toEqual({ string: 0, fret: 0 });
    expect(q.answer).toBe('E');
    expect(q.choices).toHaveLength(12);
  });

  it('builds a Find-all question whose targets are every matching position', () => {
    const q = makeQuestion('find', UNLOCK_STAGES[0]!, {}, T0, () => 0);
    expect(q.kind).toBe('find');
    if (q.kind !== 'find') return;
    expect(q.note).toBe('C');
    expect(q.targets).toEqual([{ string: 1, fret: 3 }]);
    const a = makeQuestion('find', UNLOCK_STAGES[0]!, { 'find:C': newCard('find:C', T0) }, T0, () => 0, 'find:C');
    if (a.kind === 'find') expect(a.note).not.toBe('C');
  });
});
