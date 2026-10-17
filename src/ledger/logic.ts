/**
 * Ledger, the pure part: number memory with the Major system. The stages, the ten consonant
 * sounds, the hundred peg words, the numbers the ledger writes, how keyed digits are checked,
 * and the saved record (a best line per span stage, a spaced-repetition deck for the pegs).
 * Nothing here touches the DOM, audio, timers or storage; callers pass their own random source.
 */
import { type Card, type Deck, gradeFromResponse, isCard, mastery, newCard, pickNext, review } from '../game/srs';

export type Rng = () => number;

/** A span stage writes a number to hold; a peg stage drills the code itself. */
export type LedgerKind = 'span' | 'sounds' | 'pegs';

export interface LedgerStage {
  id: string;
  /** Full name, e.g. "Peg words, 00 to 49". */
  title: string;
  /** The stage card's label. */
  short: string;
  /** A few words for the stage card's second line. */
  note: string;
  kind: LedgerKind;
  /** Span stages: digits in the first number of a sitting, the step after a clean one, the most, and the length that masters the stage. */
  start: number;
  step: number;
  most: number;
  mastery: number;
  /** Span stages: the ledger writes one digit at a time (ms apart), or the whole number at once (0) for as long as the player wants. */
  tempo: number;
  /** Span stages: the peg word for each pair is pencilled under the figures. */
  glosses: boolean;
  /** Peg stages: the numbers drilled, e.g. 0..9 for the sounds, 0..49 for the first half of the pegs. */
  from: number;
  to: number;
}

const span = (o: Pick<LedgerStage, 'id' | 'title' | 'short' | 'note' | 'start' | 'step' | 'most' | 'mastery' | 'tempo' | 'glosses'>): LedgerStage => ({ ...o, kind: 'span', from: 0, to: 0 });
const drill = (o: Pick<LedgerStage, 'id' | 'title' | 'short' | 'note' | 'kind' | 'from' | 'to'>): LedgerStage => ({ ...o, start: 0, step: 0, most: 0, mastery: 0, tempo: 0, glosses: false });

export const LEDGER_STAGES: readonly LedgerStage[] = [
  span({ id: 'span', title: 'Digit span', short: 'Digit span', note: 'One figure at a time, then key them back', start: 4, step: 1, most: 14, mastery: 8, tempo: 1000, glosses: false }),
  drill({ id: 'sounds', title: 'The ten sounds', short: 'The ten sounds', note: 'Each figure has a consonant', kind: 'sounds', from: 0, to: 9 }),
  drill({ id: 'pegs-low', title: 'Peg words, 00 to 49', short: 'Pegs 00 to 49', note: 'A word for every pair', kind: 'pegs', from: 0, to: 49 }),
  drill({ id: 'pegs-high', title: 'Peg words, 50 to 99', short: 'Pegs 50 to 99', note: 'The second half of the hundred', kind: 'pegs', from: 50, to: 99 }),
  span({ id: 'long', title: 'Long numbers, pegs pencilled', short: 'Long numbers', note: 'The pegs pencilled under each pair', start: 8, step: 2, most: 30, mastery: 16, tempo: 0, glosses: true }),
  span({ id: 'long-bare', title: 'Long numbers, bare', short: 'Long, bare', note: 'Find the pegs yourself', start: 8, step: 2, most: 30, mastery: 14, tempo: 0, glosses: false }),
];

export const FIRST_LEDGER_STAGE = LEDGER_STAGES[0]!;

export function ledgerStageById(id: string): LedgerStage {
  return LEDGER_STAGES.find((s) => s.id === id) ?? FIRST_LEDGER_STAGE;
}

/** The Major system: the consonant sounds for each figure, as a clerk would write them. */
export const SOUNDS: readonly string[] = ['s, z', 't, d', 'n', 'm', 'r', 'l', 'j, sh, ch', 'k, hard g', 'f, v', 'p, b'];

/** A reminder of each sound's shape, for the answer card after a slip. */
export const SOUND_HINTS: readonly string[] = [
  'z for zero',
  't has one downstroke',
  'n has two',
  'm has three',
  'four ends in r',
  'L is fifty in Roman figures',
  'a script j curls like a 6',
  'two 7s make a K',
  'a script f loops like an 8',
  'p is a 9 turned over',
];

