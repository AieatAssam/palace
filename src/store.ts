import { create } from 'zustand';
import { haptic, knock, pluck, setSoundEnabled, unlockAudio } from './audio/engine';
import { type DrillKind, type Question, makeQuestion } from './game/drills';
import { type NoteName, type Position, samePosition } from './game/notes';
import { type Deck, ensureCards, gradeFromResponse, review } from './game/srs';
import { type SavedState, type Settings, emptyState, loadState, saveState } from './game/storage';
import { type UnlockStage, isUnlocked, stageAt, stageProgress, unlockedStageIndex } from './game/unlocks';

export type Feedback =
  | { kind: 'correct'; at: number; chosen?: NoteName }
  | { kind: 'miss'; at: number; chosen?: NoteName; position?: Position };

/** Transient visual events consumed by the 3D scene. */
export interface PluckEvent {
  id: number;
  position: Position;
  at: number;
  /** Idle shimmer (attract): the string sings, no cell lights up. */
  quiet?: boolean;
}
export interface MissEvent {
  id: number;
  position: Position;
  at: number;
}

export interface SessionStats {
  answered: number;
  correct: number;
  streak: number;
  /** Longest run of correct answers this session. */
  best: number;
  /** Distinct items whose review interval grew / fell back this session. */
  strengthened: string[];
  slipped: string[];
  /** Title of a stage opened during this session, if any. */
  opened: string | null;
}

/**
 * Where the player is. The 3D desk is always behind; screens are ink over it.
 * attract → (primer, first visit) → play → session sheet → play | attract.
 */
export type Screen = 'attract' | 'primer' | 'play' | 'session';

/** Answers per sitting before the session sheet closes the page. */
export const SESSION_LENGTH = 10;

function emptySession(): SessionStats {
  return { answered: 0, correct: 0, streak: 0, best: 0, strengthened: [], slipped: [], opened: null };
}

function addOnce(list: string[], id: string) {
  return list.includes(id) ? list : [...list, id];
}

interface PalaceState {
  saved: SavedState;
  screen: Screen;
  drill: DrillKind;
  question: Question;
  askedAt: number;
  feedback: Feedback | null;
  /** Find-all: targets already found; misses this question. */
  found: Position[];
  findMisses: number;
  lastPluck: PluckEvent | null;
  lastMiss: MissEvent | null;
  session: SessionStats;
  /** True while waiting to advance to the next question. */
  locked: boolean;

  stage(): UnlockStage;
  setDrill(kind: DrillKind): void;
  answerName(note: NoteName): void;
  tapPosition(p: Position): void;
  nextQuestion(): void;
  /** Attract → primer (first visit) or play. */
  begin(): void;
  /** Primer finished or skipped: remember it, then play. */
  completePrimer(): void;
  replayPrimer(): void;
  /** Close the page: the session sheet. */
  endSession(): void;
  /** Session sheet → a fresh sitting. */
  again(): void;
  /** Session sheet → back to the title. */
  leave(): void;
  /** Idle string shimmer, silent and ungraded. */
  shimmer(p: Position): void;
  updateSettings(patch: Partial<Settings>): void;
  resetProgress(): void;
}

const CORRECT_DELAY = 700;
const MISS_DELAY = 1500;
const FIND_DONE_DELAY = 900;

let eventId = 0;
let advanceTimer: ReturnType<typeof setTimeout> | undefined;

function now() {
  return Date.now();
}

function persist(saved: SavedState) {
  saveState(saved);
}

