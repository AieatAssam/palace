/**
 * Faces, the pure part: the stages, each stage's cast, the questions a sitting asks, and the
 * spaced-repetition deck kept per face. Nothing here touches the DOM, timers or storage;
 * callers pass the time and their own random source.
 *
 * A sitting: meet the cast one portrait at a time, then answer questions about them. Three
 * kinds of question: a portrait and four names ("name"), a name and four portraits ("face"),
 * and on the trades stage a portrait and four trades ("trade"). The deck (`game/srs.ts`)
 * decides who is asked next: a face you missed comes back within the sitting.
 */
import { type Card, type Deck, gradeFromResponse, isCard, mastery, pickNext, review } from '../game/srs';
import { type Rng, type Sitter, castSeed, makeCast } from './sitters';

export type QuestionKind = 'name' | 'face' | 'trade';

export interface FacesStage {
  id: string;
  /** Full name, e.g. "Four sitters". */
  title: string;
  /** The stage card's label. */
  short: string;
  /** A few words for the stage card's second line. */
  note: string;
  /** Sitters in the cast. */
  size: 4 | 6 | 8;
  /** The kinds of question asked, in turn. */
  kinds: readonly QuestionKind[];
  /** Seconds between meeting the cast and the first question (0: straight on). */
  delay: number;
  /** Questions in a sitting. */
  questions: number;
}

export const FACES_STAGES: readonly FacesStage[] = [
  { id: 'four', title: 'Four sitters', short: 'Four sitters', note: 'Four portraits, four names', size: 4, kinds: ['name', 'face'], delay: 0, questions: 8 },
  { id: 'eight', title: 'Eight sitters', short: 'Eight sitters', note: 'A fuller gallery', size: 8, kinds: ['name', 'face'], delay: 0, questions: 14 },
  { id: 'trades', title: 'Sitters and trades', short: 'Names and trades', note: 'Four sitters, each with a trade', size: 4, kinds: ['name', 'trade', 'face'], delay: 0, questions: 10 },
  { id: 'delayed', title: 'Sitters, asked later', short: 'Asked later', note: 'Six sitters, then a pause', size: 6, kinds: ['name', 'face'], delay: 30, questions: 10 },
];

export const FIRST_FACES_STAGE = FACES_STAGES[0]!;

export function facesStageById(id: string): FacesStage {
  return FACES_STAGES.find((s) => s.id === id) ?? FIRST_FACES_STAGE;
}

/** A stage's cast: the same sitters, in the same order, on every visit. */
const casts = new Map<string, Sitter[]>();
export function castOf(stage: Pick<FacesStage, 'id' | 'size'>): Sitter[] {
  let c = casts.get(stage.id);
  if (!c) {
    c = makeCast(castSeed(stage.id), stage.size);
    casts.set(stage.id, c);
  }
  return c;
}

/** A face's card id in the deck: the room, the stage and the sitter. */
export const cardId = (stageId: string, sitterId: string) => `faces:${stageId}:${sitterId}`;

export interface Question {
  kind: QuestionKind;
  /** The sitter asked about (an index into the cast). */
  sitter: number;
  /** The choices on offer, as indices into the cast; for "trade", the trades come from these sitters. */
  choices: number[];
}

/** Shuffle a copy (Fisher–Yates). */
function shuffled<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Choices on offer per question. */
export const CHOICES = 4;

/** A question of `kind` about sitter `sitter`: it and three others of the cast, in a random order. */
export function makeQuestion(kind: QuestionKind, sitter: number, castSize: number, rng: Rng): Question {
  const others = shuffled(
    Array.from({ length: castSize }, (_, i) => i).filter((i) => i !== sitter),
    rng,
  ).slice(0, CHOICES - 1);
  return { kind, sitter, choices: shuffled([sitter, ...others], rng) };
}

/** Where the right answer sits among the choices. */
export function answerIndex(q: Question): number {
  return q.choices.indexOf(q.sitter);
}

/**
 * The next question: the deck picks the sitter (missed and due faces first, then faces not
 * yet asked, never the one just asked), and the stage's kinds take turns.
 */
export function nextQuestion(stage: FacesStage, deck: Deck, asked: number, now: number, rng: Rng, avoid?: number): Question {
  const cast = castOf(stage);
  const ids = cast.map((s) => cardId(stage.id, s.id));
  const id = pickNext(deck, ids, now, rng, avoid === undefined ? undefined : ids[avoid]);
  const sitter = Math.max(0, ids.indexOf(id ?? ids[0]!));
  const kind = stage.kinds[asked % stage.kinds.length]!;
  return makeQuestion(kind, sitter, cast.length, rng);
}

/** Grade one answer into the deck. */
export function recordAnswer(deck: Deck, id: string, correct: boolean, ms: number, now: number): Deck {
  const card: Card = deck[id] ?? { id, ease: 2.5, interval: 0, reps: 0, lapses: 0, seen: 0, correct: 0, due: now, last: 0, avgMs: 0 };
  return { ...deck, [id]: review(card, gradeFromResponse(correct, ms), now, correct ? ms : 0) };
}

/** A face is known once its card is far enough along: two right in a row, and mostly right. */
export const KNOWN = 0.6;

export function isKnown(card: Card | undefined): boolean {
  return mastery(card) >= KNOWN;
}

export interface FacesProgress {
  known: number;
  total: number;
  /** 0–1: faces known over the cast. */
  toward: number;
  mastered: boolean;
}

export function facesProgress(stage: FacesStage, deck: Deck): FacesProgress {
  const cast = castOf(stage);
  const known = cast.filter((s) => isKnown(deck[cardId(stage.id, s.id)])).length;
  return { known, total: cast.length, toward: cast.length ? known / cast.length : 0, mastered: known === cast.length && cast.length > 0 };
}

/** Stages with every face known, of all of Faces' stages. */
export function facesMastered(deck: Deck): number {
  return FACES_STAGES.filter((s) => facesProgress(s, deck).mastered).length;
}

/** Parse a saved deck; malformed cards and foreign ids are dropped. */
export function parseDeck(raw: unknown): Deck {
  const out: Deck = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [id, c] of Object.entries(raw as Record<string, unknown>)) {
    if (id.startsWith('faces:') && isCard(c) && c.id === id) out[id] = c;
  }
  return out;
}
