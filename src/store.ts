import { create } from 'zustand';
import { haptic, knock, pluck, setSoundEnabled, unlockAudio } from './audio/engine';
import { type Question, makeQuestion } from './game/drills';
import { type NoteName, type Position, samePosition } from './game/notes';
import { type Deck, ensureCards, gradeFromResponse, review } from './game/srs';
import { type SavedState, type Settings, emptyState, loadState, saveState } from './game/storage';
import { type Stage, inRegion, stageById, stageLabel, stageProgress } from './game/stages';
import { type ModeId, modeInfo } from './modes/catalog';
import { useRewards } from './rewards/store';

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
  /** Stage ids that crossed the mastery bar this session. */
  mastered: string[];
}

/**
 * Where the player is. The 3D desk is always behind; screens are ink over it.
 * attract → (primer, first visit) → hub → (a room's stage card) → play → session sheet → play | hub.
 */
export type Screen = 'attract' | 'primer' | 'hub' | 'play' | 'session';

/** Answers per sitting before the session sheet closes the page. */
export const SESSION_LENGTH = 10;

function emptySession(): SessionStats {
  return { answered: 0, correct: 0, streak: 0, best: 0, strengthened: [], slipped: [], mastered: [] };
}

function addOnce(list: string[], id: string) {
  return list.includes(id) ? list : [...list, id];
}

interface PalaceState {
  saved: SavedState;
  screen: Screen;
  /** The stage card is open on the desk (over play, or over the hub). */
  stagesOpen: boolean;
  /** The hub's card for a room still in the workshop. */
  workshop: ModeId | null;
  question: Question;
  askedAt: number;
  feedback: Feedback | null;
  /** Find-all and octaves: targets already found; misses this question. */
  found: Position[];
  findMisses: number;
  lastPluck: PluckEvent | null;
  lastMiss: MissEvent | null;
  session: SessionStats;
  /** True while waiting to advance to the next question. */
  locked: boolean;

  stage(): Stage;
  /** Put a stage on the desk. Every stage is open. */
  chooseStage(id: string): void;
  openStages(): void;
  closeStages(): void;
  /** Hub: a built room opens its stage card; a workshop room its placeholder card. */
  openRoom(id: ModeId): void;
  closeWorkshop(): void;
  /** Back to the hub from play. */
  toHub(): void;
  /** Walk into a room's play (rooms other than the Fretboard keep their own stage and sitting). */
  enterRoom(id: ModeId): void;
  answerName(note: NoteName): void;
  tapPosition(p: Position): void;
  nextQuestion(): void;
  /** Attract → primer (first visit) or the hub. */
  begin(): void;
  /** Primer finished or skipped: remember it, then the hub. */
  completePrimer(): void;
  replayPrimer(): void;
  /** Close the page: the session sheet. */
  endSession(): void;
  /** Session sheet → a fresh sitting. */
  again(): void;
  /** Session sheet → back to the hub. */
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
/** Rooms with their own saved progress clear it here when the player clears everything. */
const resetHooks: (() => void)[] = [];
export function onResetProgress(fn: () => void) {
  resetHooks.push(fn);
}
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
  const firstQuestion = makeQuestion(stageById(initial.stageId), initial.deck, now());

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

