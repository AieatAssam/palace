import { create } from 'zustand';
import { haptic, knock, tapBlock, unlockAudio } from '../audio/engine';
import { DROPS_PER_SITTING, type Span, type SpanOutcome, line as inPlay, spanClean, spanMiss, startSpan } from '../game/span';
import { useRewards } from '../rewards/store';
import { onResetProgress, usePalace } from '../store';
import { CAPTURE } from '../three/quality';
import {
  type DrillQuestion,
  type LedgerRecord,
  type LedgerStage,
  DRILL_QUESTIONS,
  FIRST_LEDGER_STAGE,
  LEDGER_STAGES,
  cardId,
  emptyRecord,
  figuresFor,
  key,
  ledgerProgress,
  ledgerStageById,
  nextQuestion,
  parseRecord,
  recordAnswer,
  recordLine,
  wordFor,
} from './logic';

/**
 * Ledger's state. A span stage: the ledger writes a number (a figure at a time, or all at
 * once to study), the page is blotted, and the player keys it back.
 *
 *   rest → write (figures appear) [→ study (the whole number, until Ready)] → recall
 *        → clean | slip → write … until three drop-backs close the page.
 *
 * The number lasts the whole sitting (`game/span.ts`): a clean one grows by the stage's step,
 * a first miss writes the same number again, a second miss in a row goes back two steps.
 * Only New number or a new sitting draws a fresh one.
 *
 * A peg stage: questions on the Major system, picked by the spaced-repetition deck.
 *
 *   ask → right | wrong → ask … until the sitting's questions are done.
 */
export const LEDGER_KEY = 'palace.ledger.v1';

export type LedgerPhase = 'rest' | 'write' | 'study' | 'recall' | 'clean' | 'slip' | 'ask' | 'right' | 'wrong';

export interface LedgerSitting {
  /** Span: numbers attempted and keyed back clean, the longest, misses and drop-backs (two misses in a row). */
  lines: number;
  clean: number;
  longest: number;
  slips: number;
  drops: number;
  /** Drill: questions asked and answered right. */
  asked: number;
  right: number;
  /** Drill: items known when the sitting began. */
  knownBefore: number;
  mastered: boolean;
  newBest: boolean;
}

/** One line of the sitting's account: what was asked (figures) and what it was (a length, a word), and whether it went right. */
export interface LogEntry {
  figures: string;
  words: string;
  ok: boolean;
}

const LOG_LINES = 7;
const logged = (log: LogEntry[], e: LogEntry) => [...log, e].slice(-LOG_LINES);

interface LedgerSave {
  stageId: string;
  record: LedgerRecord;
}

interface LedgerState extends LedgerSave {
  phase: LedgerPhase;
  /** Span: the sitting's number, already moved on to the next length during a clean or slip pause. */
  span: Span<number>;
  /** Span: the number written. */
  digits: number[];
  /** Span: figures the ledger has written so far (all of them once written). */
  written: number;
  /** Figures keyed right so far (span recall, or a drill 'key' question). */
  done: number;
  /** The figure keyed on a slip, the one that was due, and what happens next ('retry' or 'drop', to `next` figures). */
  slip: { keyed: number; wanted: number; outcome: SpanOutcome; next: number } | null;
  question: DrillQuestion | null;
  /** Drill 'pick': the choice taken (index), or -1. Drill 'key': the wrong figure keyed, or -1. */
  chosen: number;
  sitting: LedgerSitting;
  /** This sitting's entries, newest last, as the left-hand page keeps them. */
  log: LogEntry[];
  active: boolean;
  stage(): LedgerStage;
  chooseStage(id: string): void;
  setActive(on: boolean): void;
  /** A figure keyed, from the keypad or the keyboard. */
  press(digit: number): void;
  /** Study → recall: the player has the number and blots the page. */
  ready(): void;
  /** Drill 'pick': choice `i` taken. */
  pick(i: number): void;
  /** Span: a fresh number at the stage's opening length (the sitting goes on). */
  newNumber(): void;
  again(): void;
  end(): void;
}

const LEAD_IN = 600;
const CLEAN_PAUSE = 900;
const SLIP_PAUSE = 2200;
const RIGHT_PAUSE = 750;
const WRONG_PAUSE = 2200;

function emptySitting(knownBefore = 0): LedgerSitting {
  return { lines: 0, clean: 0, longest: 0, slips: 0, drops: 0, asked: 0, right: 0, knownBefore, mastered: false, newBest: false };
}

