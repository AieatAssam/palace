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
}

interface PalaceState {
  saved: SavedState;
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
  /** Set when a new stage unlocks, for a quiet toast. */
  unlockedNotice: string | null;
  /** True while waiting to advance to the next question. */
  locked: boolean;

  stage(): UnlockStage;
  setDrill(kind: DrillKind): void;
  answerName(note: NoteName): void;
  tapPosition(p: Position): void;
  nextQuestion(): void;
  setLeftHanded(on: boolean): void;
  setSound(on: boolean): void;
  completeOnboarding(): void;
  dismissNotice(): void;
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

  const scheduleNext = (ms: number) => {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => get().nextQuestion(), ms);
  };

  /** Record a review and handle stage unlocks. */
  const grade = (itemId: string, correct: boolean, ms: number) => {
    const { saved } = get();
    const t = now();
    let deck: Deck = ensureCards(saved.deck, [itemId], t);
    deck = { ...deck, [itemId]: review(deck[itemId]!, gradeFromResponse(correct, ms), t, ms) };
    const stage = unlockedStageIndex(deck, saved.stage);
    const next: SavedState = { ...saved, deck, stage };
    persist(next);
    const s = get().session;
    set({
      saved: next,
      session: {
        answered: s.answered + 1,
        correct: s.correct + (correct ? 1 : 0),
        streak: correct ? s.streak + 1 : 0,
      },
      unlockedNotice: stage > saved.stage ? stageAt(stage).title : get().unlockedNotice,
    });
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
    drill: 'name',
    question: firstQuestion,
    askedAt: now(),
    feedback: null,
    found: [],
    findMisses: 0,
    lastPluck: null,
    lastMiss: null,
    session: { answered: 0, correct: 0, streak: 0 },
    unlockedNotice: null,
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
      const { question, locked, askedAt } = get();
      if (question.kind !== 'name' || locked) return;
      unlockAudio();
      const correct = note === question.answer;
      const ms = now() - askedAt;
      grade(question.itemId, correct, ms);
      if (correct) {
        emitPluck(question.position);
        haptic(10);
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
      const { question, locked, found, saved } = get();
      if (!isUnlocked(stageAt(saved.stage), p)) return;
      if (question.kind === 'name') {
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
      haptic(8);
      const nextFound = [...found, p];
      set({ found: nextFound, feedback: null });
      if (nextFound.length === question.targets.length) {
        const ms = (now() - get().askedAt) / question.targets.length;
        grade(question.itemId, get().findMisses === 0, ms);
        set({ feedback: { kind: get().findMisses === 0 ? 'correct' : 'miss', at: now() }, locked: true });
        scheduleNext(FIND_DONE_DELAY);
      }
    },

    setLeftHanded(on) {
      const saved = { ...get().saved, settings: { ...get().saved.settings, leftHanded: on } };
      persist(saved);
      set({ saved });
    },

    setSound(on) {
      setSoundEnabled(on);
      const saved = { ...get().saved, settings: { ...get().saved.settings, sound: on } };
      persist(saved);
      set({ saved });
    },

    completeOnboarding() {
      const saved = { ...get().saved, onboarded: true };
      persist(saved);
      set({ saved, askedAt: now() });
    },

    dismissNotice() {
      set({ unlockedNotice: null });
    },

    resetProgress() {
      const { settings } = get().saved;
      const saved: SavedState = { ...emptyState(), settings, onboarded: true };
      persist(saved);
      set({ saved, session: { answered: 0, correct: 0, streak: 0 } });
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

