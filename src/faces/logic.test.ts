import { describe, expect, it } from 'vitest';
import { seeded } from '../blocks/layout';
import { DAY, RELEARN_STEP, newCard, review, type Card, type Deck } from '../game/srs';
import {
  CHOICES,
  FACES_STAGES,
  FIRST_FACES_STAGE,
  answerIndex,
  cardId,
  castOf,
  facesMastered,
  facesProgress,
  facesStageById,
  isKnown,
  makeQuestion,
  nextQuestion,
  parseDeck,
  recordAnswer,
  type FacesStage,
} from './logic';
import { castSeed, makeCast } from './sitters';

const stageById = (id: string): FacesStage => {
  const s = FACES_STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`no stage ${id}`);
  return s;
};

const FOUR = stageById('four');
const EIGHT = stageById('eight');
const TRADES = stageById('trades');

const NOW = 1_000_000;

/** A card seen once and correct, due well in the future. */
const seenNotDue = (id: string, now: number): Card => ({ ...review(newCard(id, now), 5, now, 1000), due: now + DAY });

/** Answer every face in `stage` correctly, twice, quickly. */
function masterStage(stage: FacesStage, deck: Deck, now: number): Deck {
  let d = deck;
  for (const s of castOf(stage)) {
    for (let i = 0; i < 2; i++) d = recordAnswer(d, cardId(stage.id, s.id), true, 1000, now);
  }
  return d;
}

describe('FACES_STAGES', () => {
  it('has exactly the four stage ids, in order', () => {
    expect(FACES_STAGES.map((s) => s.id)).toEqual(['four', 'eight', 'trades', 'delayed']);
  });

  it('falls back to the first stage for an unknown id', () => {
    expect(facesStageById('no-such-stage').id).toBe('four');
    expect(facesStageById('').id).toBe(FIRST_FACES_STAGE.id);
    expect(FIRST_FACES_STAGE.id).toBe('four');
  });

  it('finds each stage by id', () => {
    for (const s of FACES_STAGES) expect(facesStageById(s.id).id).toBe(s.id);
  });
});

describe('castOf', () => {
  it('has stage.size sitters for every stage', () => {
    for (const s of FACES_STAGES) expect(castOf(s)).toHaveLength(s.size);
  });

  it('returns the same array on repeated calls', () => {
    expect(castOf(FOUR)).toBe(castOf(FOUR));
  });

  it('matches makeCast(castSeed("four"), 4) by ids', () => {
    expect(castOf(FOUR).map((s) => s.id)).toEqual(makeCast(castSeed('four'), 4).map((s) => s.id));
  });
});

describe('makeQuestion', () => {
  it('offers CHOICES unique indices within the cast, including the sitter', () => {
    for (let sitter = 0; sitter < 4; sitter++) {
      const q = makeQuestion('name', sitter, 4, seeded(sitter + 1));
      expect(q.choices).toHaveLength(CHOICES);
      expect(new Set(q.choices).size).toBe(CHOICES);
      for (const c of q.choices) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(4);
      }
      expect(q.choices).toContain(sitter);
    }
  });

  it('points answerIndex at the sitter', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const q = makeQuestion('face', seed % 8, 8, seeded(seed));
      expect(q.choices[answerIndex(q)]).toBe(q.sitter);
    }
  });

  it('is deterministic with a seeded rng', () => {
    const a = makeQuestion('name', 2, 8, seeded(99));
    const b = makeQuestion('name', 2, 8, seeded(99));
    expect(a).toEqual(b);
  });

  it('keeps the kind it was given', () => {
    expect(makeQuestion('trade', 0, 4, seeded(5)).kind).toBe('trade');
  });
});

describe('nextQuestion', () => {
  it('rotates kinds through stage.kinds by the asked count', () => {
    const deck: Deck = {};
    for (let asked = 0; asked < 9; asked++) {
      const q = nextQuestion(TRADES, deck, asked, NOW, seeded(asked + 1));
      expect(q.kind).toBe(TRADES.kinds[asked % TRADES.kinds.length]!);
    }
  });

  it('never returns the avoided sitter (empty deck)', () => {
    for (let avoid = 0; avoid < 4; avoid++) {
      for (let i = 0; i < 50; i++) {
        const q = nextQuestion(FOUR, {}, i, NOW, seeded(i * 31 + avoid), avoid);
        expect(q.sitter).not.toBe(avoid);
      }
    }
  });

  it('never returns the avoided sitter, even when it is overdue', () => {
    const cast = castOf(FOUR);
    const avoid = 1;
    const deck: Deck = {};
    // The avoided face is missed and due now, so it would otherwise top the queue.
    deck[cardId(FOUR.id, cast[avoid]!.id)] = { ...newCard(cardId(FOUR.id, cast[avoid]!.id), 0), seen: 1, due: 0, interval: RELEARN_STEP };
    for (let i = 0; i < 50; i++) {
      const q = nextQuestion(FOUR, deck, i, NOW, seeded(i + 7), avoid);
      expect(q.sitter).not.toBe(avoid);
    }
  });

  it('asks unseen faces before re-asking seen faces that are not due', () => {
    const cast = castOf(EIGHT);
    const seenIdx = [0, 1, 2, 3];
    const deck: Deck = {};
    for (const i of seenIdx) {
      const id = cardId(EIGHT.id, cast[i]!.id);
      deck[id] = seenNotDue(id, NOW);
    }
    for (let i = 0; i < 40; i++) {
      const q = nextQuestion(EIGHT, deck, i, NOW, seeded(i + 3));
      expect(seenIdx).not.toContain(q.sitter);
    }
  });
});