/** The hundred peg words, 00 to 99: each sounds out its two figures and nothing else. */
export const PEGS: readonly string[] = [
  'sauce', 'seed', 'swan', 'sumo', 'sari', 'sail', 'sash', 'sack', 'sofa', 'soap',
  'toes', 'tide', 'tin', 'dome', 'tower', 'towel', 'dish', 'deck', 'dove', 'tuba',
  'nose', 'net', 'nun', 'gnome', 'Nero', 'nail', 'niche', 'neck', 'knife', 'knob',
  'mouse', 'mat', 'moon', 'mummy', 'mower', 'mule', 'match', 'mug', 'muff', 'map',
  'rose', 'rat', 'rain', 'ram', 'rower', 'rail', 'rash', 'rake', 'roof', 'rope',
  'lace', 'lute', 'lion', 'lamb', 'lyre', 'lily', 'leash', 'lock', 'loaf', 'lip',
  'cheese', 'sheet', 'chain', 'chime', 'chair', 'jewel', 'judge', 'chick', 'chef', 'ship',
  'case', 'cat', 'coin', 'comb', 'car', 'coal', 'cage', 'cake', 'cave', 'cape',
  'vase', 'foot', 'fan', 'foam', 'fire', 'file', 'fish', 'fig', 'fife', 'fob',
  'bus', 'bat', 'pen', 'puma', 'bear', 'bell', 'bush', 'book', 'puff', 'pipe',
];

/** Two figures as the ledger writes them: 7 → "07". */
export const pair = (n: number) => String(n).padStart(2, '0');

/** A fresh number of `length` figures. */
export function makeNumber(length: number, rng: Rng): number[] {
  return Array.from({ length: Math.max(0, length) }, () => Math.min(9, Math.floor(rng() * 10)));
}

/** The pegs for a number, read in pairs (an odd figure at the end stands alone, read by its sound). */
export function pegsFor(digits: readonly number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < digits.length; i += 2) {
    const a = digits[i]!;
    const b = digits[i + 1];
    out.push(b === undefined ? SOUNDS[a]!.split(',')[0]! : PEGS[a * 10 + b]!);
  }
  return out;
}

export type KeyResult =
  /** Right figure; the number goes on. */
  | { kind: 'step'; done: number }
  /** The whole number, keyed back. */
  | { kind: 'line'; done: number }
  /** Wrong figure. `wanted` is the one due. */
  | { kind: 'miss'; done: number; wanted: number };

/** Check one keyed figure against the number, `done` figures already right. */
export function key(expected: readonly number[], done: number, digit: number): KeyResult {
  const want = expected[done];
  if (want === undefined) return { kind: 'miss', done, wanted: -1 };
  if (digit !== want) return { kind: 'miss', done, wanted: want };
  const next = done + 1;
  return { kind: next >= expected.length ? 'line' : 'step', done: next };
}

/** The next number's length: a step longer after a clean one (never past the most), a step shorter after a slip (never under the start). */
export function nextLength(stage: Pick<LedgerStage, 'start' | 'step' | 'most'>, length: number, clean: boolean): number {
  return clean ? Math.min(stage.most, length + stage.step) : Math.max(stage.start, length - stage.step);
}

/** Missed numbers in a sitting before the page closes. */
export const SLIPS_PER_SITTING = 3;
/** Questions in a sitting of a peg stage. */
export const DRILL_QUESTIONS = 16;

// ---------------------------------------------------------------- the pegs, drilled

/**
 * A question on the code. 'pick': the ledger shows the figures and the player picks the word
 * (or the sound) from four; 'key': the ledger shows the word (or the sound) and the player
 * keys its figures, producing the answer outright.
 */
export interface DrillQuestion {
  kind: 'pick' | 'key';
  /** The number asked about (0–9 for the sounds, 0–99 for the pegs). */
  item: number;
  /** 'pick': four numbers in the order shown, one of them `item`. */
  choices: number[];
}

export const CHOICES = 4;

export const cardId = (stage: Pick<LedgerStage, 'kind'>, item: number) => (stage.kind === 'sounds' ? `ledger:sound:${item}` : `ledger:peg:${pair(item)}`);

export function itemsOf(stage: Pick<LedgerStage, 'from' | 'to'>): number[] {
  return Array.from({ length: stage.to - stage.from + 1 }, (_, i) => stage.from + i);
}

/** The words for a question's item: the peg word, or the sound. */
export function wordFor(stage: Pick<LedgerStage, 'kind'>, item: number): string {
  return stage.kind === 'sounds' ? SOUNDS[item]! : PEGS[item]!;
}

/** The figures for an item as the player keys them: one for a sound, two for a peg. */
export function figuresFor(stage: Pick<LedgerStage, 'kind'>, item: number): number[] {
  return stage.kind === 'sounds' ? [item] : [Math.floor(item / 10), item % 10];
}

/**
 * Three decoys for `item`, from the stage's own items. For pegs, a decoy sharing a figure
 * makes the choice turn on the sound rather than the look of the word.
 */
export function makeChoices(stage: Pick<LedgerStage, 'from' | 'to' | 'kind'>, item: number, rng: Rng): number[] {
  const pool = itemsOf(stage).filter((n) => n !== item);
  const near = stage.kind === 'pegs' ? pool.filter((n) => Math.floor(n / 10) === Math.floor(item / 10) || n % 10 === item % 10) : [];
  const picks: number[] = [];
  const draw = (from: number[]) => {
    const left = from.filter((n) => !picks.includes(n));
    if (left.length) picks.push(left[Math.min(left.length - 1, Math.floor(rng() * left.length))]!);
  };
  if (near.length) draw(near);
  while (picks.length < CHOICES - 1 && picks.length < pool.length) draw(pool);
  const at = Math.min(picks.length, Math.floor(rng() * (picks.length + 1)));
  picks.splice(at, 0, item);
  return picks;
}

