import { MAX_FRET, NOTE_NAMES, type NoteName, type Position, STRING_COUNT, midiAt, noteAt, positionKey } from './notes';
import { TUNES } from './melodies';
import { type Deck, mastery } from './srs';

/**
 * The fretboard syllabus: an ordered list of stages, every one of them open.
 *
 * Two books, naturals first, then sharps and flats. Each book walks the same road:
 * one string at a time, then neighbouring pairs, then the whole neck in three
 * widening reaches, then octave shapes and Find-all. Items (a position to name, a
 * note to find, an octave to reach) are shared between stages, so practice on
 * one string counts towards every stage that contains it.
 *
 * A third book holds the melodies: short tunes played note by note on the neck, from an
 * opening phrase near the nut to a whole tune played from memory. Each tune is an item.
 */
export type Book = 'naturals' | 'accidentals' | 'melodies';
export type Chapter = 'string' | 'pair' | 'neck' | 'octave' | 'find' | 'melody';
export type StageDrill = 'name' | 'find' | 'octave' | 'melody';

/** A melody stage: how much of each tune, and whether the card hides it after one hearing. */
export interface MelodyRule {
  part: 'phrase' | 'whole';
  /** Hidden after one preview: played from memory. */
  recall: boolean;
  /** Playback speed against the tune's own tempo (slow phrases < 1). */
  pace: number;
}

export interface Stage {
  id: string;
  book: Book;
  chapter: Chapter;
  /** Full name, e.g. "Low E string". */
  title: string;
  /** Label on the stage card, e.g. "E" or "0–5". */
  short: string;
  /** String indices (0 = low E … 5 = high e). */
  strings: readonly number[];
  /** Frets 0..maxFret are in play. */
  maxFret: number;
  drill: StageDrill;
  melody?: MelodyRule;
}

export const BOOKS: readonly { id: Book; title: string; short: string }[] = [
  { id: 'naturals', title: 'Naturals', short: 'naturals' },
  { id: 'accidentals', title: 'Sharps & flats', short: 'sharps & flats' },
  { id: 'melodies', title: 'Melodies', short: 'melodies' },
];

const ALL_STRINGS = [0, 1, 2, 3, 4, 5] as const;
const STRING_TITLES = ['Low E string', 'A string', 'D string', 'G string', 'B string', 'High E string'];
const STRING_SHORT = ['E', 'A', 'D', 'G', 'B', 'e'];
const PAIR_TITLES = ['Low E & A', 'A & D', 'D & G', 'G & B', 'B & high E'];
/** The neck opens out in three reaches: first position, past the 9th, the octave. */
export const NECK_REACHES = [5, 9, 12] as const;

function bookStages(book: Book): Stage[] {
  const p = book === 'naturals' ? 'nat' : 'acc';
  const out: Stage[] = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    out.push({ id: `${p}-s${s}`, book, chapter: 'string', title: STRING_TITLES[s]!, short: STRING_SHORT[s]!, strings: [s], maxFret: MAX_FRET, drill: 'name' });
  }
  for (let s = 0; s < STRING_COUNT - 1; s++) {
    out.push({
      id: `${p}-p${s}${s + 1}`,
      book,
      chapter: 'pair',
      title: PAIR_TITLES[s]!,
      short: `${STRING_SHORT[s]}\u00b7${STRING_SHORT[s + 1]}`,
      strings: [s, s + 1],
      maxFret: MAX_FRET,
      drill: 'name',
    });
  }
  for (const f of NECK_REACHES) {
    out.push({
      id: `${p}-n${f}`,
      book,
      chapter: 'neck',
      title: f === MAX_FRET ? 'Full neck' : `Frets 0–${f}`,
      short: `0–${f}`,
      strings: ALL_STRINGS,
      maxFret: f,
      drill: 'name',
    });
  }
  out.push({ id: `${p}-oct`, book, chapter: 'octave', title: 'Octave shapes', short: 'Octaves', strings: ALL_STRINGS, maxFret: MAX_FRET, drill: 'octave' });
  out.push({ id: `${p}-find`, book, chapter: 'find', title: 'Find all', short: 'Find all', strings: ALL_STRINGS, maxFret: MAX_FRET, drill: 'find' });
  return out;
}

/**
 * Melodies, in four steps: the opening phrase on the three treble strings by the nut, slow;
 * the whole tune in first position; the whole tune anywhere on frets 0–12; then from memory.
 */
export const MELODY_STAGES: readonly Stage[] = [
  { id: 'mel-phrase', book: 'melodies', chapter: 'melody', title: 'Opening phrases', short: 'Phrase', strings: [3, 4, 5], maxFret: 5, drill: 'melody', melody: { part: 'phrase', recall: false, pace: 0.75 } },
  { id: 'mel-tune', book: 'melodies', chapter: 'melody', title: 'Whole tunes', short: 'Tunes', strings: ALL_STRINGS, maxFret: 5, drill: 'melody', melody: { part: 'whole', recall: false, pace: 1 } },
  { id: 'mel-neck', book: 'melodies', chapter: 'melody', title: 'Tunes, full neck', short: '0–12', strings: ALL_STRINGS, maxFret: MAX_FRET, drill: 'melody', melody: { part: 'whole', recall: false, pace: 1 } },
  { id: 'mel-recall', book: 'melodies', chapter: 'melody', title: 'Tunes from memory', short: 'Recall', strings: ALL_STRINGS, maxFret: MAX_FRET, drill: 'melody', melody: { part: 'whole', recall: true, pace: 1 } },
];

