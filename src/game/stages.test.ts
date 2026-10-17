import { describe, expect, it } from 'vitest';
import { midiAt, noteAt, positionKey } from './notes';
import { type Deck, type Card, newCard, review } from './srs';
import { TUNES } from './melodies';
import {
  BOOKS,
  FIRST_STAGE,
  STAGES,
  type Stage,
  inBook,
  masteredStages,
  octaveTargets,
  regionPositions,
  stageById,
  stageItems,
  stagePositions,
  stageProgress,
} from './stages';

const T0 = 1_700_000_000_000;

const byId = (id: string) => stageById(id);

/** Grade every item of a stage with a clean pass, four times over (mastery 1). */
function masterStage(stage: Stage, base: Deck = {}): Deck {
  const out: Deck = { ...base };
  for (const id of stageItems(stage)) {
    let c: Card = out[id] ?? newCard(id, T0);
    for (let i = 0; i < 4; i++) c = review(c, 5, c.due, 1000);
    out[id] = c;
  }
  return out;
}

describe('syllabus shape', () => {
  it('has 36 stages: 16 naturals, 16 sharps and flats, then 4 melodies', () => {
    expect(STAGES).toHaveLength(36);
    expect(STAGES.slice(0, 16).every((s) => s.book === 'naturals')).toBe(true);
    expect(STAGES.slice(16, 32).every((s) => s.book === 'accidentals')).toBe(true);
    expect(STAGES.slice(32).every((s) => s.book === 'melodies')).toBe(true);
  });

  it('lists the melodies book last, after naturals and sharps and flats', () => {
    expect(BOOKS.map((b) => b.id)).toEqual(['naturals', 'accidentals', 'melodies']);
    expect(STAGES.slice(32).map((s) => s.id)).toEqual(['mel-phrase', 'mel-tune', 'mel-neck', 'mel-recall']);
  });

  it('gives the melody stages the melody chapter and drill, with their rules', () => {
    const mel = STAGES.slice(32);
    expect(mel.every((s) => s.chapter === 'melody' && s.drill === 'melody')).toBe(true);
    expect(mel.map((s) => s.melody)).toEqual([
      { part: 'phrase', recall: false, pace: 0.75 },
      { part: 'whole', recall: false, pace: 1 },
      { part: 'whole', recall: false, pace: 1 },
      { part: 'whole', recall: true, pace: 1 },
    ]);
    expect(mel[0]!.strings).toEqual([3, 4, 5]);
    expect(mel[0]!.maxFret).toBe(5);
    for (const s of mel.slice(1)) expect(s.strings).toEqual([0, 1, 2, 3, 4, 5]);
    expect(mel.map((s) => s.maxFret)).toEqual([5, 5, 12, 12]);
  });

  it('keeps melody rules off the note stages', () => {
    for (const s of STAGES.slice(0, 32)) expect(s.melody).toBeUndefined();
  });

  it('walks each book in order: strings, pairs, neck reaches, octaves, find', () => {
    for (const book of ['naturals', 'accidentals'] as const) {
      const stages = STAGES.filter((s) => s.book === book);
      expect(stages.map((s) => s.chapter)).toEqual([
        'string', 'string', 'string', 'string', 'string', 'string',
        'pair', 'pair', 'pair', 'pair', 'pair',
        'neck', 'neck', 'neck',
        'octave',
        'find',
      ]);
      for (let s = 0; s < 6; s++) {
        expect(stages[s]!.strings).toEqual([s]);
        expect(stages[s]!.drill).toBe('name');
      }
      for (let s = 0; s < 5; s++) expect(stages[6 + s]!.strings).toEqual([s, s + 1]);
      expect(stages.slice(11, 14).map((s) => s.maxFret)).toEqual([5, 9, 12]);
      for (const n of stages.slice(11, 14)) expect(n.strings).toEqual([0, 1, 2, 3, 4, 5]);
      expect(stages[14]!.drill).toBe('octave');
      expect(stages[15]!.drill).toBe('find');
    }
  });

  it('gives every stage a unique id, with the first being nat-s0', () => {
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(36);
    expect(FIRST_STAGE.id).toBe('nat-s0');
    expect(STAGES[0]).toBe(FIRST_STAGE);
  });

  it('stageById finds known ids and falls back to FIRST_STAGE otherwise', () => {
    expect(stageById('acc-oct').id).toBe('acc-oct');
    expect(stageById('nope')).toBe(FIRST_STAGE);
    expect(stageById(null)).toBe(FIRST_STAGE);
    expect(stageById(undefined)).toBe(FIRST_STAGE);
  });
});

