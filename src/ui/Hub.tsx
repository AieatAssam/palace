import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { type ModeId } from '../modes/catalog';
import { hubModes, useRoomProgress } from '../modes/registry';
import { daysWarm, dayKey } from '../rewards/logic';
import { rewardClock, useRewards } from '../rewards/store';
import { usePalace } from '../store';
import { SheetLayer, type SheetControl } from './SheetLayer';
import { type SheetItem, type SheetRect, measure } from './sheet';

/**
 * The hub is the palace's ground floor, inked on laid paper. Landscape: three chambers north and
 * three south of a long gallery, entered from the west. Portrait (a phone): two ranges of three
 * chambers either side of a narrow gallery, entered from the south.
 */
const SHAPES = {
  portrait: { width: 3.2, x: 1.3 },
  landscape: { width: 5.6, x: 2.5 },
} as const;
/** A chamber's depth, the gallery's width, a doorway's gap. */
const CH = 1.24;
const GALLERY = { landscape: 0.5, portrait: 0.34 };
const DOOR = { landscape: 0.3, portrait: 0.26 };
/** Header: the monogram, "Palace" and its double rule; the plan starts below it. */
const HEAD = 1.72;
/** Below the plan: today's record and Settings. */
const FOOT = 1.86;

const LANDSCAPE = '(min-aspect-ratio: 21/20)';
function subscribe(cb: () => void) {
  const m = typeof matchMedia === 'undefined' ? null : matchMedia(LANDSCAPE);
  m?.addEventListener('change', cb);
  return () => m?.removeEventListener('change', cb);
}
const landscapeNow = () => (typeof matchMedia === 'undefined' ? true : matchMedia(LANDSCAPE).matches);

export interface HubFigures {
  answered: number;
  bestRun: number;
  days: number;
  warm: boolean;
  /** Today's best run is also the best ever (and worth a mark). */
  record: boolean;
}

export interface HubPlate {
  id: ModeId;
  numeral: string;
  title: string;
  open: boolean;
  /** Open rooms: "4 of 32 mastered" and the share for the bar. */
  status: string;
  toward: number;
}

type Gap = [number, number];
/** A wall from a to b along one axis, broken at each gap (sorted, inside the run). */
function wallRun(axis: 'h' | 'v', at: number, a: number, b: number, gaps: Gap[], outer = false): SheetItem[] {
  const out: SheetItem[] = [];
  let from = a;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > from) out.push(axis === 'h' ? { kind: 'wall', x0: from, y0: at, x1: g0, y1: at, outer } : { kind: 'wall', x0: at, y0: from, x1: at, y1: g0, outer });
    from = g1;
  }
  if (b > from) out.push(axis === 'h' ? { kind: 'wall', x0: from, y0: at, x1: b, y1: at, outer } : { kind: 'wall', x0: at, y0: from, x1: at, y1: b, outer });
  return out;
}

/** A chamber's furnishings: numeral, emblem, name, and its mastery or a note that it is still in the workshop. */
function furnish(items: SheetItem[], p: HubPlate, cx: number, cy: number, w: number, landscape: boolean) {
  const title = landscape ? 0.27 : 0.24;
  items.push(
    { kind: 'chamber', x: cx, y: cy, w, h: CH, quiet: !p.open },
    { kind: 'text', text: p.numeral, x: cx - w / 2 + 0.14, y: cy + CH / 2 - 0.27, size: 0.15, font: 'smcp', ink: p.open ? 'gilt' : 'quiet' },
    { kind: 'emblem', shape: p.id, x: cx, y: cy + 0.24, size: landscape ? 0.42 : 0.38, quiet: !p.open },
    { kind: 'text', text: p.title, x: cx, y: cy - 0.24, size: title, font: 'italic', ink: p.open ? 'ink' : 'soft', align: 'center', label: true },
  );
  if (p.open) {
    items.push(
      { kind: 'text', text: p.status, x: cx, y: cy - 0.48, size: landscape ? 0.16 : 0.145, font: 'italic', ink: 'soft', align: 'center' },
      { kind: 'bar', y: cy - 0.56, x0: cx - 0.28, x1: cx + 0.28, fill: p.toward },
    );
  } else {
    items.push({ kind: 'text', text: 'in the workshop', x: cx, y: cy - 0.5, size: landscape ? 0.21 : 0.18, font: 'script', ink: 'iron', align: 'center' });
  }
}

