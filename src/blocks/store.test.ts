import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/engine', () => ({
  haptic: vi.fn(),
  knock: vi.fn(),
  pluck: vi.fn(),
  setSoundEnabled: vi.fn(),
  tapBlock: vi.fn(),
  unlockAudio: vi.fn(),
}));

import { useRewards } from '../rewards/store';
import { usePalace } from '../store';
import { advanceUntil } from '../testUtils/advance';
import { expectedOrder } from './logic';
import { useBlocks } from './store';

const s = () => useBlocks.getState();

/** Tap the line back in order. */
function tapRight() {
  for (const b of expectedOrder(s().line, s().stage().order)) s().press(b);
}

/** Tap a block that is not the one due. */
function tapWrong() {
  const due = expectedOrder(s().line, s().stage().order)[s().done]!;
  const wrong = Array.from({ length: s().stage().blocks }, (_, i) => i).find((b) => b !== due)!;
  s().press(wrong);
}

const waitForRecall = () => advanceUntil(() => s().phase === 'recall');

beforeEach(() => {
  vi.useFakeTimers();
  usePalace.setState({ screen: 'play', stagesOpen: false });
  s().setActive(false);
  s().chooseStage('span');
  useRewards.setState({ streak: 0 });
});

afterEach(() => {
  s().setActive(false);
  vi.useRealTimers();
});

describe('Blocks store: one line for the sitting', () => {
  it('a clean line appends one block to the same line', () => {
    s().setActive(true);
    waitForRecall();
    const before = [...s().span.items];
    expect(s().line).toHaveLength(3);
    tapRight();
    expect(s().phase).toBe('clean');
    expect(s().span.length).toBe(4);
    expect(s().span.items.slice(0, 3)).toEqual(before);
    waitForRecall();
    expect(s().line).toEqual(s().span.items.slice(0, 4));
  });

  it('a first miss shows the same line at the same length and keeps the streak', () => {
    s().setActive(true);
    waitForRecall();
    useRewards.setState({ streak: 2 });
    const line = [...s().line];
    tapWrong();
    expect(s().phase).toBe('slip');
    expect(s().slip?.outcome).toBe('retry');
    expect(useRewards.getState().streak).toBe(2);
    waitForRecall();
    expect(s().line).toEqual(line);
    expect(s().span.length).toBe(3);
  });

  it('a second miss in a row drops back two blocks with the same prefix', () => {
    s().setActive(true);
    waitForRecall();
    tapRight();
    waitForRecall();
    tapRight();
    waitForRecall();
    const items = [...s().span.items];
    expect(s().span.length).toBe(5);
    tapWrong();
    waitForRecall();
    tapWrong();
    expect(s().slip?.outcome).toBe('drop');
    expect(useRewards.getState().streak).toBe(0);
    expect(s().span.length).toBe(3);
    expect(s().span.items).toEqual(items);
    expect(s().sitting.drops).toBe(1);
    waitForRecall();
    expect(s().line).toEqual(items.slice(0, 3));
  });

  it('floors the drop at the stage start', () => {
    s().setActive(true);
    waitForRecall();
    tapRight();
    waitForRecall();
    tapWrong();
    waitForRecall();
    tapWrong();
    expect(s().span.length).toBe(s().stage().start);
  });

  it('three drop-backs end the sitting', () => {
    s().setActive(true);
    waitForRecall();
    for (let drop = 1; drop <= 3; drop++) {
      tapWrong();
      expect(usePalace.getState().screen).toBe('play');
      waitForRecall();
      tapWrong();
      if (drop < 3) waitForRecall();
    }
    expect(s().sitting.drops).toBe(3);
    expect(s().sitting.slips).toBe(6);
    advanceUntil(() => usePalace.getState().screen === 'session');
    expect(usePalace.getState().screen).toBe('session');
  });

  it('New line draws a fresh line at the start length and keeps the sitting', () => {
    s().setActive(true);
    waitForRecall();
    tapRight();
    waitForRecall();
    tapRight();
    waitForRecall();
    const clean = s().sitting.clean;
    s().newLine();
    expect(s().span.length).toBe(s().stage().start);
    expect(s().span.misses).toBe(0);
    expect(s().sitting.clean).toBe(clean);
    waitForRecall();
    expect(s().line).toEqual(s().span.items.slice(0, s().stage().start));
  });
});

describe('Blocks store: a moving board relays out after a clean line, not after a miss', () => {
  it('keeps the layout seed through a miss and changes it after a clean line', () => {
    s().chooseStage('shifting');
    s().setActive(true);
    waitForRecall();
    const seed0 = s().seed;
    tapWrong();
    waitForRecall();
    expect(s().seed).toBe(seed0);
    tapRight();
    waitForRecall();
    expect(s().seed).not.toBe(seed0);
  });
});