describe('coverage', () => {
  it('the stages together cover all 6 strings and frets 0–12 (78 positions)', () => {
    const keys = new Set(STAGES.flatMap((s) => regionPositions(s).map(positionKey)));
    expect(keys.size).toBe(78);
  });

  it('every position is a stage position in exactly one note book', () => {
    const books = new Map<string, Set<string>>();
    for (const s of STAGES) {
      if (s.book === 'melodies') continue;
      const set = books.get(s.book) ?? new Set<string>();
      for (const p of stagePositions(s)) set.add(positionKey(p));
      books.set(s.book, set);
    }
    expect(books.get('naturals')!.size + books.get('accidentals')!.size).toBe(78);
    for (const k of books.get('naturals')!) expect(books.get('accidentals')!.has(k)).toBe(false);
  });
});

describe('stage positions', () => {
  it('naturals stages hold only natural notes; accidentals only sharps', () => {
    for (const s of STAGES) {
      if (s.book === 'melodies') continue;
      for (const p of stagePositions(s)) {
        if (s.book === 'naturals') expect(noteAt(p)).not.toContain('#');
        else expect(noteAt(p)).toContain('#');
      }
    }
  });

  it('low E naturals over frets 0–12 are E F G A B C D E (8 positions)', () => {
    const ps = stagePositions(byId('nat-s0'));
    expect(ps.map((p) => p.fret)).toEqual([0, 1, 3, 5, 7, 8, 10, 12]);
    expect(ps.map(noteAt)).toEqual(['E', 'F', 'G', 'A', 'B', 'C', 'D', 'E']);
  });

  it('low E sharps and flats over frets 0–12 are F# G# A# C# D# (5 positions)', () => {
    const ps = stagePositions(byId('acc-s0'));
    expect(ps.map(noteAt)).toEqual(['F#', 'G#', 'A#', 'C#', 'D#']);
  });
});

describe('stageItems', () => {
  it('name stages give name:sXfY ids in curriculum order', () => {
    expect(stageItems(byId('nat-s0'))).toEqual([
      'name:s0f0', 'name:s0f1', 'name:s0f3', 'name:s0f5', 'name:s0f7', 'name:s0f8', 'name:s0f10', 'name:s0f12',
    ]);
    for (const id of stageItems(byId('acc-n12'))) expect(id).toMatch(/^name:s\d+f\d+$/);
  });

  it('find stage gives 7 natural note ids, and 5 sharp/flat ids for accidentals', () => {
    expect(stageItems(byId('nat-find'))).toEqual(['find:C', 'find:D', 'find:E', 'find:F', 'find:G', 'find:A', 'find:B']);
    expect(stageItems(byId('acc-find'))).toEqual(['find:C#', 'find:D#', 'find:F#', 'find:G#', 'find:A#']);
  });

  it('octave stage gives oct: ids only for positions with at least one octave target', () => {
    const stage = byId('nat-oct');
    const ids = stageItems(stage);
    expect(ids.every((id) => id.startsWith('oct:'))).toBe(true);
    const expected = regionPositions(stage)
      .filter((p) => !noteAt(p).includes('#') && octaveTargets(p).length > 0)
      .map((p) => `oct:${positionKey(p)}`);
    expect(ids).toEqual(expected);
    expect(ids).toContain('oct:s0f3'); // G on low E: an octave on the D string
    expect(ids).not.toContain('oct:s4f1'); // C on B: no octave in reach
    expect(ids.length).toBeLessThan(stagePositions(stage).length);
  });

  it('the accidentals octave stage uses sharps and flats only', () => {
    const ids = stageItems(byId('acc-oct'));
    expect(ids).toContain('oct:s0f2'); // F# on low E
    expect(ids).not.toContain('oct:s0f0'); // E is not a sharp
  });

  it('melody stages give one mel: item per tune, in TUNES order', () => {
    for (const s of STAGES.slice(32)) {
      expect(stageItems(s)).toEqual(TUNES.map((t) => `mel:${s.id}:${t.id}`));
    }
    expect(stageItems(byId('mel-recall'))[0]).toBe('mel:mel-recall:ode');
  });

  it('melody stages count every tune as an item, whatever the region', () => {
    expect(stageItems(byId('mel-phrase'))).toHaveLength(TUNES.length);
    expect(stageItems(byId('mel-neck'))).toHaveLength(TUNES.length);
  });

  it('the melodies book admits every pitch', () => {
    expect(inBook('melodies', 'F#')).toBe(true);
    expect(inBook('melodies', 'E')).toBe(true);
  });
});

