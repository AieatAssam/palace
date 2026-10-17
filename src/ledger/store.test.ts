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
import { useLedger } from './store';

const s = () => useLedger.getState();

/** Wait until the number can be keyed back: a timed stage writes it out, a studied one waits for Ready. */
function waitToKey() {
  advanceUntil(() => s().phase === 'recall' || s().phase === 'study');
  if (s().phase === 'study') s().ready();
}

/** Key the number back, figure by figure, in order. */
function keyRight() {
  for (const d of [...s().digits]) s().press(d);
}

/** Key a figure that is not the one due. */
function keyWrong() {
  const due = s().digits[s().done]!;
  s().press((due + 1) % 10);
}

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

describe('Ledger store: digit span, one number for the sitting', () => {
  it('starts at four figures, with a fresh number', () => {
    expect(s().span.length).toBe(4);
    expect(s().span.items).toHaveLength(4);
  });

  it('a clean number appends one figure to the same number', () => {
    s().setActive(true);
    waitToKey();
    const before = [...s().span.items];
    keyRight();
    expect(s().phase).toBe('clean');
    expect(s().span.length).toBe(5);
    expect(s().span.items.slice(0, 4)).toEqual(before);
    waitToKey();
    expect(s().digits).toEqual(s().span.items.slice(0, 5));
  });

  it('a first miss writes the same number again and keeps the streak', () => {
    s().setActive(true);
    waitToKey();
    useRewards.setState({ streak: 4 });
    const digits = [...s().digits];
    keyWrong();
    expect(s().phase).toBe('slip');
    expect(s().slip?.outcome).toBe('retry');
    expect(useRewards.getState().streak).toBe(4);
    waitToKey();
    expect(s().digits).toEqual(digits);
    expect(s().span.length).toBe(4);
  });

  it('a second miss in a row drops back two figures with the same prefix', () => {
    s().setActive(true);
    waitToKey();
    keyRight();
    waitToKey();
    keyRight();
    waitToKey();
    expect(s().span.length).toBe(6);
    const items = [...s().span.items];
    keyWrong();
    waitToKey();
    keyWrong();
    expect(s().slip?.outcome).toBe('drop');
    expect(useRewards.getState().streak).toBe(0);
    expect(s().span.length).toBe(4);
    expect(s().span.items).toEqual(items);
    waitToKey();
    expect(s().digits).toEqual(items.slice(0, 4));
  });

  it('floors the drop at the start', () => {
    s().setActive(true);
    waitToKey();
    keyRight();
    waitToKey();
    keyWrong();
    waitToKey();
    keyWrong();
    expect(s().span.length).toBe(4);
  });

  it('three drop-backs end the sitting', () => {
    s().setActive(true);
    waitToKey();
    for (let drop = 1; drop <= 3; drop++) {
      keyWrong();
      expect(usePalace.getState().screen).toBe('play');
      waitToKey();
      keyWrong();
      if (drop < 3) waitToKey();
    }
    expect(s().sitting.drops).toBe(3);
    expect(s().sitting.slips).toBe(6);
    advanceUntil(() => usePalace.getState().screen === 'session');
    expect(usePalace.getState().screen).toBe('session');
  });

  it('New number draws a fresh number at the start length', () => {
    s().setActive(true);
    waitToKey();
    keyRight();
    waitToKey();
    const clean = s().sitting.clean;
    s().newNumber();
    expect(s().span.length).toBe(4);
    expect(s().span.misses).toBe(0);
    expect(s().sitting.clean).toBe(clean);
    waitToKey();
    expect(s().digits).toEqual(s().span.items.slice(0, 4));
  });
});

describe('Ledger store: a studied stage with a step of two', () => {
  beforeEach(() => {
    s().setActive(false);
    s().chooseStage('long');
  });

  it('builds up by two, and a drop-back goes back four', () => {
    s().setActive(true);
    waitToKey();
    expect(s().span.length).toBe(8);
    keyRight();
    waitToKey();
    keyRight();
    waitToKey();
    keyRight();
    waitToKey();
    expect(s().span.length).toBe(14);
    const items = [...s().span.items];
    keyWrong();
    waitToKey();
    keyWrong();
    expect(s().slip?.outcome).toBe('drop');
    expect(s().span.length).toBe(10);
    expect(s().span.items).toEqual(items);
  });

  it('floors a step-of-two drop at the start', () => {
    s().setActive(true);
    waitToKey();
    keyRight();
    waitToKey();
    keyWrong();
    waitToKey();
    keyWrong();
    expect(s().span.length).toBe(8);
  });
});
