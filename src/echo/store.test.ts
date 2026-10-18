import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/engine', () => ({
  haptic: vi.fn(),
  knock: vi.fn(),
  pluck: vi.fn(),
  ringBell: vi.fn(),
  setSoundEnabled: vi.fn(),
  unlockAudio: vi.fn(),
}));

import { useRewards } from '../rewards/store';
import { usePalace } from '../store';
import { advanceUntil } from '../testUtils/advance';
import { expectedOrder } from './logic';
import { lineRng, useEcho } from './store';

const s = () => useEcho.getState();
const bells = () => s().stage().bells;

/** Ring the line back exactly as heard. */
function ringRight() {
  for (const step of expectedOrder(s().line, s().stage().order)) for (const b of step) s().press(b);
}

/** Strike a bell the first step does not want. */
function ringWrong() {
  const wanted = expectedOrder(s().line, s().stage().order)[0]!;
  const wrong = Array.from({ length: bells() }, (_, i) => i).find((b) => !wanted.includes(b))!;
  s().press(wrong);
}

const waitForRepeat = () => advanceUntil(() => s().phase === 'repeat');

beforeEach(() => {
  vi.useFakeTimers();
  usePalace.setState({ screen: 'play', stagesOpen: false });
  s().setActive(false);
  s().chooseStage('four');
  useRewards.setState({ streak: 0 });
  let seed = 42;
  lineRng.current = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
});

afterEach(() => {
  s().setActive(false);
  vi.useRealTimers();
  lineRng.current = Math.random;
});

describe('Echo store: one tune for the sitting', () => {
  it('a clean line appends one bell to the same tune', () => {
    s().setActive(true);
    waitForRepeat();
    const before = [...s().span.items];
    expect(s().line).toHaveLength(3);
    ringRight();
    expect(s().phase).toBe('clean');
    expect(s().span.length).toBe(4);
    expect(s().span.items.slice(0, 3)).toEqual(before);
    waitForRepeat();
    expect(s().line).toEqual(s().span.items.slice(0, 4));
    expect(s().sitting.clean).toBe(1);
  });

  it('a first miss replays the same line at the same length and keeps the streak', () => {
    s().setActive(true);
    waitForRepeat();
    useRewards.setState({ streak: 3 });
    const line = [...s().line];
    const items = [...s().span.items];
    ringWrong();
    expect(s().phase).toBe('slip');
    expect(s().slip?.outcome).toBe('retry');
    expect(s().sitting.drops).toBe(0);
    expect(useRewards.getState().streak).toBe(3);
    waitForRepeat();
    expect(s().line).toEqual(line);
    expect(s().span.items).toEqual(items);
    expect(s().span.length).toBe(3);
  });

  it('a second miss in a row drops back two bells with the same prefix', () => {
    s().setActive(true);
    waitForRepeat();
    ringRight();
    waitForRepeat();
    ringRight();
    waitForRepeat();
    expect(s().span.length).toBe(5);
    const items = [...s().span.items];
    ringWrong();
    waitForRepeat();
    ringWrong();
    expect(s().slip?.outcome).toBe('drop');
    expect(useRewards.getState().streak).toBe(0);
    expect(s().span.length).toBe(3);
    expect(s().span.misses).toBe(0);
    expect(s().span.items).toEqual(items);
    expect(s().sitting.drops).toBe(1);
    waitForRepeat();
    expect(s().line).toEqual(items.slice(0, 3));
  });

  it('building up after a drop-back replays the same bells and draws none new', () => {
    s().setActive(true);
    waitForRepeat();
    ringRight();
    waitForRepeat();
    ringRight();
    waitForRepeat();
    const items = [...s().span.items];
    ringWrong();
    waitForRepeat();
    ringWrong();
    waitForRepeat();
    ringRight();
    waitForRepeat();
    expect(s().span.length).toBe(4);
    expect(s().span.items).toEqual(items);
    expect(s().line).toEqual(items.slice(0, 4));
  });

  it('floors the drop at the stage start', () => {
    s().setActive(true);
    waitForRepeat();
    ringRight();
    waitForRepeat();
    ringWrong();
    waitForRepeat();
    ringWrong();
    expect(s().span.length).toBe(3);
    expect(s().span.length).toBe(s().stage().start);
  });

  it('three drop-backs end the sitting, and not three slips', () => {
    s().setActive(true);
    waitForRepeat();
    for (let drop = 1; drop <= 3; drop++) {
      ringWrong();
      expect(usePalace.getState().screen).toBe('play');
      waitForRepeat();
      ringWrong();
      if (drop < 3) waitForRepeat();
    }
    expect(s().sitting.drops).toBe(3);
    expect(s().sitting.slips).toBe(6);
    advanceUntil(() => usePalace.getState().screen === 'session');
    expect(usePalace.getState().screen).toBe('session');
  });

  it('two slips that are not in a row do not end the sitting', () => {
    s().setActive(true);
    waitForRepeat();
    ringWrong();
    waitForRepeat();
    ringRight();
    waitForRepeat();
    ringWrong();
    expect(s().slip?.outcome).toBe('retry');
    expect(s().sitting.drops).toBe(0);
    expect(s().sitting.slips).toBe(2);
  });

  it('New tune draws a fresh tune at the start length and keeps the sitting', () => {
    s().setActive(true);
    waitForRepeat();
    ringRight();
    waitForRepeat();
    ringRight();
    waitForRepeat();
    expect(s().span.length).toBe(5);
    const clean = s().sitting.clean;
    s().newTune();
    expect(s().span.length).toBe(s().stage().start);
    expect(s().span.items).toHaveLength(s().stage().start);
    expect(s().span.misses).toBe(0);
    expect(s().sitting.clean).toBe(clean);
    waitForRepeat();
    expect(s().line).toEqual(s().span.items.slice(0, s().stage().start));
  });
});
