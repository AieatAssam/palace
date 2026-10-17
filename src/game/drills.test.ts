import { describe, expect, it } from 'vitest';
import { NOTE_NAMES, noteAt, positionKey, positionsOfNote } from './notes';
import { type Deck, type Rng, newCard, review } from './srs';
import { makeQuestion, questionTargets } from './drills';
import { FIRST_STAGE, type Stage, octaveTargets, regionPositions, stageById, stageItems } from './stages';
import { tuneById, tuneLines } from './melodies';

const T0 = 1_700_000_000_000;

/** Deterministic RNG that cycles through the given values. */
function seq(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

/**
 * A deck where `id` is the only unseen item and everything else was reviewed
 * (and is not yet due), so makeQuestion must pick `id`.
 */
function deckWithOnly(stage: Stage, id: string, now: number): Deck {
  const deck: Deck = {};
  for (const other of stageItems(stage)) {
    if (other !== id) deck[other] = review(newCard(other, now), 5, now, 1000);
  }
  return deck;
}

describe('name questions', () => {
  it('on the first stage with an empty deck and rng 0, asks for low E open', () => {
    const q = makeQuestion(FIRST_STAGE, {}, T0, () => 0);
    expect(q.kind).toBe('name');
    expect(q).toMatchObject({ itemId: 'name:s0f0', position: { string: 0, fret: 0 }, answer: 'E' });
    if (q.kind !== 'name') throw new Error('unreachable');
    expect(q.choices).toHaveLength(12);
    expect([...q.choices]).toEqual([...NOTE_NAMES]);
    expect(questionTargets(q)).toEqual([{ string: 0, fret: 0 }]);
  });

  it('every name item on the full-neck stages has the answer its position sounds', () => {
    for (const id of ['nat-n12', 'acc-n12']) {
      const stage = stageById(id);
      for (const item of stageItems(stage)) {
        const q = makeQuestion(stage, deckWithOnly(stage, item, T0), T0, () => 0);
        expect(q.itemId).toBe(item);
        if (q.kind !== 'name') throw new Error('expected a name question');
        expect(q.answer).toBe(noteAt(q.position));
        expect(`name:${positionKey(q.position)}`).toBe(item);
      }
    }
  });
});

describe('find questions', () => {
  it('on the naturals find stage, C targets every C across the six strings at frets 0–12', () => {
    const stage = stageById('nat-find');
    const q = makeQuestion(stage, {}, T0, () => 0);
    expect(q.kind).toBe('find');
    if (q.kind !== 'find') throw new Error('unreachable');
    expect(q.note).toBe('C');
    expect(q.spelling).toBe('sharp');
    expect(q.targets).toEqual(positionsOfNote('C', regionPositions(stage)));
    expect(q.targets).toHaveLength(6);
    // Region order is fret-major, low strings first.
    expect(q.targets).toEqual([
      { string: 4, fret: 1 },
      { string: 1, fret: 3 },
      { string: 3, fret: 5 },
      { string: 0, fret: 8 },
      { string: 5, fret: 8 },
      { string: 2, fret: 10 },
    ]);
  });

  it('every natural find item targets exactly the positions of its note in the region', () => {
    const stage = stageById('nat-find');
    for (const item of stageItems(stage)) {
      const q = makeQuestion(stage, deckWithOnly(stage, item, T0), T0, () => 0);
      if (q.kind !== 'find') throw new Error('expected a find question');
      expect(q.itemId).toBe(item);
      expect(q.targets).toEqual(positionsOfNote(q.note, regionPositions(stage)));
      expect(q.targets.length).toBeGreaterThanOrEqual(6);
      expect(q.targets.length).toBeLessThanOrEqual(12);
      expect(q.targets.every((p) => noteAt(p) === q.note)).toBe(true);
    }
  });

  it('on the accidentals find stage, the spelling is sharp when the roll is high', () => {
    // Item pick uses one roll (0.9 → third unseen item, F#); spelling uses the next (0.9 → sharp).
    const q = makeQuestion(stageById('acc-find'), {}, T0, () => 0.9);
    expect(q.kind).toBe('find');
    if (q.kind !== 'find') throw new Error('unreachable');
    expect(q.note).toBe('F#');
    expect(q.spelling).toBe('sharp');
  });

  it('on the accidentals find stage, the spelling is flat when the spelling roll is below one half', () => {
    // Pick roll 0.9 → F#; spelling roll 0.1 → flat.
    const q = makeQuestion(stageById('acc-find'), {}, T0, seq(0.9, 0.1));
    if (q.kind !== 'find') throw new Error('unreachable');
    expect(q.note).toBe('F#');
    expect(q.spelling).toBe('flat');
    expect(q.targets.every((p) => noteAt(p) === 'F#')).toBe(true);
  });

  it('naturals never get a flat spelling', () => {
    const q = makeQuestion(stageById('nat-find'), {}, T0, seq(0.9, 0.1));
    if (q.kind !== 'find') throw new Error('unreachable');
    expect(q.spelling).toBe('sharp');
  });
});

describe('octave questions', () => {
  it('on the naturals octave stage with rng 0, asks for the octave of low E open', () => {
    const stage = stageById('nat-oct');
    const q = makeQuestion(stage, {}, T0, () => 0);
    expect(q.kind).toBe('octave');
    if (q.kind !== 'octave') throw new Error('unreachable');
    expect(q.position).toEqual({ string: 0, fret: 0 });
    expect(q.targets).toEqual([{ string: 2, fret: 2 }]);
    expect(q.targets).toEqual(octaveTargets(q.position, stage.maxFret));
  });

  it('every octave item carries exactly the octave targets of its position', () => {
    for (const id of ['nat-oct', 'acc-oct']) {
      const stage = stageById(id);
      for (const item of stageItems(stage)) {
        const q = makeQuestion(stage, deckWithOnly(stage, item, T0), T0, () => 0);
        if (q.kind !== 'octave') throw new Error('expected an octave question');
        expect(q.itemId).toBe(item);
        expect(q.targets.length).toBeGreaterThan(0);
        expect(q.targets).toEqual(octaveTargets(q.position, stage.maxFret));
      }
    }
  });
});

describe('melody questions', () => {
  it('on the phrase stage asks for the opening phrase of the first tune at 75% pace', () => {
    const stage = stageById('mel-phrase');
    const q = makeQuestion(stage, {}, T0, () => 0);
    expect(q.kind).toBe('melody');
    if (q.kind !== 'melody') throw new Error('unreachable');
    expect(q.itemId).toBe('mel:mel-phrase:ode');
    expect(q.tuneId).toBe('ode');
    expect(q.title).toBe('Ode to Joy');
    expect(q.source).toBe('Beethoven, 1824');
    expect(q.tempo).toBe(75); // Ode to Joy is 100 bpm
    expect(q.recall).toBe(false);
    expect(q.targets).toEqual([]);
  });

  it('gives the notes of the lines as one run', () => {
    for (const id of ['mel-phrase', 'mel-tune', 'mel-neck', 'mel-recall']) {
      const stage = stageById(id);
      for (const item of stageItems(stage)) {
        const q = makeQuestion(stage, deckWithOnly(stage, item, T0), T0, () => 0);
        if (q.kind !== 'melody') throw new Error('expected a melody question');
        expect(q.itemId).toBe(item);
        const tune = tuneById(q.tuneId);
        expect(q.lines).toEqual(tuneLines(tune, stage.melody!.part));
        expect(q.notes).toEqual(q.lines.flat());
      }
    }
  });

  it('plays the whole tune on the whole-tune stages, and only the phrase on the phrase stage', () => {
    const ode = tuneById('ode');
    const whole = makeQuestion(stageById('mel-tune'), deckWithOnly(stageById('mel-tune'), 'mel:mel-tune:ode', T0), T0, () => 0);
    if (whole.kind !== 'melody') throw new Error('unreachable');
    expect(whole.lines).toEqual(ode.lines);
    expect(whole.notes.length).toBeGreaterThan(ode.lines.slice(0, ode.phraseLines).flat().length);
  });

  it('scales the tempo by the stage pace, rounded', () => {
    const frere = 'mel:mel-tune:frere';
    const stage = stageById('mel-tune');
    const q = makeQuestion(stage, deckWithOnly(stage, frere, T0), T0, () => 0);
    if (q.kind !== 'melody') throw new Error('unreachable');
    expect(q.tempo).toBe(110);
    const phrase = stageById('mel-phrase');
    const p = makeQuestion(phrase, deckWithOnly(phrase, 'mel:mel-phrase:frere', T0), T0, () => 0);
    if (p.kind !== 'melody') throw new Error('unreachable');
    expect(p.tempo).toBe(Math.round(110 * 0.75));
  });

  it('is recall only on the from-memory stage', () => {
    for (const id of ['mel-phrase', 'mel-tune', 'mel-neck', 'mel-recall']) {
      const stage = stageById(id);
      const q = makeQuestion(stage, {}, T0, () => 0);
      if (q.kind !== 'melody') throw new Error('unreachable');
      expect(q.recall).toBe(id === 'mel-recall');
    }
  });
});

describe('avoid', () => {
  it('skips the item just asked when alternatives exist', () => {
    const q = makeQuestion(FIRST_STAGE, {}, T0, () => 0, 'name:s0f0');
    expect(q.itemId).toBe('name:s0f1');
    if (q.kind !== 'name') throw new Error('unreachable');
    expect(q.answer).toBe('F');
  });

  it('never repeats back-to-back over a session', () => {
    let deck: Deck = {};
    let now = T0;
    let prev: string | undefined;
    for (let i = 0; i < 60; i++) {
      const q = makeQuestion(FIRST_STAGE, deck, now, Math.random, prev);
      expect(q.itemId).not.toBe(prev);
      deck = { ...deck, [q.itemId]: review(deck[q.itemId] ?? newCard(q.itemId, now), 5, now, 1000) };
      prev = q.itemId;
      now += 4000;
    }
  });
});
