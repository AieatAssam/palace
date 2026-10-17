import type { ComponentType } from 'react';
import type { Deck } from '../game/srs';
import { STAGES, stageLabel, stageProgress } from '../game/stages';
import { Fretboard } from '../three/Fretboard';
import { Hud } from '../ui/Hud';
import { Stages } from '../ui/Stages';
import { MODES, type ModeId, type ModeInfo } from './catalog';

/**
 * A room the player can enter. To add one:
 *  1. give it an entry in `catalog.ts` (it shows on the hub at once, as in the workshop);
 *  2. register a `Room` here: its 3D scene, its play overlay, its stage card, its stage list
 *     and its progress hook (read from the shared spaced-repetition deck, `game/srs.ts`,
 *     with item ids prefixed by the room so they never collide);
 *  3. report every graded answer to the shared rewards (`useRewards().answer(correct)`) and
 *     each stage that crosses its mastery bar (`useRewards().mastered(title)`): the run,
 *     flourishes, chime, gilt, wax seal and the daily record then come for free.
 * Every stage is open; nothing is gated.
 */
export interface RoomStage {
  id: string;
  /** Full name, e.g. "Low E string · naturals". */
  title: string;
}

export interface RoomProgress {
  /** Stages over the mastery bar, of all the room's stages. */
  mastered: number;
  total: number;
}

export interface Room {
  /** The room's furniture on the desk, inside the camera rig. */
  Scene: ComponentType;
  /** The play overlay: the question, the answer controls and the meta line. */
  Overlay: ComponentType<{ onSettings(): void; hidden?: boolean }>;
  /** The stage card (a desk sheet), opened from the hub or from play. */
  StageCard: ComponentType;
  stages(): readonly RoomStage[];
  /** Progress hook: the room's mastery under the shared deck. */
  progress(deck: Deck): RoomProgress;
}

const fretboard: Room = {
  Scene: Fretboard,
  Overlay: Hud,
  StageCard: Stages,
  stages: () => STAGES.map((s) => ({ id: s.id, title: stageLabel(s) })),
  progress: (deck) => ({ mastered: STAGES.filter((s) => stageProgress(s, deck).mastered).length, total: STAGES.length }),
};

const ROOMS: Partial<Record<ModeId, Room>> = { fretboard };

export function roomOf(id: ModeId): Room | undefined {
  return ROOMS[id];
}

/** The hub's list: every mode in catalogue order, with its room if built. */
export function hubModes(): (ModeInfo & { room?: Room })[] {
  return MODES.map((m) => ({ ...m, room: ROOMS[m.id] }));
}

/** The room shown on the desk: the chosen one if built, else the first built room. */
export function activeRoom(id: ModeId): Room {
  return ROOMS[id] ?? fretboard;
}
