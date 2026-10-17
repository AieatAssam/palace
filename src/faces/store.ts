import { create } from 'zustand';
import { haptic, knock, unlockAudio } from '../audio/engine';
import type { Deck } from '../game/srs';
import { useRewards } from '../rewards/store';
import { onResetProgress, usePalace } from '../store';
import { CAPTURE } from '../three/quality';
import {
  type FacesStage,
  type Question,
  FACES_STAGES,
  FIRST_FACES_STAGE,
  answerIndex,
  cardId,
  castOf,
  facesProgress,
  facesStageById,
  nextQuestion,
  parseDeck,
  recordAnswer,
} from './logic';

/**
 * Faces' state: the sitter being met, the question being asked, the sitting and the saved
 * deck (one spaced-repetition card per face per stage). The palace store owns the screen;
 * this store follows it through `setActive`, which the overlay drives from its `hidden` flag.
 *
 * meet (one portrait at a time, the player turns the page) → pause (the asked-later stage
 * only) → ask → right | wrong → ask … until the sitting's questions are spent.
 */
export const FACES_KEY = 'palace.faces.v1';

export type FacesPhase = 'meet' | 'pause' | 'ask' | 'right' | 'wrong';

export interface FacesSitting {
  asked: number;
  right: number;
  slips: number;
  /** Faces known on the stage when the sitting began. */
  knownBefore: number;
  /** The stage crossed its mastery bar this sitting. */
  mastered: boolean;
}

interface FacesSave {
  stageId: string;
  deck: Deck;
}

interface FacesState extends FacesSave {
  phase: FacesPhase;
  /** The sitter being met (index into the cast). */
  meeting: number;
  question: Question | null;
  /** The choice the player made (index into `question.choices`), during right / wrong. */
  chosen: number;
  /** Epoch ms the pause ends (asked-later stage). */
  pauseEnds: number;
  sitting: FacesSitting;
  active: boolean;
  stage(): FacesStage;
  chooseStage(id: string): void;
  setActive(on: boolean): void;
  /** Meeting: the next sitter (or, after the last, on to the questions). */
  next(): void;
  /** Meeting: the sitter before. */
  back(): void;
  /** Answer with choice `i` (0-based, in the order shown). */
  answer(i: number): void;
  /** End the pause now (for the test hooks). */
  endPause(): void;
  again(): void;
  end(): void;
}

/** Pauses (ms): after a right answer, and after a wrong one (long enough to read the right name). */
const RIGHT_PAUSE = 900;
const WRONG_PAUSE = 2000;

function emptySitting(knownBefore = 0): FacesSitting {
  return { asked: 0, right: 0, slips: 0, knownBefore, mastered: false };
}