/** The ground floor: walls, a doorway into each chamber off the gallery, and the entrance. */
function floorPlan(landscape: boolean, plates: HubPlate[], top: number) {
  const X = landscape ? SHAPES.landscape.x : SHAPES.portrait.x;
  const items: SheetItem[] = [];
  const rects: SheetRect[] = [];
  const dw = landscape ? DOOR.landscape : DOOR.portrait;
  const inset = 0.13; // a door's near jamb from the chamber's corner
  if (landscape) {
    const G = GALLERY.landscape;
    const y0 = top;
    const yN = y0 - CH; // the north range's gallery wall
    const yS = yN - G; // the south range's
    const y1 = yS - CH;
    const cols = 3;
    const cw = (2 * X) / cols;
    const north: Gap[] = [];
    const south: Gap[] = [];
    plates.forEach((p, i) => {
      const c = i % cols;
      const isNorth = i < cols;
      const cx = -X + cw / 2 + c * cw;
      const cy = isNorth ? y0 - CH / 2 : yS - CH / 2;
      furnish(items, p, cx, cy, cw, true);
      rects.push({ id: `room-${p.id}`, x: cx, y: cy, w: cw - 0.08, h: CH - 0.08 });
      // North doors at the chamber's east end, swinging down into the gallery; south doors at the west end, swinging up.
      const g0 = isNorth ? cx + cw / 2 - inset - dw : cx - cw / 2 + inset;
      (isNorth ? north : south).push([g0, g0 + dw]);
      items.push({ kind: 'door', x: g0 + dw / 2, y: isNorth ? yN : yS, w: dw, axis: 'h', hinge: isNorth ? 1 : -1, swing: isNorth ? -1 : 1, locked: !p.open });
    });
    const entrance: Gap = [yS + 0.08, yN - 0.08];
    items.push(
      ...wallRun('h', y0, -X, X, [], true),
      ...wallRun('h', y1, -X, X, [], true),
      ...wallRun('v', -X, y1, y0, [entrance], true),
      ...wallRun('v', X, y1, y0, [], true),
      ...wallRun('h', yN, -X, X, north),
      ...wallRun('h', yS, -X, X, south),
    );
    for (let c = 1; c < cols; c++) {
      const x = -X + c * cw;
      items.push(...wallRun('v', x, yN, y0, []), ...wallRun('v', x, y1, yS, []));
    }
    items.push(
      { kind: 'text', text: 'Gallery', x: 0, y: (yN + yS) / 2 - 0.05, size: 0.14, font: 'smcp', ink: 'quiet', align: 'center' },
      { kind: 'lozenge', x: -X + 0.16, y: (yN + yS) / 2 },
    );
    return { items, rects, bottom: y1 };
  }
  const G = GALLERY.portrait;
  const rows = Math.ceil(plates.length / 2);
  const y0 = top;
  const y1 = y0 - rows * CH;
  const cw = X - G / 2;
  const west: Gap[] = [];
  const east: Gap[] = [];
  plates.forEach((p, i) => {
    const isWest = i % 2 === 0;
    const r = Math.floor(i / 2);
    const cx = isWest ? -X + cw / 2 : G / 2 + cw / 2;
    const cy = y0 - CH / 2 - r * CH;
    furnish(items, p, cx, cy, cw, false);
    rects.push({ id: `room-${p.id}`, x: cx, y: cy, w: cw - 0.08, h: CH - 0.08 });
    // West doors near the chamber's north corner, east doors near its south corner: both swing into the gallery.
    const g0 = isWest ? cy + CH / 2 - inset - dw : cy - CH / 2 + inset;
    (isWest ? west : east).push([g0, g0 + dw]);
    items.push({ kind: 'door', x: isWest ? -G / 2 : G / 2, y: g0 + dw / 2, w: dw, axis: 'v', hinge: isWest ? 1 : -1, swing: isWest ? 1 : -1, locked: !p.open });
  });
  const entrance: Gap = [-G / 2 + 0.02, G / 2 - 0.02];
  items.push(
    ...wallRun('h', y0, -X, X, [], true),
    ...wallRun('h', y1, -X, X, [entrance], true),
    ...wallRun('v', -X, y1, y0, [], true),
    ...wallRun('v', X, y1, y0, [], true),
    ...wallRun('v', -G / 2, y1, y0, west),
    ...wallRun('v', G / 2, y1, y0, east),
  );
  for (let r = 1; r < rows; r++) {
    const y = y0 - r * CH;
    items.push(...wallRun('h', y, -X, -G / 2, []), ...wallRun('h', y, G / 2, X, []));
  }
  items.push({ kind: 'lozenge', x: 0, y: y1 - 0.1 });
  return { items, rects, bottom: y1 };
}

