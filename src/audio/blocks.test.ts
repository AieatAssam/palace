import { describe, expect, it } from 'vitest';
import { BLOCK_PARTIALS, blockChimeFreq } from './blocks';

describe('blockChimeFreq', () => {
  it('rises strictly with each step of the first sixteen', () => {
    for (let step = 1; step < 16; step++) {
      expect(blockChimeFreq(step)).toBeGreaterThan(blockChimeFreq(step - 1));
    }
  });

  it('starts the line on D5', () => {
    expect(blockChimeFreq(0)).toBeCloseTo(587.33, 0);
    expect(Math.abs(blockChimeFreq(0) - 587.33)).toBeLessThan(0.1);
  });

  it('clamps a step below zero to the first note', () => {
    expect(blockChimeFreq(-1)).toBe(blockChimeFreq(0));
    expect(blockChimeFreq(-100)).toBe(blockChimeFreq(0));
  });

  it('holds the top note for a step past the table', () => {
    expect(blockChimeFreq(16)).toBe(blockChimeFreq(15));
    expect(blockChimeFreq(1000)).toBe(blockChimeFreq(15));
  });

  it('treats a fractional step as its whole step below', () => {
    expect(blockChimeFreq(2.7)).toBe(blockChimeFreq(2));
  });
});

describe('BLOCK_PARTIALS', () => {
  it('starts with the struck note itself, at ratio one', () => {
    expect(BLOCK_PARTIALS[0]!.ratio).toBe(1);
  });
});