export const STAGES: readonly Stage[] = [...bookStages('naturals'), ...bookStages('accidentals'), ...MELODY_STAGES];
export const FIRST_STAGE = STAGES[0]!;

export function stageById(id: string | undefined | null): Stage {
  return STAGES.find((s) => s.id === id) ?? FIRST_STAGE;
}

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function bookTitle(book: Book): string {
  return BOOKS.find((b) => b.id === book)!.title;
}

/** "Low E string · naturals" */
export function stageLabel(stage: Stage): string {
  return `${stage.title} · ${BOOKS.find((b) => b.id === stage.book)!.short}`;
}

export const isNatural = (n: NoteName) => !n.includes('#');

export function inBook(book: Book, n: NoteName): boolean {
  if (book === 'melodies') return true;
  return book === 'naturals' ? isNatural(n) : !isNatural(n);
}

/** Every position on the stage's strings and frets, nut outward, low strings first. */
export function regionPositions(stage: Stage): Position[] {
  const out: Position[] = [];
  for (let f = 0; f <= stage.maxFret; f++) for (const s of stage.strings) out.push({ string: s, fret: f });
  return out;
}

export function inRegion(stage: Stage, p: Position): boolean {
  return stage.strings.includes(p.string) && p.fret >= 0 && p.fret <= stage.maxFret;
}

/** The region's positions whose note belongs to the stage's book. */
export function stagePositions(stage: Stage): Position[] {
  return regionPositions(stage).filter((p) => inBook(stage.book, noteAt(p)));
}

/**
 * Octave shapes: the same note an octave away, two strings over. Up from the low
 * strings that is two frets higher; across the G–B gap it is three. Only shapes
 * that land inside the stage's frets count.
 */
export function octaveTargets(p: Position, maxFret = MAX_FRET): Position[] {
  const midi = midiAt(p);
  const out: Position[] = [];
  for (const ds of [-2, 2]) {
    const s = p.string + ds;
    if (s < 0 || s >= STRING_COUNT) continue;
    const want = midi + (ds > 0 ? 12 : -12);
    const open = midiAt({ string: s, fret: 0 });
    const f = want - open;
    if (f >= 0 && f <= maxFret) out.push({ string: s, fret: f });
  }
  return out;
}

export const nameItemId = (p: Position) => `name:${positionKey(p)}`;
export const findItemId = (n: NoteName) => `find:${n}`;
export const octaveItemId = (p: Position) => `oct:${positionKey(p)}`;
export const melodyItemId = (stage: Stage, tuneId: string) => `mel:${stage.id}:${tuneId}`;

export function notesInPositions(positions: readonly Position[]): NoteName[] {
  const set = new Set(positions.map(noteAt));
  return NOTE_NAMES.filter((n) => set.has(n));
}

/** The stage's scheduler items, in curriculum order (new items are introduced in this order). */
export function stageItems(stage: Stage): string[] {
  const positions = stagePositions(stage);
  switch (stage.drill) {
    case 'name':
      return positions.map(nameItemId);
    case 'find':
      return notesInPositions(positions).map(findItemId);
    case 'octave':
      return positions.filter((p) => octaveTargets(p, stage.maxFret).length > 0).map(octaveItemId);
    case 'melody':
      return TUNES.map((t) => melodyItemId(stage, t.id));
  }
}

/** An item counts as known once its mastery clears this. */
export const SURE = 0.7;
/** A stage is mastered when this share of its items is sure. */
export const MASTERED = 0.9;

export interface StageProgress {
  total: number;
  seen: number;
  /** Items at or above `SURE`. */
  sure: number;
  meanMastery: number;
  /** 0..1: the share of the mastery bar reached (sure / needed). */
  toward: number;
  mastered: boolean;
}

export function stageProgress(stage: Stage, deck: Deck): StageProgress {
  const ids = stageItems(stage);
  let seen = 0;
  let sure = 0;
  let sum = 0;
  for (const id of ids) {
    const c = deck[id];
    if (c && c.seen > 0) seen++;
    const m = mastery(c);
    if (m >= SURE) sure++;
    sum += m;
  }
  const total = ids.length;
  const needed = Math.max(1, Math.ceil(total * MASTERED));
  return {
    total,
    seen,
    sure,
    meanMastery: total ? sum / total : 0,
    toward: Math.min(1, sure / needed),
    mastered: total > 0 && sure >= needed,
  };
}

/** Stage ids mastered under the given deck. */
export function masteredStages(deck: Deck): Set<string> {
  return new Set(STAGES.filter((s) => stageProgress(s, deck).mastered).map((s) => s.id));
}
