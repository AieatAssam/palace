import { describe, expect, it } from 'vitest';
import { newCard } from './srs';
import { STORAGE_KEY, emptyState, loadState, parseState, saveState } from './storage';

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
}

describe('storage', () => {
  it('returns defaults for missing or corrupt data', () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState('{nope')).toEqual(emptyState());
    expect(parseState('42')).toEqual(emptyState());
  });

  it('round-trips state', () => {
    const store = memoryStore();
    const state = {
      deck: { 'name:s0f0': newCard('name:s0f0', 1) },
      stage: 2,
      settings: { leftHanded: true, sound: false, haptics: false, reduceMotion: true },
      onboarded: true,
    };
    saveState(state, store);
    expect(store.m.has(STORAGE_KEY)).toBe(true);
    expect(loadState(store)).toEqual(state);
  });

  it('drops invalid cards and bad fields', () => {
    const raw = JSON.stringify({
      deck: { a: { id: 'a' }, b: newCard('b', 1), c: newCard('mismatch', 1) },
      stage: -1,
      settings: { leftHanded: 'yes' },
      onboarded: 'true',
    });
    const s = parseState(raw);
    expect(Object.keys(s.deck)).toEqual(['b']);
    expect(s.stage).toBe(0);
    expect(s.settings.leftHanded).toBe(false);
    expect(s.settings.haptics).toBe(true);
    expect(s.settings.reduceMotion).toBe(false);
    expect(s.onboarded).toBe(false);
  });

  it('survives a throwing store', () => {
    const bad = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadState(bad)).toEqual(emptyState());
    expect(() => saveState(emptyState(), bad)).not.toThrow();
  });
});
