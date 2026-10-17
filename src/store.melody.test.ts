import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./audio/engine', () => ({
  chime: vi.fn(),
  haptic: vi.fn(),
  knock: vi.fn(),
  pluck: vi.fn(),
  setSoundEnabled: vi.fn(),
  unlockAudio: vi.fn(),
}));

import { type Position } from './game/notes';
import { soundsNote } from './game/melodies';
import { useRewards } from './rewards/store';
import { melodyNotesInPlay, usePalace } from './store';
import { advanceUntil } from './testUtils/advance';

const pal = () => usePalace.getState();
const run = () => pal().melody;
const tune = () => pal().question;

/** Every place on the neck, in string order, for finding a note that sounds or one that does not. */
const PLACES: Position[] = [];
for (let string = 0; string < 6; string++) for (let fret = 0; fret <= 12; fret++) PLACES.push({ string, fret } as Position);

const rightPlace = (midi: number) => PLACES.find((p) => soundsNote(p, midi))!;
const wrongPlace = (midi: number) => PLACES.find((p) => !soundsNote(p, midi))!;

/** Notes of the lines in play, from the first. */
const inPlayCount = () => {
  const q = tune();
  if (q.kind !== 'melody') throw new Error('not a melody');
  return melodyNotesInPlay(q, run()).length;
};

/** Play the notes in play now, correctly (a finished line that grows the tune leaves the player waiting). */
function playLinesRight() {
  const q = tune();
  if (q.kind !== 'melody') throw new Error('not a melody');
  const end = inPlayCount();
  while (run().phase === 'play' && run().at < end) {
    pal().tapPosition(rightPlace(q.notes[run().at]!.midi));
  }
}

/** Play the next note wrongly. */
function playWrong() {
  const q = tune();
  if (q.kind !== 'melody') throw new Error('not a melody');
  pal().tapPosition(wrongPlace(q.notes[run().at]!.midi));
}

/** Choose the from-memory stage, drawing again until the tune has at least `lines` lines. */
function chooseRecallTune(lines: number) {
  for (let i = 0; i < 200; i++) {
    pal().chooseStage('mel-recall');
    const q = tune();
    if (q.kind === 'melody' && q.lines.length >= lines) return;
  }
  throw new Error(`no from-memory tune with ${lines} lines in 200 draws`);
}

const waitForPlay = () => advanceUntil(() => run().phase === 'play');

beforeEach(() => {
  vi.useFakeTimers();
  usePalace.setState({ screen: 'play', stagesOpen: false, locked: false });
  useRewards.setState({ streak: 0 });
});

afterEach(() => {
  pal().toHub();
  vi.useRealTimers();
});

describe('Melody recall: the tune builds up a line at a time', () => {
  it('starts with one line and plays it from the first note after the preview', () => {
    chooseRecallTune(3);
    expect(run().phase).toBe('preview');
    expect(run().span.length).toBe(1);
    waitForPlay();
    expect(run().at).toBe(0);
    expect(run().span.length).toBe(1);
  });

  it('a finished line with more to come grows the span and replays the lines', () => {
    chooseRecallTune(3);
    waitForPlay();
    const items = [...run().span.items];
    playLinesRight();
    expect(run().span.length).toBe(2);
    expect(run().span.items.slice(0, items.length)).toEqual(items);
    advanceUntil(() => run().phase === 'preview');
    expect(run().span.length).toBe(2);
    waitForPlay();
    expect(run().at).toBe(0);
    expect(run().span.length).toBe(2);
  });

  it('a clean pass through the whole tune goes to playback, not another line', () => {
    chooseRecallTune(2);
    const q = tune();
    if (q.kind !== 'melody') throw new Error('not a melody');
    const n = q.lines.length;
    for (let line = 1; line < n; line++) {
      waitForPlay();
      playLinesRight();
      advanceUntil(() => run().phase === 'preview');
    }
    waitForPlay();
    expect(run().span.length).toBe(n);
    playLinesRight();
    expect(['playback', 'done']).toContain(run().phase);
    expect(run().span.length).toBe(n);
  });
});

describe('Melody recall: a miss shows the note and replays the same lines', () => {
  it('a wrong note goes to missed, keeps the span, and previews the same lines again', () => {
    chooseRecallTune(3);
    waitForPlay();
    playLinesRight();
    advanceUntil(() => run().phase === 'preview');
    waitForPlay();
    expect(run().span.length).toBe(2);
    playWrong();
    expect(run().phase).toBe('missed');
    expect(run().slip?.outcome).toBe('retry');
    expect(run().span.length).toBe(2);
    expect(run().span.misses).toBe(1);
    advanceUntil(() => run().phase === 'preview');
    expect(run().span.length).toBe(2);
    waitForPlay();
    expect(run().at).toBe(0);
  });

  it('shows the wanted note on the card while missed', () => {
    chooseRecallTune(3);
    waitForPlay();
    const q = tune();
    if (q.kind !== 'melody') throw new Error('not a melody');
    const want = run().at;
    playWrong();
    expect(run().phase).toBe('missed');
    expect(pal().found).toHaveLength(1);
    expect(soundsNote(pal().found[0]!, q.notes[want]!.midi)).toBe(true);
  });

  it('two misses in a row drop back to max(1, n - 2) lines with the same prefix', () => {
    chooseRecallTune(3);
    waitForPlay();
    playLinesRight();
    advanceUntil(() => run().phase === 'preview');
    waitForPlay();
    playLinesRight();
    advanceUntil(() => run().phase === 'preview');
    waitForPlay();
    expect(run().span.length).toBe(3);
    const items = [...run().span.items];
    playWrong();
    expect(run().slip?.outcome).toBe('retry');
    advanceUntil(() => run().phase === 'preview');
    waitForPlay();
    playWrong();
    expect(run().phase).toBe('missed');
    expect(run().slip?.outcome).toBe('drop');
    expect(run().span.length).toBe(1);
    expect(run().span.items).toEqual(items);
    expect(run().span.misses).toBe(0);
    advanceUntil(() => run().phase === 'preview');
    expect(run().span.length).toBe(1);
    waitForPlay();
    const q = tune();
    if (q.kind !== 'melody') throw new Error('not a melody');
    expect(inPlayCount()).toBe(q.lines[0]!.length);
  });
});
