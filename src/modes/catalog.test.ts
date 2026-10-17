import { describe, expect, it } from 'vitest';
import { DEFAULT_MODE, MODE_IDS, MODES, isModeId, modeInfo } from './catalog';

describe('mode catalogue', () => {
  it('lists the six rooms in order', () => {
    expect(MODES.map((m) => m.id)).toEqual(['fretboard', 'echo', 'blocks', 'faces', 'ledger', 'nback']);
  });

  it('has unique ids that match MODE_IDS', () => {
    const ids = MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...MODE_IDS]);
  });

  it('numbers the plates I to VI in order', () => {
    expect(MODES.map((m) => m.numeral)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
  });

  it('opens exactly two rooms, the fretboard and Echo', () => {
    const open = MODES.filter((m) => m.open).map((m) => m.id);
    expect(open).toEqual(['fretboard', 'echo']);
  });

  it('gives every room a title, pitch and trains line, with its emblem matching its id', () => {
    for (const m of MODES) {
      expect(m.title.trim()).not.toBe('');
      expect(m.pitch.trim()).not.toBe('');
      expect(m.trains.trim()).not.toBe('');
      expect(m.emblem).toBe(m.id);
    }
  });
});

describe('isModeId', () => {
  it('accepts every catalogue id', () => {
    for (const id of MODE_IDS) expect(isModeId(id)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isModeId('piano')).toBe(false);
    expect(isModeId('')).toBe(false);
    expect(isModeId(null)).toBe(false);
    expect(isModeId(3)).toBe(false);
  });
});

describe('modeInfo and default', () => {
  it('looks up a room by id', () => {
    expect(modeInfo('echo').title).toBe('Echo');
  });

  it('defaults to the fretboard', () => {
    expect(DEFAULT_MODE).toBe('fretboard');
  });
});
