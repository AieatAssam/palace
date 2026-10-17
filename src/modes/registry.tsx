import type { ComponentType } from 'react';
import { Bells } from '../echo/Bells';
import { EchoHud } from '../echo/EchoHud';
import { EchoSession } from '../echo/EchoSession';
import { EchoStages } from '../echo/EchoStages';
import { ECHO_STAGES } from '../echo/logic';
import { echoMastered, useEcho } from '../echo/store';
import { STAGES, stageLabel, stageProgress } from '../game/stages';
import { usePalace } from '../store';
import { Fretboard } from '../three/Fretboard';
import { Hud } from '../ui/Hud';
import { SessionSheet } from '../ui/SessionSheet';
import { Stages } from '../ui/Stages';
import { MODES, type ModeId, type ModeInfo } from './catalog';

/**
 * A room the player can enter. To add one:
 *  1. give it an entry in `catalog.ts` (it shows on the hub at once, as in the workshop);
 *  2. register a `Room` here: its 3D scene, its play overlay, its stage card, its session
 *     sheet, its stage list and its progress (a room keeps its own record, or reads the
 *     shared spaced-repetition deck, `game/srs.ts`, with item ids prefixed by the room), and
 *     subscribe to that record in `useRoomProgress` so the hub's plate stays current;
 *     a room that frames its own furniture publishes it to `useRoomFrame` (three/view.ts);
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
  /** The page that closes a sitting. */
  Session: ComponentType;
  stages(): readonly RoomStage[];
  /** The room's mastery now (read from its store; `useRoomProgress` keeps it live). */
  progress(): RoomProgress;
}

const fretboard: Room = {
  Scene: Fretboard,
  Overlay: Hud,
  StageCard: Stages,
  Session: SessionSheet,
  stages: () => STAGES.map((s) => ({ id: s.id, title: stageLabel(s) })),
  progress: () => {
    const deck = usePalace.getState().saved.deck;
    return { mastered: STAGES.filter((s) => stageProgress(s, deck).mastered).length, total: STAGES.length };
  },
};

const echo: Room = {
  Scene: Bells,
  Overlay: EchoHud,
  StageCard: EchoStages,
  Session: EchoSession,
  stages: () => ECHO_STAGES.map((s) => ({ id: s.id, title: s.title })),
  progress: () => ({ mastered: echoMastered(useEcho.getState().record), total: ECHO_STAGES.length }),
};

const ROOMS: Partial<Record<ModeId, Room>> = { fretboard, echo };

/** Every room's progress, re-rendering when any room's record changes. */
export function useRoomProgress(): Partial<Record<ModeId, RoomProgress>> {
  usePalace((s) => s.saved.deck);
  useEcho((s) => s.record);
  const out: Partial<Record<ModeId, RoomProgress>> = {};
  for (const [id, room] of Object.entries(ROOMS) as [ModeId, Room][]) out[id] = room.progress();
  return out;
}

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