/** The hub card's drawing: a header, the floor plan of the rooms, today's record as a ledger line, and Settings. */
export function hubLayout(landscape: boolean, plates: HubPlate[], fig: HubFigures) {
  const shape = landscape ? SHAPES.landscape : SHAPES.portrait;
  const X = shape.x;
  const rows = landscape ? 2 : Math.ceil(plates.length / 2);
  const planH = landscape ? 2 * CH + GALLERY.landscape : rows * CH;
  const height = HEAD + planH + FOOT;
  const top = height / 2;
  const items: SheetItem[] = [
    { kind: 'text', text: 'Palace', x: 0, y: top - 1.2, size: 0.46, font: 'italic', ink: 'gilt', align: 'center' },
    { kind: 'text', text: 'the ground floor', x: 0, y: top - 1.5, size: 0.2, font: 'script', ink: 'iron', align: 'center' },
  ];
  const plan = floorPlan(landscape, plates, top - HEAD);
  items.push(...plan.items);
  const rects: SheetRect[] = [...plan.rects];

  // Today's record, kept as a line in an account book: printed heads, a hand-written figure under each, blue
  // ruling and oxblood columns. The day count cools to stone until you answer today.
  const foot = plan.bottom - 0.2;
  const colX = landscape ? [-1.6, 0, 1.6] : [-0.88, 0, 0.88];
  const half = landscape ? 0.8 : 0.44;
  items.push(
    { kind: 'rule', y: foot - 0.3, x0: -X, x1: X, weight: 'ledger' },
    { kind: 'rule', y: foot - 0.86, x0: -X, x1: X, weight: 'ledger' },
    { kind: 'column', x: colX[0]! + half, y0: foot - 0.3, y1: foot - 0.86, double: true },
    { kind: 'column', x: colX[1]! + half, y0: foot - 0.3, y1: foot - 0.86, double: true },
  );
  const cols: [string, string, 'iron' | 'quiet'][] = [
    ['Answered', String(fig.answered), 'iron'],
    ['Best run', String(fig.bestRun), 'iron'],
    ['Days', String(fig.days), fig.warm ? 'iron' : 'quiet'],
  ];
  cols.forEach(([label, value, ink], i) => {
    items.push(
      { kind: 'text', text: label, x: colX[i]!, y: foot - 0.2, size: 0.14, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: value, x: colX[i]!, y: foot - 0.74, size: 0.38, font: 'script', ink, align: 'center', tilt: 2 },
    );
  });
  if (fig.record) items.push({ kind: 'mark', x: colX[1]! + measure(String(fig.bestRun), 0.38) / 2 + 0.18, y: foot - 0.6, r: 0.05 });
  items.push({ kind: 'text', text: 'Settings', x: 0, y: foot - 1.36, size: 0.24, font: 'smcp', ink: 'soft', align: 'center' });
  rects.push({ id: 'settings', x: 0, y: foot - 1.28, w: 1.3, h: 0.46 });
  return { key: `hub-${landscape ? 'l' : 'p'}`, width: shape.width, height, items, rects, monogram: true, solo: true };
}

/** The hub: the palace's floor plan on one card on the desk, the day's record at its foot. Nothing is locked. */
export function Hub({ onSettings }: { onSettings: () => void }) {
  const progress = useRoomProgress();
  const openRoom = usePalace((s) => s.openRoom);
  const daily = useRewards((s) => s.daily);
  const refreshDay = useRewards((s) => s.refreshDay);
  const landscape = useSyncExternalStore(subscribe, landscapeNow, () => true);
  useEffect(() => refreshDay(), [refreshDay]);

  const modes = hubModes();
  const plates: HubPlate[] = modes.map((m) => {
    const p = progress[m.id];
    return {
      id: m.id,
      numeral: m.numeral,
      title: m.title,
      open: !!m.room,
      status: p ? `${p.mastered} of ${p.total} mastered` : '',
      toward: p ? Math.round((p.mastered / Math.max(1, p.total)) * 40) / 40 : 0,
    };
  });
  const fig: HubFigures = {
    answered: daily.items,
    bestRun: daily.bestStreak,
    days: daily.days,
    warm: daysWarm(daily, dayKey(rewardClock.now())),
    record: daily.bestStreak >= 5 && daily.bestStreak >= daily.bestEver,
  };
  const signature = JSON.stringify([landscape, plates, fig]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geom = useMemo(() => hubLayout(landscape, plates, fig), [signature]);

  const controls: SheetControl[] = [
    ...modes.map((m, i) => ({
      id: `room-${m.id}`,
      testId: `room-${m.id}`,
      label: `${m.numeral}, ${m.title}: ${m.room ? plates[i]!.status : 'in the workshop'}`,
      autoFocus: i === 0,
      onActivate: () => openRoom(m.id),
    })),
    { id: 'settings', testId: 'hub-settings', label: 'Settings', onActivate: onSettings },
  ];

  return (
    <SheetLayer geom={geom} controls={controls} testId="hub" label="Palace: the ground floor">
      <h2>Palace</h2>
      <p>A floor plan of the ground floor: six rooms off a gallery. Choose a room to see its stages.</p>
      <ul>
        {modes.map((m) => (
          <li key={m.id}>
            {m.numeral}. {m.title}. {m.pitch}
          </li>
        ))}
      </ul>
      <p data-testid="hub-record">
        Today: {fig.answered} answered, best run {fig.bestRun}. {fig.days} days at the desk{fig.warm ? '' : ', none yet today'}. Best run ever {daily.bestEver}.
      </p>
    </SheetLayer>
  );
}
