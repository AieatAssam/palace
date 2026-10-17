import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { type ModeId } from '../modes/catalog';
import { hubModes, useRoomProgress } from '../modes/registry';
import { daysWarm, dayKey } from '../rewards/logic';
import { rewardClock, useRewards } from '../rewards/store';
import { usePalace } from '../store';
import { SheetLayer, type SheetControl } from './SheetLayer';
import { type SheetItem, type SheetRect, measure } from './sheet';

/** Portrait (a phone): two plates a row, a tall card. Landscape: three a row, a wide one. */
const SHAPES = {
  portrait: { width: 3.2, cols: 2, x: 1.3 },
  landscape: { width: 5.6, cols: 3, x: 2.5 },
} as const;
const CELL_H = 1.36;
const GAP = 0.1;

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

/** The hub card's drawing: a header, a grid of room plates, today's record and Settings. */
export function hubLayout(landscape: boolean, plates: HubPlate[], fig: HubFigures) {
  const shape = landscape ? SHAPES.landscape : SHAPES.portrait;
  const X = shape.x;
  const rows = Math.ceil(plates.length / shape.cols);
  const gridH = rows * CELL_H + (rows - 1) * GAP;
  const height = 1.68 + gridH + 1.72;
  const top = height / 2;
  const items: SheetItem[] = [
    { kind: 'text', text: 'Palace', x: 0, y: top - 1.28, size: 0.5, font: 'italic', ink: 'gilt', align: 'center' },
    { kind: 'rule', y: top - 1.5, x0: -X, x1: X, weight: 'double' },
  ];
  const rects: SheetRect[] = [];
  const cw = (2 * X - (shape.cols - 1) * GAP) / shape.cols;
  plates.forEach((p, i) => {
    const r = Math.floor(i / shape.cols);
    const c = i % shape.cols;
    const cx = -X + cw / 2 + c * (cw + GAP);
    const cy = top - 1.68 - CELL_H / 2 - r * (CELL_H + GAP);
    items.push(
      { kind: 'plate', x: cx, y: cy, w: cw, h: CELL_H, quiet: !p.open },
      { kind: 'text', text: p.numeral, x: cx - cw / 2 + 0.13, y: cy + CELL_H / 2 - 0.28, size: 0.16, font: 'smcp', ink: p.open ? 'gilt' : 'quiet' },
      { kind: 'emblem', shape: p.id, x: cx, y: cy + 0.24, size: 0.44, quiet: !p.open },
      { kind: 'text', text: p.title, x: cx, y: cy - 0.26, size: 0.27, font: 'italic', ink: p.open ? 'ink' : 'soft', align: 'center', label: true },
    );
    if (p.open) {
      items.push(
        { kind: 'text', text: p.status, x: cx, y: cy - 0.53, size: 0.16, font: 'italic', ink: 'soft', align: 'center' },
        { kind: 'bar', y: cy - 0.61, x0: cx - 0.3, x1: cx + 0.3, fill: p.toward },
      );
    } else {
      items.push({ kind: 'text', text: 'in the workshop', x: cx, y: cy - 0.56, size: landscape ? 0.22 : 0.19, font: 'script', ink: 'iron', align: 'center' });
    }
    rects.push({ id: `room-${p.id}`, x: cx, y: cy, w: cw, h: CELL_H });
  });

  // Today's record: three figures over their labels; the day count cools to stone until you answer today.
  const foot = top - 1.68 - gridH - 0.14;
  items.push({ kind: 'rule', y: foot, x0: -X, x1: X });
  const colX = landscape ? [-1.6, 0, 1.6] : [-0.92, 0, 0.92];
  const cols: [string, string, 'ink' | 'quiet'][] = [
    ['Answered', String(fig.answered), 'ink'],
    ['Best run', String(fig.bestRun), 'ink'],
    ['Days', String(fig.days), fig.warm ? 'ink' : 'quiet'],
  ];
  cols.forEach(([label, value, ink], i) => {
    items.push(
      { kind: 'text', text: value, x: colX[i]!, y: foot - 0.45, size: 0.36, font: 'figures', ink, align: 'center' },
      { kind: 'text', text: label, x: colX[i]!, y: foot - 0.73, size: 0.16, font: 'smcp', ink: 'soft', align: 'center' },
    );
  });
  if (fig.record) items.push({ kind: 'mark', x: colX[1]! + measure(String(fig.bestRun), 0.36) / 2 + 0.16, y: foot - 0.36, r: 0.05 });
  items.push({ kind: 'text', text: 'Settings', x: 0, y: foot - 1.2, size: 0.24, font: 'smcp', ink: 'soft', align: 'center' });
  rects.push({ id: 'settings', x: 0, y: foot - 1.12, w: 1.3, h: 0.46 });
  return { key: `hub-${landscape ? 'l' : 'p'}`, width: shape.width, height, items, rects, monogram: true, solo: true };
}

/** The hub: every room on one card on the desk, the day's record at its foot. Nothing is locked. */
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
    <SheetLayer geom={geom} controls={controls} testId="hub" label="Palace: the rooms">
      <h2>Palace</h2>
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