function kv(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function parseLedgerSave(raw: string | null): LedgerSave {
  try {
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const stageId = typeof d.stageId === 'string' && LEDGER_STAGES.some((s) => s.id === d.stageId) ? d.stageId : FIRST_LEDGER_STAGE.id;
    return { stageId, record: parseRecord(d.record) };
  } catch {
    return { stageId: FIRST_LEDGER_STAGE.id, record: emptyRecord() };
  }
}

function loadSave(): LedgerSave {
  try {
    return parseLedgerSave(kv()?.getItem(LEDGER_KEY) ?? null);
  } catch {
    return parseLedgerSave(null);
  }
}

function persist(save: LedgerSave) {
  try {
    kv()?.setItem(LEDGER_KEY, JSON.stringify(save));
  } catch {
    // Quota or privacy mode: the record lives for this visit only.
  }
}

/** `?capture`: the room's timeline runs slower for stills on a software renderer. */
const PACE = CAPTURE ? 24 : 1;
let timers: ReturnType<typeof setTimeout>[] = [];
function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}
function later(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms * PACE));
}

/** When the current drill question was put (for the deck's response time). */
let askedAt = 0;

export const useLedger = create<LedgerState>()((set, get) => {
  const initial = loadSave();
  const stage = () => ledgerStageById(get().stageId);
  const buzz = (ms: number) => {
    if (usePalace.getState().saved.settings.haptics) haptic(ms);
  };

  /** The ledger writes the number; a timed stage hands it straight to the player, a studied one waits for Ready. */
  const draw = () => Math.min(9, Math.floor(Math.random() * 10));
  /** A fresh number at the stage's opening length (none for a peg stage). */
  const freshSpan = (st: LedgerStage): Span<number> => (st.kind === 'span' ? startSpan(st, draw) : { items: [], length: 0, misses: 0 });

  const write = (delay: number) => {
    clearTimers();
    const st = stage();
    const n = get().digits.length;
    set({ phase: 'write', written: 0, done: 0, slip: null });
    if (st.tempo > 0) {
      for (let i = 0; i < n; i++) {
        later(delay + i * st.tempo, () => {
          set({ written: i + 1 });
          tapBlock(0, 0.35);
        });
      }
      later(delay + (n - 1) * st.tempo + st.tempo * 0.9, () => set({ phase: 'recall' }));
    } else {
      // The pen runs along the line quickly; then the player studies it as long as they like.
      const stroke = 90;
      for (let i = 0; i < n; i++) later(delay + i * stroke, () => set({ written: i + 1 }));
      later(delay + n * stroke + 120, () => set({ phase: 'study' }));
    }
  };

  const ask = () => {
    clearTimers();
    const st = stage();
    const prev = get().question?.item;
    const question = nextQuestion(st, get().record.deck, get().sitting.asked, Date.now(), Math.random, prev);
    askedAt = performance.now();
    set({ phase: 'ask', question, chosen: -1, done: 0 });
  };

  const begin = (delay: number) => {
    if (stage().kind === 'span') write(delay);
    else later(delay / 2, ask);
  };

  const resetSitting = () => {
    clearTimers();
    const st = stage();
    const span = freshSpan(st);
    set({
      phase: 'rest',
      span,
      digits: inPlay(span),
      written: 0,
      done: 0,
      slip: null,
      question: null,
      chosen: -1,
      sitting: emptySitting(ledgerProgress(st, get().record).have),
      log: [],
    });
  };

  /** A drill answer, right or wrong: into the deck, the rewards and the sitting. */
  const settle = (correct: boolean, chosen: number) => {
    const st = stage();
    const q = get().question!;
    const before = ledgerProgress(st, get().record).mastered;
    const deck = recordAnswer(get().record.deck, cardId(st, q.item), correct, performance.now() - askedAt, Date.now());
    const record = { ...get().record, deck };
    const crossed = !before && ledgerProgress(st, record).mastered;
    persist({ stageId: st.id, record });
    const rewards = useRewards.getState();
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
    const sitting = { ...s, asked: s.asked + 1, right: s.right + (correct ? 1 : 0), mastered: s.mastered || crossed };
    const figures = figuresFor(st, q.item).join('');
    set({ record, sitting, phase: correct ? 'right' : 'wrong', chosen, log: logged(get().log, { figures, words: wordFor(st, q.item), ok: correct }) });
    later(correct ? RIGHT_PAUSE : WRONG_PAUSE, () => {
      if (sitting.asked >= DRILL_QUESTIONS) usePalace.getState().endSession();
      else ask();
    });
  };

  const first = ledgerStageById(initial.stageId);
  const firstSpan = freshSpan(first);
  return {
    ...initial,
    phase: 'rest',
    span: firstSpan,
    digits: inPlay(firstSpan),
    written: 0,
    done: 0,
    slip: null,
    question: null,
    chosen: -1,
    sitting: emptySitting(ledgerProgress(first, initial.record).have),
    log: [],
    active: false,

    stage,

    chooseStage(id) {
      const st = ledgerStageById(id);
      const save = { stageId: st.id, record: get().record };
      persist(save);
      set(save);
      resetSitting();
      const palace = usePalace.getState();
      if (palace.screen === 'hub') {
        useLedger.setState({ active: false });
        palace.enterRoom('ledger');
      } else palace.closeStages();
    },

    setActive(on) {
      if (on === get().active) return;
      set({ active: on });
      if (!on) {
        clearTimers();
        const p = get().phase;
        // A number under way is written again from the start on return; a question in hand is put again.
        if (stage().kind === 'span') set({ phase: 'rest', written: 0, done: 0 });
        else if (p === 'right' || p === 'wrong') set({ phase: 'rest' });
        return;
      }
      const { sitting, phase } = get();
      if (stage().kind === 'span' ? sitting.drops >= DROPS_PER_SITTING : sitting.asked >= DRILL_QUESTIONS) return usePalace.getState().endSession();
      if (phase === 'ask') askedAt = performance.now();
      else begin(LEAD_IN);
    },

    press(digit) {
      unlockAudio();
      const st = stage();
      const { phase, active, done } = get();
      if (!active || digit < 0 || digit > 9) return;
      if (phase === 'ask' && get().question?.kind === 'key') {
        const want = figuresFor(st, get().question!.item);
        const res = key(want, done, digit);
        if (res.kind === 'step') {
          tapBlock(0, 0.5);
          return set({ done: res.done });
        }
        if (res.kind === 'line') set({ done: res.done });
        return settle(res.kind === 'line', res.kind === 'miss' ? digit : -1);
      }
      if (phase !== 'recall') return;
      const digits = get().digits;
      const res = key(digits, done, digit);
      if (res.kind === 'miss') {
        clearTimers();
        knock();
        buzz(30);
        const { record } = recordLine(get().record, st, digits.length, false);
        persist({ stageId: st.id, record });
        const missed = spanMiss(get().span, st);
        // A first miss only pauses the run; a drop-back breaks it.
        if (missed.outcome === 'drop') useRewards.getState().answer(false);
        const s = get().sitting;
        const sitting = { ...s, lines: s.lines + 1, slips: s.slips + 1, drops: s.drops + (missed.outcome === 'drop' ? 1 : 0) };
        set({
          record,
          sitting,
          span: missed.span,
          phase: 'slip',
          slip: { keyed: digit, wanted: res.wanted, outcome: missed.outcome, next: missed.span.length },
          log: logged(get().log, { figures: String(digits.length), words: 'figures', ok: false }),
        });
        later(SLIP_PAUSE, () => {
          if (sitting.drops >= DROPS_PER_SITTING) return usePalace.getState().endSession();
          set({ digits: inPlay(get().span) });
          write(250);
        });
        return;
      }
      tapBlock(0, 0.55);
      buzz(6);
      if (res.kind === 'step') return set({ done: res.done });
      const { record, crossed, newBest } = recordLine(get().record, st, digits.length, true);
      persist({ stageId: st.id, record });
      const rewards = useRewards.getState();
      if (rewards.answer(true)) buzz(24);
      if (crossed) rewards.mastered(st.title);
      const s = get().sitting;
      set({
        record,
        span: spanClean(get().span, st, draw).span,
        done: res.done,
        phase: 'clean',
        sitting: { ...s, lines: s.lines + 1, clean: s.clean + 1, longest: Math.max(s.longest, digits.length), mastered: s.mastered || crossed, newBest: s.newBest || newBest },
        log: logged(get().log, { figures: String(digits.length), words: 'figures', ok: true }),
      });
      later(CLEAN_PAUSE, () => {
        set({ digits: inPlay(get().span) });
        write(150);
      });
    },

    ready() {
      if (!get().active || get().phase !== 'study') return;
      unlockAudio();
      tapBlock(0, 0.4);
      set({ phase: 'recall', done: 0 });
    },

    pick(i) {
      unlockAudio();
      const { phase, question, active } = get();
      if (!active || phase !== 'ask' || !question || question.kind !== 'pick' || i < 0 || i >= question.choices.length) return;
      settle(question.choices[i] === question.item, i);
    },

    newNumber() {
      if (!get().active || stage().kind !== 'span') return;
      unlockAudio();
      clearTimers();
      const span = freshSpan(stage());
      set({ span, digits: inPlay(span), slip: null });
      write(LEAD_IN);
    },

    again() {
      resetSitting();
      set({ active: false });
      usePalace.getState().enterRoom('ledger');
    },

    end() {
      clearTimers();
      usePalace.getState().endSession();
    },
  };
});

onResetProgress(() => {
  const save = { stageId: useLedger.getState().stageId, record: emptyRecord() };
  persist(save);
  useLedger.setState(save);
});