describe('SRS through the sitting', () => {
  it('recordAnswer increments seen and correct on a hit', () => {
    const id = cardId(FOUR.id, castOf(FOUR)[0]!.id);
    const d = recordAnswer({}, id, true, 1000, NOW);
    expect(d[id]!.seen).toBe(1);
    expect(d[id]!.correct).toBe(1);
  });

  it('recordAnswer on a miss sets due to now + RELEARN_STEP and resets reps', () => {
    const id = cardId(FOUR.id, castOf(FOUR)[0]!.id);
    let d = recordAnswer({}, id, true, 1000, NOW);
    d = recordAnswer(d, id, true, 1000, NOW);
    expect(d[id]!.reps).toBe(2);
    d = recordAnswer(d, id, false, 5000, NOW);
    expect(d[id]!.due).toBe(NOW + RELEARN_STEP);
    expect(d[id]!.reps).toBe(0);
    expect(d[id]!.lapses).toBe(1);
    expect(d[id]!.seen).toBe(3);
  });

  it('after a miss and time passing, prefers the missed sitter over not-due ones', () => {
    const cast = castOf(FOUR);
    const missedId = cardId(FOUR.id, cast[2]!.id);
    let deck: Deck = {};
    deck = recordAnswer(deck, missedId, false, 5000, NOW);
    for (let i = 0; i < cast.length; i++) {
      if (i === 2) continue;
      const id = cardId(FOUR.id, cast[i]!.id);
      deck[id] = seenNotDue(id, NOW);
    }
    const later = NOW + RELEARN_STEP + 1;
    for (let i = 0; i < 20; i++) {
      const q = nextQuestion(FOUR, deck, i, later, seeded(i + 11));
      expect(q.sitter).toBe(2);
    }
  });
});

describe('isKnown and facesProgress', () => {
  it('a fresh deck knows nothing and is not mastered', () => {
    expect(isKnown(undefined)).toBe(false);
    const p = facesProgress(FOUR, {});
    expect(p.known).toBe(0);
    expect(p.total).toBe(FOUR.size);
    expect(p.toward).toBe(0);
    expect(p.mastered).toBe(false);
  });

  it('is fully known and mastered after every face is answered right twice, fast', () => {
    const deck = masterStage(FOUR, {}, NOW);
    const p = facesProgress(FOUR, deck);
    expect(p.known).toBe(FOUR.size);
    expect(p.toward).toBe(1);
    expect(p.mastered).toBe(true);
  });

  it('facesMastered counts the mastered stage', () => {
    expect(facesMastered({})).toBe(0);
    expect(facesMastered(masterStage(FOUR, {}, NOW))).toBe(1);
  });
});

describe('parseDeck', () => {
  it('drops non-object input', () => {
    expect(parseDeck(null)).toEqual({});
    expect(parseDeck(undefined)).toEqual({});
    expect(parseDeck('faces:four:1')).toEqual({});
    expect(parseDeck(42)).toEqual({});
  });

  it('drops cards whose id does not match the key', () => {
    const id = 'faces:four:abc';
    expect(parseDeck({ [id]: newCard('faces:four:xyz', 0) })).toEqual({});
  });

  it('drops ids that do not start with "faces:"', () => {
    expect(parseDeck({ 'blocks:span:1': newCard('blocks:span:1', 0) })).toEqual({});
  });

  it('drops malformed cards', () => {
    const id = 'faces:four:bad';
    expect(parseDeck({ [id]: { id, ease: 'x' } })).toEqual({});
  });

  it('keeps valid faces cards', () => {
    const id = cardId(FOUR.id, castOf(FOUR)[0]!.id);
    const card = newCard(id, NOW);
    expect(parseDeck({ [id]: card, 'blocks:span:1': newCard('blocks:span:1', 0) })).toEqual({ [id]: card });
  });
});
