import { describe, expect, it } from 'vitest';
import { DAY, newCard, type Card, type Deck } from '../game/srs';
import {
  CHOICES,
  LEDGER_STAGES,
  FIRST_LEDGER_STAGE,
  PEGS,
  SOUNDS,
  cardId,
  emptyRecord,
  figuresFor,
  itemsOf,
  key,
  ledgerMastered,
  ledgerProgress,
  ledgerStageById,
  longestHeld,
  makeChoices,
  makeNumber,
  nextQuestion,
  parseRecord,
  pair,
  pegsFor,
  recordAnswer,
  recordLine,
  wordFor,
  type LedgerRecord,
  type LedgerStage,
} from './logic';

/** A small seeded random source (mulberry32), so every line in a test is repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stageById = (id: string): LedgerStage => {
  const s = LEDGER_STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`no stage ${id}`);
  return s;
};

const SPAN = stageById('span');
const SOUNDS_STAGE = stageById('sounds');
const PEGS_LOW = stageById('pegs-low');
const PEGS_HIGH = stageById('pegs-high');
const LONG = stageById('long');

const NOW = 1_000_000;

describe('LEDGER_STAGES', () => {
  it('gives every stage a unique id', () => {
    const ids = LEDGER_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('finds every stage by id', () => {
    for (const s of LEDGER_STAGES) expect(ledgerStageById(s.id).id).toBe(s.id);
  });

  it('falls back to the first stage for an unknown id', () => {
    expect(ledgerStageById('no-such-stage').id).toBe(LEDGER_STAGES[0]!.id);
    expect(ledgerStageById('').id).toBe(FIRST_LEDGER_STAGE.id);
    expect(FIRST_LEDGER_STAGE.id).toBe(LEDGER_STAGES[0]!.id);
  });
});

describe('PEGS and SOUNDS', () => {
  it('has exactly one hundred peg words, all unique and non-empty', () => {
    expect(PEGS).toHaveLength(100);
    expect(new Set(PEGS).size).toBe(100);
    for (const w of PEGS) expect(w.length).toBeGreaterThan(0);
  });

  it('has ten sounds', () => {
    expect(SOUNDS).toHaveLength(10);
  });
});

describe('pair', () => {
  it('writes two figures, padding with a zero', () => {
    expect(pair(7)).toBe('07');
    expect(pair(42)).toBe('42');
    expect(pair(0)).toBe('00');
  });
});

describe('makeNumber', () => {
  it('returns the requested length', () => {
    for (const len of [0, 1, 4, 8, 30]) expect(makeNumber(len, mulberry32(len + 1))).toHaveLength(len);
  });

  it('gives only digits 0 to 9', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const d of makeNumber(20, mulberry32(seed))) {
        expect(Number.isInteger(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(9);
      }
    }
  });

  it('clamps a negative length to nothing', () => {
    expect(makeNumber(-3, mulberry32(5))).toEqual([]);
  });

  it('never exceeds nine even at the top of the random range', () => {
    expect(makeNumber(5, () => 0.9999999999)).toEqual([9, 9, 9, 9, 9]);
  });
});

describe('pegsFor', () => {
  it('reads the figures in pairs as peg words', () => {
    expect(pegsFor([3, 7, 1, 0, 5])).toEqual(['mug', 'toes', 'l']);
  });

  it('reads an odd trailing figure by the first sound for it', () => {
    expect(pegsFor([9])).toEqual([SOUNDS[9]!.split(',')[0]]);
  });

  it('gives no pegs for no figures', () => {
    expect(pegsFor([])).toEqual([]);
  });
});

describe('key', () => {
  const expected = [4, 2, 7];

  it('steps on a right figure that is not the last', () => {
    expect(key(expected, 0, 4)).toEqual({ kind: 'step', done: 1 });
    expect(key(expected, 1, 2)).toEqual({ kind: 'step', done: 2 });
  });

  it('ends the line on the last right figure', () => {
    expect(key(expected, 2, 7)).toEqual({ kind: 'line', done: 3 });
  });

  it('misses a wrong figure and reports the one due', () => {
    expect(key(expected, 1, 9)).toEqual({ kind: 'miss', done: 1, wanted: 2 });
  });

  it('misses with wanted -1 once nothing is left to key', () => {
    expect(key(expected, 3, 1)).toEqual({ kind: 'miss', done: 3, wanted: -1 });
  });
});

describe('itemsOf, wordFor, figuresFor, cardId', () => {
  it('lists the items of a stage', () => {
    expect(itemsOf(SOUNDS_STAGE)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(itemsOf(PEGS_HIGH)).toHaveLength(50);
    expect(itemsOf(PEGS_HIGH)[0]).toBe(50);
  });

  it('gives the word for an item', () => {
    expect(wordFor(SOUNDS_STAGE, 3)).toBe(SOUNDS[3]);
    expect(wordFor(PEGS_LOW, 7)).toBe(PEGS[7]);
  });

  it('gives one figure for a sound and two for a peg', () => {
    expect(figuresFor(SOUNDS_STAGE, 6)).toEqual([6]);
    expect(figuresFor(PEGS_LOW, 37)).toEqual([3, 7]);
    expect(figuresFor(PEGS_LOW, 7)).toEqual([0, 7]);
  });

  it('keys cards by sound or by peg', () => {
    expect(cardId(SOUNDS_STAGE, 4)).toBe('ledger:sound:4');
    expect(cardId(PEGS_LOW, 4)).toBe('ledger:peg:04');
  });
});

describe('makeChoices', () => {
  it('returns four unique items, including the item, within the stage range', () => {
    for (const stage of [SOUNDS_STAGE, PEGS_LOW, PEGS_HIGH]) {
      const range = itemsOf(stage);
      for (let seed = 1; seed <= 200; seed++) {
        for (const item of [range[0]!, range[Math.floor(range.length / 2)]!, range[range.length - 1]!]) {
          const choices = makeChoices(stage, item, mulberry32(seed));
          expect(choices).toHaveLength(CHOICES);
          expect(new Set(choices).size).toBe(CHOICES);
          expect(choices).toContain(item);
          for (const c of choices) {
            expect(c).toBeGreaterThanOrEqual(stage.from);
            expect(c).toBeLessThanOrEqual(stage.to);
          }
        }
      }
    }
  });
});

describe('nextQuestion', () => {
  it('alternates pick (asked even) and key (asked odd)', () => {
    const rng = mulberry32(11);
    for (let asked = 0; asked < 10; asked++) {
      const q = nextQuestion(PEGS_LOW, {}, asked, NOW, rng);
      expect(q.kind).toBe(asked % 2 === 0 ? 'pick' : 'key');
    }
  });

  it('gives four choices for a pick, including the item, and none for a key', () => {
    const rng = mulberry32(12);
    const pick = nextQuestion(SOUNDS_STAGE, {}, 0, NOW, rng);
    expect(pick.choices).toHaveLength(CHOICES);
    expect(pick.choices).toContain(pick.item);
    const key = nextQuestion(SOUNDS_STAGE, {}, 1, NOW, rng);
    expect(key.choices).toEqual([]);
  });

  it('keeps the item inside the stage range', () => {
    const rng = mulberry32(13);
    for (let asked = 0; asked < 40; asked++) {
      const q = nextQuestion(PEGS_HIGH, {}, asked, NOW, rng);
      expect(q.item).toBeGreaterThanOrEqual(50);
      expect(q.item).toBeLessThanOrEqual(99);
    }
  });

  it('does not repeat the item just asked when avoiding it', () => {
    const rng = mulberry32(14);
    for (let seed = 1; seed <= 30; seed++) {
      const q = nextQuestion(SOUNDS_STAGE, {}, 0, NOW, mulberry32(seed), 4);
      expect(q.item).not.toBe(4);
    }
    expect(nextQuestion(SOUNDS_STAGE, {}, 0, NOW, rng, 4).item).not.toBe(4);
  });
});

describe('recordAnswer and isKnown', () => {
  it('creates a card for an unseen id on the first answer', () => {
    const deck = recordAnswer({}, 'ledger:sound:3', true, 1000, NOW);
    expect(deck['ledger:sound:3']).toBeDefined();
    expect(deck['ledger:sound:3']!.seen).toBe(1);
    expect(deck['ledger:sound:3']!.correct).toBe(1);
  });

  it('does not mutate the deck it was given', () => {
    const before: Deck = {};
    recordAnswer(before, 'ledger:sound:3', true, 1000, NOW);
    expect(before).toEqual({});
  });

  it('is not known after one right answer, and known after enough right answers spaced over time', () => {
    const id = cardId(PEGS_LOW, 7);
    let deck = recordAnswer({}, id, true, 1000, NOW);
    const oneCard = deck[id]!;
    expect(ledgerProgress(PEGS_LOW, { ...emptyRecord(), deck }).have).toBe(0);
    expect(oneCard.reps).toBe(1);

    let now = NOW;
    for (let i = 0; i < 3; i++) {
      now = (deck[id]?.due ?? now) + DAY;
      deck = recordAnswer(deck, id, true, 1000, now);
    }
    const card: Card = deck[id]!;
    expect(card.reps).toBeGreaterThanOrEqual(2);
    expect(ledgerProgress(PEGS_LOW, { ...emptyRecord(), deck }).have).toBe(1);
  });
});

describe('ledgerProgress', () => {
  it('measures a span stage by its best clean length against mastery', () => {
    const rec: LedgerRecord = { best: { span: 4 }, rounds: {}, deck: {} };
    const p = ledgerProgress(SPAN, rec);
    expect(p.have).toBe(4);
    expect(p.need).toBe(SPAN.mastery);
    expect(p.toward).toBeCloseTo(4 / SPAN.mastery);
    expect(p.mastered).toBe(false);
  });

  it('marks a span stage mastered at its mastery length and caps toward at one', () => {
    const at = ledgerProgress(SPAN, { best: { span: SPAN.mastery }, rounds: {}, deck: {} });
    expect(at.mastered).toBe(true);
    expect(at.toward).toBe(1);
    const over = ledgerProgress(SPAN, { best: { span: SPAN.mastery + 5 }, rounds: {}, deck: {} });
    expect(over.toward).toBe(1);
    expect(over.mastered).toBe(true);
  });

  it('starts a span stage at nothing', () => {
    const p = ledgerProgress(SPAN, emptyRecord());
    expect(p.have).toBe(0);
    expect(p.toward).toBe(0);
    expect(p.mastered).toBe(false);
  });

  it('counts known items for a drill stage', () => {
    let deck: Deck = {};
    deck = recordAnswer(deck, cardId(SOUNDS_STAGE, 0), true, 1000, NOW);
    const p = ledgerProgress(SOUNDS_STAGE, { ...emptyRecord(), deck });
    expect(p.need).toBe(10);
    expect(p.have).toBe(0);
    expect(p.toward).toBe(0);
    expect(p.mastered).toBe(false);
  });

  it('marks a drill stage mastered only when every item is known', () => {
    let deck: Deck = {};
    let now = NOW;
    for (const n of itemsOf(SOUNDS_STAGE)) {
      for (let i = 0; i < 4; i++) {
        deck = recordAnswer(deck, cardId(SOUNDS_STAGE, n), true, 1000, now);
        now += 2 * DAY;
      }
    }
    const p = ledgerProgress(SOUNDS_STAGE, { ...emptyRecord(), deck });
    expect(p.have).toBe(10);
    expect(p.toward).toBe(1);
    expect(p.mastered).toBe(true);
  });
});

describe('recordLine', () => {
  it('records a clean longer number as a new best and rounds up', () => {
    const r = recordLine(emptyRecord(), SPAN, 5, true);
    expect(r.record.best[SPAN.id]).toBe(5);
    expect(r.record.rounds[SPAN.id]).toBe(1);
    expect(r.newBest).toBe(true);
    expect(r.crossed).toBe(false);
  });

  it('does not lower a best on a slip, but still counts the round', () => {
    const start: LedgerRecord = { best: { [SPAN.id]: 6 }, rounds: { [SPAN.id]: 2 }, deck: {} };
    const r = recordLine(start, SPAN, 9, false);
    expect(r.record.best[SPAN.id]).toBe(6);
    expect(r.record.rounds[SPAN.id]).toBe(3);
    expect(r.newBest).toBe(false);
    expect(r.crossed).toBe(false);
  });

  it('does not count a clean line that is not longer than the best as a new best', () => {
    const start: LedgerRecord = { best: { [SPAN.id]: 6 }, rounds: {}, deck: {} };
    const r = recordLine(start, SPAN, 6, true);
    expect(r.newBest).toBe(false);
    expect(r.crossed).toBe(false);
  });

  it('reports crossed exactly once, when the best first reaches mastery', () => {
    const below: LedgerRecord = { best: { [SPAN.id]: SPAN.mastery - 1 }, rounds: {}, deck: {} };
    const up = recordLine(below, SPAN, SPAN.mastery, true);
    expect(up.crossed).toBe(true);
    expect(up.newBest).toBe(true);
    const again = recordLine(up.record, SPAN, SPAN.mastery + 1, true);
    expect(again.crossed).toBe(false);
    expect(again.newBest).toBe(true);
  });
});

describe('ledgerMastered and longestHeld', () => {
  it('counts the stages over their bar', () => {
    expect(ledgerMastered(emptyRecord())).toBe(0);
    const rec: LedgerRecord = { best: { span: SPAN.mastery, long: LONG.mastery }, rounds: {}, deck: {} };
    expect(ledgerMastered(rec)).toBe(2);
  });

  it('reports the longest clean number held in any span stage', () => {
    expect(longestHeld(emptyRecord())).toBe(0);
    expect(longestHeld({ best: { span: 5, long: 12, sounds: 99 }, rounds: {}, deck: {} })).toBe(12);
  });
});

describe('parseRecord', () => {
  it('returns an empty record for non-objects', () => {
    for (const raw of [null, undefined, 3, 'x', true]) {
      expect(parseRecord(raw)).toEqual(emptyRecord());
    }
  });

  it('drops unknown stage ids and negative, non-finite or non-numeric values', () => {
    const rec = parseRecord({
      best: { 'no-such': 5, span: -2, long: Number.NaN, 'long-bare': 'nine', 'pegs-low': 4 },
      rounds: { span: -1, 'no-such': 2, long: 3 },
    });
    expect(rec.best).toEqual({});
    expect(rec.rounds).toEqual({ long: 3 });
  });

  it('drops a best recorded on a non-span stage such as sounds', () => {
    const rec = parseRecord({ best: { sounds: 7, pegs: 3, span: 6 } });
    expect(rec.best).toEqual({ span: 6 });
  });

  it('floors fractional values', () => {
    expect(parseRecord({ best: { span: 6.9 } }).best).toEqual({ span: 6 });
  });

  it('keeps only deck cards whose ids start with ledger: and match the card', () => {
    const good = newCard('ledger:peg:07', NOW);
    const junk = newCard('faces:anna', NOW);
    const mismatched = { ...newCard('ledger:peg:08', NOW), id: 'ledger:peg:09' };
    const rec = parseRecord({ deck: { 'ledger:peg:07': good, 'faces:anna': junk, 'ledger:peg:08': mismatched, 'ledger:sound:1': 'nope' } });
    expect(Object.keys(rec.deck)).toEqual(['ledger:peg:07']);
  });

  it('round-trips a valid record through JSON', () => {
    const rec: LedgerRecord = {
      best: { span: 9, long: 18 },
      rounds: { span: 4, long: 2 },
      deck: { 'ledger:sound:2': { ...newCard('ledger:sound:2', NOW), seen: 3, correct: 2, reps: 2, due: NOW + DAY } },
    };
    expect(parseRecord(JSON.parse(JSON.stringify(rec)))).toEqual(rec);
  });
});
