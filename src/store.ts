import { create } from 'zustand';
import { haptic, knock, pluck, setSoundEnabled, unlockAudio } from './audio/engine';
import { type Question, makeQuestion } from './game/drills';
import { type MelodyNote, fingering, soundsNote } from './game/melodies';
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
/** Tunes per sitting in the Melodies book. */
export const MELODY_SESSION_LENGTH = 3;

/**
 * A melody under way. `preview`: the room plays it through first (from memory stages);
 * `play`: the player's turn, note `at` is wanted next; `playback`: the finished tune
 * played back on the places the player chose; `done`: graded, the next tune is coming.
 */
export type MelodyPhase = 'preview' | 'play' | 'playback' | 'done';
export interface MelodyRun {
  phase: MelodyPhase;
  /** Notes played so far (the index of the one wanted next). */
  at: number;
  /** Wrong notes so far. */
  misses: number;
  /** Where each note was played. */
  played: Position[];
  /** The note sounding in a preview or playback (index into the notes), or -1. */
  sounding: number;
}

/** Wrong notes a tune can take and still count as played clean: one in eight. */
export function melodyAllowance(length: number): number {
  return Math.floor(length / 8);
}

function freshRun(q: Question): MelodyRun {
  return { phase: q.kind === 'melody' && q.recall ? 'preview' : 'play', at: 0, misses: 0, played: [], sounding: -1 };
}

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
  /** The melody under way (meaningful while the question is a melody). */
  melody: MelodyRun;

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
  /** A melody: hear it played through (not on a from-memory stage once the preview is over). */
  hearMelody(): void;
  /** A melody: cut the preview short and start playing. */
  endMelodyPreview(): void;
  /** A melody: cut the playback short; the tune is graded at once. */
  endMelodyPlayback(): void;
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
/** A tune being played by the room (preview or playback): its pending notes, and what to do at the end. */
let tuneTimers: ReturnType<typeof setTimeout>[] = [];
let tuneDone: (() => void) | null = null;

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
      const length = get().stage().drill === 'melody' ? MELODY_SESSION_LENGTH : SESSION_LENGTH;
      if (get().session.answered >= length) get().endSession();
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

  /**
   * Stop the tune the room is playing. A playback cut short still counts: its grading runs now.
   */
  const stopTune = () => {
    for (const t of tuneTimers) clearTimeout(t);
    tuneTimers = [];
    const done = tuneDone;
    tuneDone = null;
    if (get().melody.sounding !== -1) set({ melody: { ...get().melody, sounding: -1 } });
    done?.();
  };

  /**
   * The room plays `notes` on `places` at `tempo`, lighting each as it sounds, then calls `then`.
   * Notes shorter than a beat are still given room to speak (a quaver is never under 180 ms).
   */
  const playTune = (notes: readonly MelodyNote[], places: readonly Position[], tempo: number, lead: number, then: () => void) => {
    stopTune();
    const beat = 60000 / tempo;
    let t = lead;
    notes.forEach((n, i) => {
      const at = t;
      tuneTimers.push(
        setTimeout(() => {
          set({ melody: { ...get().melody, sounding: i }, lastPluck: { id: ++eventId, position: places[i]!, at: performance.now() } });
          pluck(places[i]!, 0.7);
        }, at),
      );
      t += Math.max(180, n.beats * beat);
    });
    tuneDone = () => {
      set({ melody: { ...get().melody, sounding: -1 } });
      then();
    };
    tuneTimers.push(setTimeout(() => stopTune(), t + 250));
  };

  /** A from-memory tune: the room plays it once with the card showing, then the player's turn. */
  const startPreview = () => {
    const q = get().question;
    if (q.kind !== 'melody') return;
    const places = fingering(q.notes, stageById(get().saved.stageId));
    set({ melody: { ...freshRun(q), phase: 'preview' } });
    playTune(q.notes, places, q.tempo, 400, () => {
      set({ melody: { ...get().melody, phase: 'play', sounding: -1 }, askedAt: now() });
    });
  };

  /** A melody note played: the right note anywhere in reach moves on; any other is a soft miss, try again. */
  const playMelodyNote = (p: Position) => {
    const { question: q, melody: run, locked, askedAt } = get();
    if (q.kind !== 'melody' || locked || run.phase !== 'play') return;
    const want = q.notes[run.at];
    if (!want) return;
    if (!soundsNote(p, want.midi)) {
      emitMiss(p);
      set({ melody: { ...run, misses: run.misses + 1 }, feedback: { kind: 'miss', at: now(), position: p } });
      return;
    }
    emitPluck(p);
    buzz(8);
    const played = [...run.played, p];
    const at = run.at + 1;
    if (at < q.notes.length) {
      set({ melody: { ...run, at, played }, found: [p], feedback: null });
      return;
    }
    // The tune is whole: hear it back on the player's own places, then grade it.
    const clean = run.misses <= melodyAllowance(q.notes.length);
    const ms = (now() - askedAt) / q.notes.length;
    set({ melody: { ...run, at, played, phase: 'playback' }, found: [], feedback: null, locked: true });
    playTune(q.notes, played, q.tempo, 600, () => {
      grade(q.itemId, clean, ms);
      if (clean) buzz(10);
      set({ melody: { ...get().melody, phase: 'done' }, feedback: { kind: clean ? 'correct' : 'miss', at: now() } });
      // With the stage card open, closing it moves on (as for any answered question).
      if (!get().stagesOpen) scheduleNext(FIND_DONE_DELAY);
    });
  };

  /** Enter play: keep a question nobody has touched yet (restarting its clock), otherwise draw the next. */
  const startPlay = () => {
    const { locked, feedback, found, question } = get();
    useRewards.getState().startRun();
    set({ screen: 'play', stagesOpen: false, workshop: null, session: emptySession() });
    // A melody always starts afresh (a from-memory tune needs its hearing).
    if (locked || feedback || found.length || question.kind === 'melody') get().nextQuestion();
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
    melody: freshRun(firstQuestion),

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
      // A tune still playing back moves on by itself when it ends.
      if (get().screen === 'play' && get().locked && get().saved.modeId === 'fretboard' && get().melody.phase !== 'playback') scheduleNext(200);
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
      // A playback cut short is graded first; then nothing pending may advance.
      stopTune();
      clearTimeout(advanceTimer);
      useRewards.getState().refreshDay();
      set({ screen: 'hub', stagesOpen: false, workshop: null, session: emptySession(), feedback: null, found: [], locked: false });
    },

    enterRoom(id) {
      stopTune();
      clearTimeout(advanceTimer);
      const saved = { ...get().saved, modeId: id };
      persist(saved);
      useRewards.getState().startRun();
      set({ saved, screen: 'play', stagesOpen: false, workshop: null, session: emptySession(), feedback: null, found: [], locked: false });
    },

    nextQuestion() {
      stopTune();
      clearTimeout(advanceTimer);
      const { saved, question } = get();
      const stage = stageById(saved.stageId);
      const avoid = question.kind === stage.drill ? question.itemId : undefined;
      const next = makeQuestion(stage, saved.deck, now(), Math.random, avoid);
      set({
        question: next,
        askedAt: now(),
        feedback: null,
        found: [],
        findMisses: 0,
        locked: false,
        melody: freshRun(next),
      });
      if (next.kind === 'melody' && next.recall && get().screen === 'play') startPreview();
    },

    hearMelody() {
      const { question: q, melody: run, screen, locked } = get();
      if (q.kind !== 'melody' || screen !== 'play' || locked || q.recall || run.phase !== 'play') return;
      unlockAudio();
      // From the next note wanted to the end, on the usual places; then back to the player.
      const places = fingering(q.notes, stageById(get().saved.stageId));
      set({ melody: { ...run, phase: 'preview' } });
      playTune(q.notes, places, q.tempo, 150, () => set({ melody: { ...get().melody, phase: 'play', sounding: -1 } }));
    },

    endMelodyPreview() {
      if (get().melody.phase === 'preview') stopTune();
    },

    endMelodyPlayback() {
      if (get().melody.phase === 'playback') stopTune();
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
      if (question.kind === 'melody' && screen === 'play') return playMelodyNote(p);
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
      stopTune();
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