export const usePalace = create<PalaceState>()((set, get) => {
  const initial = loadState();
  setSoundEnabled(initial.settings.sound);
  const firstQuestion = makeQuestion('name', stageAt(initial.stage), initial.deck, now());

  /** After feedback: the next question, or the session sheet once the sitting is full. */
  const scheduleNext = (ms: number) => {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => {
      if (get().session.answered >= SESSION_LENGTH) get().endSession();
      else get().nextQuestion();
    }, ms);
  };

  const buzz = (ms: number) => {
    if (get().saved.settings.haptics) haptic(ms);
  };

  /** Record a review and handle stage unlocks. */
  const grade = (itemId: string, correct: boolean, ms: number) => {
    const { saved } = get();
    const t = now();
    let deck: Deck = ensureCards(saved.deck, [itemId], t);
    const before = deck[itemId]!;
    const after = review(before, gradeFromResponse(correct, ms), t, ms);
    deck = { ...deck, [itemId]: after };
    const stage = unlockedStageIndex(deck, saved.stage);
    const next: SavedState = { ...saved, deck, stage };
    persist(next);
    const s = get().session;
    const streak = correct ? s.streak + 1 : 0;
    set({
      saved: next,
      session: {
        answered: s.answered + 1,
        correct: s.correct + (correct ? 1 : 0),
        streak,
        best: Math.max(s.best, streak),
        strengthened: after.interval > before.interval ? addOnce(s.strengthened, itemId) : s.strengthened,
        slipped: !correct ? addOnce(s.slipped, itemId) : s.slipped,
        opened: stage > saved.stage ? stageAt(stage).title : s.opened,
      },
    });
  };

  /** Enter play: keep a question nobody has touched yet (restarting its clock), otherwise draw the next. */
  const startPlay = () => {
    const { locked, feedback, found } = get();
    set({ screen: 'play', session: emptySession() });
    if (locked || feedback || found.length) get().nextQuestion();
    else set({ askedAt: now() });
  };

  const emitPluck = (position: Position) => {
    set({ lastPluck: { id: ++eventId, position, at: performance.now() } });
    pluck(position);
  };
  const emitMiss = (position: Position) => {
    set({ lastMiss: { id: ++eventId, position, at: performance.now() } });
    knock();
  };

  return {
    saved: initial,
    screen: 'attract',
    drill: 'name',
    question: firstQuestion,
    askedAt: now(),
    feedback: null,
    found: [],
    findMisses: 0,
    lastPluck: null,
    lastMiss: null,
    session: emptySession(),
    locked: false,

    stage: () => stageAt(get().saved.stage),

    setDrill(kind) {
      if (kind === get().drill) return;
      clearTimeout(advanceTimer);
      set({ drill: kind });
      get().nextQuestion();
    },

    nextQuestion() {
      clearTimeout(advanceTimer);
      const { drill, saved, question } = get();
      const avoid = question.kind === drill ? question.itemId : undefined;
      set({
        question: makeQuestion(drill, stageAt(saved.stage), saved.deck, now(), Math.random, avoid),
        askedAt: now(),
        feedback: null,
        found: [],
        findMisses: 0,
        locked: false,
      });
    },

    answerName(note) {
      const { question, locked, askedAt, screen } = get();
      if (question.kind !== 'name' || locked || screen !== 'play') return;
      unlockAudio();
      const correct = note === question.answer;
      const ms = now() - askedAt;
      grade(question.itemId, correct, ms);
      if (correct) {
        emitPluck(question.position);
        buzz(10);
        set({ feedback: { kind: 'correct', at: now(), chosen: note }, locked: true });
        scheduleNext(CORRECT_DELAY);
      } else {
        emitMiss(question.position);
        set({ feedback: { kind: 'miss', at: now(), chosen: note, position: question.position }, locked: true });
        scheduleNext(MISS_DELAY);
      }
    },

    tapPosition(p) {
      unlockAudio();
      const { question, locked, found, saved, screen } = get();
      if (!isUnlocked(stageAt(saved.stage), p)) return;
      if (screen !== 'play' || question.kind === 'name') {
        // Exploring the neck in Name-it: let it ring quietly, no grading.
        if (!locked) {
          set({ lastPluck: { id: ++eventId, position: p, at: performance.now() } });
          pluck(p, 0.45);
        }
        return;
      }
      if (locked) return;
      if (found.some((f) => samePosition(f, p))) return;
      const isTarget = question.targets.some((t) => samePosition(t, p));
      if (!isTarget) {
        emitMiss(p);
        set({ findMisses: get().findMisses + 1, feedback: { kind: 'miss', at: now(), position: p } });
        return;
      }
      emitPluck(p);
      buzz(8);
      const nextFound = [...found, p];
      set({ found: nextFound, feedback: null });
      if (nextFound.length === question.targets.length) {
        const ms = (now() - get().askedAt) / question.targets.length;
        grade(question.itemId, get().findMisses === 0, ms);
        set({ feedback: { kind: get().findMisses === 0 ? 'correct' : 'miss', at: now() }, locked: true });
        scheduleNext(FIND_DONE_DELAY);
      }
    },

    begin() {
      unlockAudio();
      if (!get().saved.onboarded) set({ screen: 'primer' });
      else startPlay();
    },

    completePrimer() {
      const saved = { ...get().saved, onboarded: true };
      persist(saved);
      set({ saved });
      startPlay();
    },

    replayPrimer() {
      clearTimeout(advanceTimer);
      set({ screen: 'primer' });
    },

    endSession() {
      clearTimeout(advanceTimer);
      set({ screen: 'session', locked: true });
    },

    again() {
      startPlay();
    },

    leave() {
      clearTimeout(advanceTimer);
      set({ screen: 'attract', session: emptySession(), feedback: null, found: [], locked: false });
    },

    shimmer(p) {
      set({ lastPluck: { id: ++eventId, position: p, at: performance.now(), quiet: true } });
    },

    updateSettings(patch) {
      if (patch.sound !== undefined) setSoundEnabled(patch.sound);
      const saved = { ...get().saved, settings: { ...get().saved.settings, ...patch } };
      persist(saved);
      set({ saved });
    },

    resetProgress() {
      const { settings } = get().saved;
      const saved: SavedState = { ...emptyState(), settings, onboarded: true };
      persist(saved);
      set({ saved, session: emptySession() });
      get().nextQuestion();
    },
  };
});

export function useSettings(): Settings {
  return usePalace((s) => s.saved.settings);
}

export function currentStageProgress() {
  const { saved } = usePalace.getState();
  return stageProgress(stageAt(saved.stage), saved.deck);
}

/** Positions the current question wants highlighted / accepted. */
export function questionAnswerPositions(q: Question): Position[] {
  return q.kind === 'name' ? [q.position] : q.targets;
}