function kv(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function parseFacesSave(raw: string | null): FacesSave {
  try {
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const stageId = typeof d.stageId === 'string' && FACES_STAGES.some((s) => s.id === d.stageId) ? d.stageId : FIRST_FACES_STAGE.id;
    return { stageId, deck: parseDeck(d.deck) };
  } catch {
    return { stageId: FIRST_FACES_STAGE.id, deck: {} };
  }
}

function persist(save: FacesSave) {
  try {
    kv()?.setItem(FACES_KEY, JSON.stringify(save));
  } catch {
    // Quota or privacy mode: the deck lives for this visit only.
  }
}

/** `?capture` (stills on a slow software renderer): the room's timeline runs this many times slower. */
const PACE = CAPTURE ? 24 : 1;
let timer: ReturnType<typeof setTimeout> | undefined;
function later(ms: number, fn: () => void) {
  clearTimeout(timer);
  timer = setTimeout(fn, ms * PACE);
}

export const useFaces = create<FacesState>()((set, get) => {
  const initial = (() => {
    try {
      return parseFacesSave(kv()?.getItem(FACES_KEY) ?? null);
    } catch {
      return parseFacesSave(null);
    }
  })();
  const stage = () => facesStageById(get().stageId);
  const buzz = (ms: number) => {
    if (usePalace.getState().saved.settings.haptics) haptic(ms);
  };
  /** When the current question was put (for the deck's grade: quick answers count for more). */
  let askedAt = 0;

  const ask = () => {
    const st = stage();
    const { deck, sitting, question } = get();
    const q = nextQuestion(st, deck, sitting.asked, Date.now(), Math.random, question?.sitter);
    askedAt = performance.now();
    set({ phase: 'ask', question: q, chosen: -1 });
  };

  const startPause = () => {
    const st = stage();
    const ends = Date.now() + st.delay * 1000 * PACE;
    set({ phase: 'pause', pauseEnds: ends, question: null });
    if (get().active) later(st.delay * 1000, ask);
  };

  const resetSitting = () => {
    clearTimeout(timer);
    const st = stage();
    set({ phase: 'meet', meeting: 0, question: null, chosen: -1, pauseEnds: 0, sitting: emptySitting(facesProgress(st, get().deck).known) });
  };

  return {
    ...initial,
    phase: 'meet',
    meeting: 0,
    question: null,
    chosen: -1,
    pauseEnds: 0,
    sitting: emptySitting(facesProgress(facesStageById(initial.stageId), initial.deck).known),
    active: false,

    stage,

    chooseStage(id) {
      const st = facesStageById(id);
      const save = { stageId: st.id, deck: get().deck };
      persist(save);
      set(save);
      resetSitting();
      const palace = usePalace.getState();
      if (palace.screen === 'hub') {
        useFaces.setState({ active: false });
        palace.enterRoom('faces');
      } else palace.closeStages();
    },

    setActive(on) {
      if (on === get().active) return;
      set({ active: on });
      if (!on) {
        clearTimeout(timer);
        // A question in hand is put again on return; a pause keeps its clock.
        const p = get().phase;
        if (p === 'right' || p === 'wrong') {
          if (get().sitting.asked >= stage().questions) return;
          ask();
          set({ active: false });
        }
        return;
      }
      const { phase, pauseEnds, sitting } = get();
      if (sitting.asked >= stage().questions) return usePalace.getState().endSession();
      if (phase === 'pause') later(Math.max(0, (pauseEnds - Date.now()) / PACE), ask);
      if (phase === 'ask') askedAt = performance.now();
    },

    next() {
      unlockAudio();
      const { phase, meeting, active } = get();
      if (!active || phase !== 'meet') return;
      const cast = castOf(stage());
      if (meeting + 1 < cast.length) return set({ meeting: meeting + 1 });
      if (stage().delay > 0) startPause();
      else ask();
    },

    back() {
      const { phase, meeting, active } = get();
      if (!active || phase !== 'meet' || meeting === 0) return;
      set({ meeting: meeting - 1 });
    },

    answer(i) {
      unlockAudio();
      const st = stage();
      const { phase, question, active } = get();
      if (!active || phase !== 'ask' || !question || i < 0 || i >= question.choices.length) return;
      const correct = i === answerIndex(question);
      const cast = castOf(st);
      const id = cardId(st.id, cast[question.sitter]!.id);
      const before = facesProgress(st, get().deck).mastered;
      const deck = recordAnswer(get().deck, id, correct, performance.now() - askedAt, Date.now());
      const after = facesProgress(st, deck).mastered;
      persist({ stageId: st.id, deck });
      const rewards = useRewards.getState();
      const crossed = !before && after;
      if (correct) {
        if (rewards.answer(true)) buzz(24);
        else buzz(8);
      } else {
        rewards.answer(false);
        knock();
        buzz(30);
      }
      if (crossed) rewards.mastered(st.title);
      const s = get().sitting;
      const sitting: FacesSitting = {
        ...s,
        asked: s.asked + 1,
        right: s.right + (correct ? 1 : 0),
        slips: s.slips + (correct ? 0 : 1),
        mastered: s.mastered || crossed,
      };
      set({ deck, sitting, phase: correct ? 'right' : 'wrong', chosen: i });
      later(correct ? RIGHT_PAUSE : WRONG_PAUSE, () => {
        if (sitting.asked >= st.questions) usePalace.getState().endSession();
        else ask();
      });
    },

    endPause() {
      if (get().phase !== 'pause') return;
      clearTimeout(timer);
      ask();
    },

    again() {
      resetSitting();
      set({ active: false });
      usePalace.getState().enterRoom('faces');
    },

    end() {
      clearTimeout(timer);
      usePalace.getState().endSession();
    },
  };
});

onResetProgress(() => {
  const save = { stageId: useFaces.getState().stageId, deck: {} };
  persist(save);
  useFaces.setState(save);
});
