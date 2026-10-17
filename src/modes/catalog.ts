/**
 * The palace's rooms as plain data: what the hub lists, in order. A room is either open
 * (it has a registered room in `registry.tsx`: a 3D scene, a play overlay, a stage card,
 * stage list and progress hooks) or still in the workshop (a plate on the hub, and a card
 * saying what it will train). Keep this file free of React so storage and tests can use it.
 */
export const MODE_IDS = ['fretboard', 'echo', 'blocks', 'faces', 'ledger', 'nback'] as const;
export type ModeId = (typeof MODE_IDS)[number];

/** The gilt drawing on each room's plate (see `three/Sheet.tsx`). */
export type Emblem = ModeId;

export interface ModeInfo {
  id: ModeId;
  /** Roman numeral on the plate. */
  numeral: string;
  title: string;
  /** One line: what you do in the room. */
  pitch: string;
  /** What kind of memory it works. */
  trains: string;
  emblem: Emblem;
  /** Built and registered in `registry.tsx`; otherwise the room is still in the workshop. */
  open: boolean;
}

export const MODES: readonly ModeInfo[] = [
  { id: 'fretboard', numeral: 'I', title: 'Fretboard', pitch: 'Name every note on a guitar neck.', trains: 'Facts on sight', emblem: 'fretboard', open: true },
  { id: 'echo', numeral: 'II', title: 'Echo', pitch: 'Hear a line of brass bells, then ring it back.', trains: 'Order and sequence', emblem: 'echo', open: true },
  { id: 'blocks', numeral: 'III', title: 'Blocks', pitch: 'Watch a line of blocks light on the blotter, then tap it back.', trains: 'Where things were', emblem: 'blocks', open: true },
  { id: 'faces', numeral: 'IV', title: 'Faces', pitch: 'Meet the sitters in their frames, then name them.', trains: 'Names to faces', emblem: 'faces', open: true },
  { id: 'ledger', numeral: 'V', title: 'Ledger', pitch: 'Turn digits into images and walk them through a room.', trains: 'Long numbers', emblem: 'ledger', open: false },
  { id: 'nback', numeral: 'VI', title: 'N-Back', pitch: 'Walk a corridor and call out each repeat n steps back.', trains: 'Working memory', emblem: 'nback', open: false },
];

export const DEFAULT_MODE: ModeId = 'fretboard';

export function isModeId(v: unknown): v is ModeId {
  return typeof v === 'string' && (MODE_IDS as readonly string[]).includes(v);
}

export function modeInfo(id: ModeId): ModeInfo {
  return MODES.find((m) => m.id === id)!;
}