describe('octaveTargets', () => {
  it('low E fret 3 (G) reaches G two strings up at D fret 5', () => {
    expect(octaveTargets({ string: 0, fret: 3 })).toEqual([{ string: 2, fret: 5 }]);
  });

  it('G string fret 2 (A) reaches down to A string fret 0 and up to high E fret 5', () => {
    expect(octaveTargets({ string: 3, fret: 2 })).toEqual([
      { string: 1, fret: 0 },
      { string: 5, fret: 5 },
    ]);
  });

  it('B string fret 1 (C) has no octave shape: the D string would need fret -2, and there is no string above high E', () => {
    // Derived from MIDI: source C4 = 60, the octave down is C3 = 48 on the D string (open 50): fret -2.
    expect(midiAt({ string: 4, fret: 1 })).toBe(60);
    expect(octaveTargets({ string: 4, fret: 1 })).toEqual([]);
  });

  it('every target is two strings over, an octave (12 semitones) away, and inside the fret limit', () => {
    for (const maxFret of [5, 9, 12]) {
      for (const p of regionPositions({ ...byId('nat-n12'), maxFret })) {
        for (const t of octaveTargets(p, maxFret)) {
          expect(Math.abs(t.string - p.string)).toBe(2);
          expect(midiAt(t) - midiAt(p)).toBe(t.string > p.string ? 12 : -12);
          expect(t.fret).toBeGreaterThanOrEqual(0);
          expect(t.fret).toBeLessThanOrEqual(maxFret);
        }
      }
    }
  });

  it('shapes beyond the stage frets are dropped', () => {
    // High E fret 12 (E5, 76): the G string octave is fret 9.
    expect(octaveTargets({ string: 5, fret: 12 })).toEqual([{ string: 3, fret: 9 }]);
    expect(octaveTargets({ string: 5, fret: 12 }, 9)).toEqual([{ string: 3, fret: 9 }]);
    expect(octaveTargets({ string: 5, fret: 12 }, 5)).toEqual([]);
  });
});

describe('stageProgress and mastery', () => {
  it('an empty deck is 0 sure, not mastered, 0 toward', () => {
    const p = stageProgress(byId('nat-s0'), {});
    expect(p).toMatchObject({ total: 8, seen: 0, sure: 0, mastered: false, toward: 0, meanMastery: 0 });
  });

  it('reviewing every item four times at grade 5 masters the stage', () => {
    const stage = byId('nat-s0');
    const p = stageProgress(stage, masterStage(stage));
    expect(p.mastered).toBe(true);
    expect(p.toward).toBe(1);
    expect(p.sure).toBe(p.total);
  });

  it('mastering one string also counts towards the pair and neck stages that share it', () => {
    const deck = masterStage(byId('nat-s0'));
    // nat-p01: 8 low E naturals (all sure) + 8 A naturals (unseen) = 16; 90% needs 15.
    const pair = stageProgress(byId('nat-p01'), deck);
    expect(pair.sure).toBe(8);
    expect(pair.mastered).toBe(false);
    // nat-n5: low E naturals at frets 0–5 are E F G A.
    expect(stageProgress(byId('nat-n5'), deck).sure).toBe(4);
    expect(stageProgress(byId('nat-n12'), deck).sure).toBe(8);
    expect(stageProgress(byId('nat-n12'), deck).mastered).toBe(false);
    // The other book is untouched.
    expect(stageProgress(byId('acc-s0'), deck).sure).toBe(0);
  });

  it('fewer than 90% sure is not mastered', () => {
    const deck = masterStage(byId('nat-s0'));
    const partial: Deck = { ...deck };
    delete partial['name:s0f0']; // 7 of 8 sure = 87.5%, short of the 90% bar
    const p = stageProgress(byId('nat-s0'), partial);
    expect(p.sure).toBe(7);
    expect(p.mastered).toBe(false);
    expect(p.toward).toBeCloseTo(7 / 8);
  });
});

describe('masteredStages', () => {
  it('is empty for an empty deck', () => {
    expect(masteredStages({})).toEqual(new Set());
  });

  it('returns the ids of mastered stages', () => {
    expect(masteredStages(masterStage(byId('nat-s0')))).toEqual(new Set(['nat-s0']));
  });
});
