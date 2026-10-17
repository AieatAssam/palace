import { type Deck, isCard } from './srs';
import { FIRST_STAGE, STAGES } from './stages';

export const STORAGE_KEY = 'palace.fretboard.v1';

export interface Settings {
  leftHanded: boolean;
  sound: boolean;
  haptics: boolean;
  /** Calm the room: no idle drift or shimmer, near-instant fades (also honoured from the OS setting). */
  reduceMotion: boolean;
}

export interface SavedState {
  deck: Deck;
  /** The stage on the desk (see `stages.ts`); every stage is open, this is only where you left off. */
  stageId: string;
  settings: Settings;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = { leftHanded: false, sound: true, haptics: true, reduceMotion: false };

export function emptyState(): SavedState {
  return { deck: {}, stageId: FIRST_STAGE.id, settings: { ...DEFAULT_SETTINGS }, onboarded: false };
}

interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KV | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined; // e.g. disabled storage in private mode
  }
}

/** Parse and validate persisted state; corrupt or missing fields fall back to defaults. */
export function parseState(raw: string | null): SavedState {
  const base = emptyState();
  if (!raw) return base;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return base;
  }
  if (typeof data !== 'object' || data === null) return base;
  const d = data as Record<string, unknown>;
  const deck: Deck = {};
  if (typeof d.deck === 'object' && d.deck !== null) {
    for (const [k, v] of Object.entries(d.deck as Record<string, unknown>)) {
      if (isCard(v) && v.id === k) deck[k] = v;
    }
  }
  const s = (typeof d.settings === 'object' && d.settings) || {};
  const settings = s as Record<string, unknown>;
  return {
    deck,
    // Older saves kept an unlock index (`stage`); there is nothing to unlock now, so they start at the first stage.
    stageId: typeof d.stageId === 'string' && STAGES.some((st) => st.id === d.stageId) ? d.stageId : FIRST_STAGE.id,
    settings: {
      leftHanded: typeof settings.leftHanded === 'boolean' ? settings.leftHanded : DEFAULT_SETTINGS.leftHanded,
      sound: typeof settings.sound === 'boolean' ? settings.sound : DEFAULT_SETTINGS.sound,
      haptics: typeof settings.haptics === 'boolean' ? settings.haptics : DEFAULT_SETTINGS.haptics,
      reduceMotion: typeof settings.reduceMotion === 'boolean' ? settings.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
    },
    onboarded: d.onboarded === true,
  };
}

export function loadState(store: KV | undefined = defaultStore()): SavedState {
  if (!store) return emptyState();
  try {
    return parseState(store.getItem(STORAGE_KEY));
  } catch {
    return emptyState();
  }
}

export function saveState(state: SavedState, store: KV | undefined = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy mode: progress simply isn't persisted.
  }
}