/**
 * The next question: the deck picks the item (missed and due first, then new ones in order,
 * never the one just asked); 'pick' and 'key' take turns, so every item is produced as well
 * as recognised.
 */
export function nextQuestion(stage: LedgerStage, deck: Deck, asked: number, now: number, rng: Rng, avoid?: number): DrillQuestion {
  const items = itemsOf(stage);
  const ids = items.map((n) => cardId(stage, n));
  const id = pickNext(deck, ids, now, rng, avoid === undefined ? undefined : cardId(stage, avoid));
  const item = items[Math.max(0, ids.indexOf(id ?? ids[0]!))]!;
  const kind = asked % 2 === 0 ? 'pick' : 'key';
  return { kind, item, choices: kind === 'pick' ? makeChoices(stage, item, rng) : [] };
}

/** Grade one answer into the deck. */
export function recordAnswer(deck: Deck, id: string, correct: boolean, ms: number, now: number): Deck {
  const card: Card = deck[id] ?? newCard(id, now);
  return { ...deck, [id]: review(card, gradeFromResponse(correct, ms), now, correct ? ms : 0) };
}

/** An item is known once its card is far enough along (as for a face in Faces). */
export const KNOWN = 0.6;
export const isKnown = (card: Card | undefined) => mastery(card) >= KNOWN;

// ---------------------------------------------------------------- the record

/** Saved progress: the longest clean number per span stage, numbers attempted, and the pegs' deck. */
export interface LedgerRecord {
  best: Record<string, number>;
  rounds: Record<string, number>;
  deck: Deck;
}

export function emptyRecord(): LedgerRecord {
  return { best: {}, rounds: {}, deck: {} };
}

export interface LedgerProgress {
  /** Span: best clean length; drill: items known. */
  have: number;
  /** Span: the length that masters it; drill: the items in the stage. */
  need: number;
  /** 0–1. */
  toward: number;
  mastered: boolean;
}

export function ledgerProgress(stage: LedgerStage, rec: LedgerRecord): LedgerProgress {
  if (stage.kind === 'span') {
    const best = rec.best[stage.id] ?? 0;
    return { have: best, need: stage.mastery, toward: Math.min(1, best / stage.mastery), mastered: best >= stage.mastery };
  }
  const items = itemsOf(stage);
  const known = items.filter((n) => isKnown(rec.deck[cardId(stage, n)])).length;
  return { have: known, need: items.length, toward: known / items.length, mastered: known === items.length };
}

/** Record a number keyed back (or slipped on). `crossed` says it carried the stage over its bar. */
export function recordLine(rec: LedgerRecord, stage: LedgerStage, length: number, clean: boolean): { record: LedgerRecord; crossed: boolean; newBest: boolean } {
  const before = rec.best[stage.id] ?? 0;
  const best = clean ? Math.max(before, length) : before;
  const record: LedgerRecord = {
    ...rec,
    best: { ...rec.best, [stage.id]: best },
    rounds: { ...rec.rounds, [stage.id]: (rec.rounds[stage.id] ?? 0) + 1 },
  };
  return { record, crossed: before < stage.mastery && best >= stage.mastery, newBest: best > before };
}

/** Stages over the mastery bar, of all of Ledger's stages. */
export function ledgerMastered(rec: LedgerRecord): number {
  return LEDGER_STAGES.filter((s) => ledgerProgress(s, rec).mastered).length;
}

/** The longest number held clean in any span stage. */
export function longestHeld(rec: LedgerRecord): number {
  return LEDGER_STAGES.filter((s) => s.kind === 'span').reduce((m, s) => Math.max(m, rec.best[s.id] ?? 0), 0);
}

/** Parse a saved record; anything malformed falls back to nothing recorded. */
export function parseRecord(raw: unknown): LedgerRecord {
  const rec = emptyRecord();
  if (typeof raw !== 'object' || raw === null) return rec;
  const r = raw as Record<string, unknown>;
  for (const k of ['best', 'rounds'] as const) {
    const m = r[k];
    if (typeof m !== 'object' || m === null) continue;
    for (const [id, v] of Object.entries(m as Record<string, unknown>)) {
      if (LEDGER_STAGES.some((s) => s.id === id && s.kind === 'span') && typeof v === 'number' && Number.isFinite(v) && v >= 0) rec[k][id] = Math.floor(v);
    }
  }
  if (typeof r.deck === 'object' && r.deck !== null) {
    for (const [id, c] of Object.entries(r.deck as Record<string, unknown>)) {
      if (id.startsWith('ledger:') && isCard(c) && c.id === id) rec.deck[id] = c;
    }
  }
  return rec;
}