  /** Record a review; note the stage if this answer carried it over the mastery bar. */
  const grade = (itemId: string, correct: boolean, ms: number) => {
    const { saved } = get();
    const t = now();
    let deck: Deck = ensureCards(saved.deck, [itemId], t);
    const before = deck[itemId]!;
    const after = review(before, gradeFromResponse(correct, ms), t, ms);
    deck = { ...deck, [itemId]: after };
    const stage = stageById(saved.stageId);
    const crossed = !stageProgress(stage, saved.deck).mastered && stageProgress(stage, deck).mastered;
    const next: SavedState = { ...saved, deck };
    persist(next);
    // Shared rewards: the run, flourishes and the daily record; a wax seal for a stage just mastered.
    const rewards = useRewards.getState();
    if (rewards.answer(correct)) buzz(24);
    if (crossed) rewards.mastered(stageLabel(stage));
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
        mastered: crossed ? addOnce(s.mastered, stage.id) : s.mastered,
      },
    });
  };

  /** Enter play: keep a question nobody has touched yet (restarting its clock), otherwise draw the next. */
  const startPlay = () => {
    const { locked, feedback, found } = get();
    useRewards.getState().startRun();
    set({ screen: 'play', stagesOpen: false, workshop: null, session: emptySession() });
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
    stagesOpen: false,
    workshop: null,
    question: firstQuestion,
    askedAt: now(),
    feedback: null,
    found: [],
    findMisses: 0,
    lastPluck: null,
    lastMiss: null,
    session: emptySession(),
    locked: false,

    stage: () => stageById(get().saved.stageId),

    chooseStage(id) {
      const stage = stageById(id);
      clearTimeout(advanceTimer);
      const same = stage.id === get().saved.stageId;
      const saved = { ...get().saved, stageId: stage.id, modeId: 'fretboard' as const };
      persist(saved);
      set({ saved, stagesOpen: false, lastMiss: null });
      // From the hub, choosing a stage walks into the room; the stage left on the desk keeps its untouched question.
      if (get().screen === 'hub') {
        if (!same) get().nextQuestion();
        startPlay();
      } else get().nextQuestion();
    },

    openStages() {
      clearTimeout(advanceTimer);
      set({ stagesOpen: true });
    },

    closeStages() {
      set({ stagesOpen: false });
      // A question answered just before the card opened still needs its successor.
      if (get().screen === 'play' && get().locked && get().saved.modeId === 'fretboard') scheduleNext(200);
    },

    openRoom(id) {
      if (get().screen !== 'hub') return;
      if (!modeInfo(id).open) return set({ workshop: id, stagesOpen: false });
      // The room's furniture comes onto the desk behind its stage card.
      const saved = { ...get().saved, modeId: id };
      persist(saved);
      set({ saved, stagesOpen: true, workshop: null });
    },

    closeWorkshop() {
      set({ workshop: null });
    },

    toHub() {
      clearTimeout(advanceTimer);
      useRewards.getState().refreshDay();
      set({ screen: 'hub', stagesOpen: false, workshop: null, session: emptySession(), feedback: null, found: [], locked: false });
    },

    enterRoom(id) {
      clearTimeout(advanceTimer);
      const saved = { ...get().saved, modeId: id };
      persist(saved);
      useRewards.getState().startRun();
      set({ saved, screen: 'play', stagesOpen: false, workshop: null, session: emptySession(), feedback: null, found: [], locked: false });
    },

    nextQuestion() {
      clearTimeout(advanceTimer);
      const { saved, question } = get();
      const stage = stageById(saved.stageId);
      const avoid = question.kind === stage.drill ? question.itemId : undefined;
      set({
        question: makeQuestion(stage, saved.deck, now(), Math.random, avoid),
        askedAt: now(),
        feedback: null,
        found: [],
        findMisses: 0,
        locked: false,
      });
    },

    answerName(note) {
      const { question, locked, askedAt, screen, stagesOpen } = get();
      if (question.kind !== 'name' || locked || screen !== 'play' || stagesOpen) return;
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
      const { question, locked, found, saved, screen, stagesOpen } = get();
      if (!inRegion(stageById(saved.stageId), p) || stagesOpen) return;
      // Octaves: the lit note itself only rings.
      const isSource = question.kind === 'octave' && samePosition(question.position, p);
      if (screen !== 'play' || question.kind === 'name' || isSource) {
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
      else get().toHub();
    },

    completePrimer() {
      const saved = { ...get().saved, onboarded: true };
      persist(saved);
      set({ saved });
      get().toHub();
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
      get().toHub();
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
      const saved: SavedState = { ...emptyState(), settings, onboarded: true, stageId: get().saved.stageId };
      persist(saved);
      set({ saved, session: emptySession() });
      for (const fn of resetHooks) fn();
      get().nextQuestion();
    },
  };
});

export function useSettings(): Settings {
  return usePalace((s) => s.saved.settings);
}
