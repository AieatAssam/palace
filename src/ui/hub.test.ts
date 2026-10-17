import { describe, expect, it } from 'vitest';
import { MODES } from '../modes/catalog';
import { type HubFigures, type HubPlate, hubLayout } from './Hub';
import type { SheetDoor, SheetItem, SheetRect, SheetWall } from './sheet';

const figures: HubFigures = { answered: 3, bestRun: 2, days: 1, warm: true, record: false };

function platesFor(open: (id: string) => boolean = () => true): HubPlate[] {
  return MODES.map((m) => ({
    id: m.id,
    numeral: m.numeral,
    title: m.title,
    open: open(m.id),
    status: open(m.id) ? '0 of 6 mastered' : '',
    toward: 0.25,
  }));
}

function overlaps(a: SheetRect, b: SheetRect) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

function insideCard(x: number, y: number, width: number, height: number) {
  return Math.abs(x) <= width / 2 + 1e-9 && Math.abs(y) <= height / 2 + 1e-9;
}

function rectInside(r: SheetRect, width: number, height: number) {
  return Math.abs(r.x) + r.w / 2 <= width / 2 + 1e-9 && Math.abs(r.y) + r.h / 2 <= height / 2 + 1e-9;
}

describe.each([
  ['landscape', true],
  ['portrait', false],
])('hubLayout (%s)', (_name, landscape) => {
  const geom = hubLayout(landscape, platesFor(), figures);
  const rooms = MODES.map((m) => `room-${m.id}`);
  const rects = geom.rects.filter((r) => rooms.includes(r.id));
  const doors = geom.items.filter((i): i is SheetDoor => i.kind === 'door');
  const walls = geom.items.filter((i): i is SheetWall => i.kind === 'wall');

  it('draws one rect per room plus the settings rect', () => {
    for (const id of rooms) {
      expect(geom.rects.filter((r) => r.id === id)).toHaveLength(1);
    }
    expect(geom.rects.filter((r) => r.id === 'settings')).toHaveLength(1);
    expect(geom.rects).toHaveLength(rooms.length + 1);
  });

  it('keeps room rects apart from each other', () => {
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i]!, rects[j]!), `${rects[i]!.id} vs ${rects[j]!.id}`).toBe(false);
      }
    }
  });

  it('keeps every rect inside the card', () => {
    for (const r of geom.rects) {
      expect(rectInside(r, geom.width, geom.height), r.id).toBe(true);
    }
  });

  it('makes each room at least 1.0 by 1.0 card units (a tap target)', () => {
    for (const r of rects) {
      expect(r.w, r.id).toBeGreaterThanOrEqual(1.0);
      expect(r.h, r.id).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('draws six chambers and six doors, none locked when all plates are open', () => {
    expect(geom.items.filter((i) => i.kind === 'chamber')).toHaveLength(6);
    expect(doors).toHaveLength(6);
    expect(doors.some((d) => d.locked)).toBe(false);
  });

  it('never lets a wall run through a doorway', () => {
    for (const d of doors) {
      const along = d.axis === 'h' ? walls.filter((w) => w.y0 === w.y1 && w.y0 === d.y) : walls.filter((w) => w.x0 === w.x1 && w.x0 === d.x);
      for (const w of along) {
        if (d.axis === 'h') {
          expect(Math.min(w.x0, w.x1) < d.x && d.x < Math.max(w.x0, w.x1), `door at ${d.x},${d.y}`).toBe(false);
        } else {
          expect(Math.min(w.y0, w.y1) < d.y && d.y < Math.max(w.y0, w.y1), `door at ${d.x},${d.y}`).toBe(false);
        }
      }
    }
  });

  it('keeps every positioned item inside the card', () => {
    const positioned = geom.items.filter(
      (i): i is Extract<SheetItem, { x: number; y: number }> => ['text', 'chamber', 'door', 'lozenge', 'mark'].includes(i.kind),
    );
    expect(positioned.length).toBeGreaterThan(0);
    for (const i of positioned) {
      expect(insideCard(i.x, i.y, geom.width, geom.height), `${i.kind} ${'text' in i ? i.text : ''}`).toBe(true);
    }
  });

  it('labels each plate title as a control label', () => {
    for (const m of MODES) {
      const t = geom.items.find((i) => i.kind === 'text' && i.text === m.title);
      expect(t, m.title).toBeDefined();
      expect(t && 'label' in t && t.label).toBe(true);
    }
  });

  it('draws the record as three script figures, with no mark unless it is a record', () => {
    for (const v of ['3', '2', '1']) {
      const t = geom.items.find((i) => i.kind === 'text' && i.text === v);
      expect(t, v).toBeDefined();
      expect(t && 'font' in t && t.font).toBe('script');
    }
    expect(geom.items.some((i) => i.kind === 'mark')).toBe(false);
  });

  it('adds a mark to the record when today is a record', () => {
    const rec = hubLayout(landscape, platesFor(), { ...figures, record: true });
    expect(rec.items.some((i) => i.kind === 'mark')).toBe(true);
  });
});

describe('hubLayout with a workshop room', () => {
  const closed = (id: string) => id !== 'nback';

  it.each([
    ['landscape', true],
    ['portrait', false],
  ])('locks only the closed room (%s)', (_name, landscape) => {
    const geom = hubLayout(landscape, platesFor(closed), figures);
    const doors = geom.items.filter((i): i is SheetDoor => i.kind === 'door');
    expect(doors.filter((d) => d.locked)).toHaveLength(1);
    expect(doors.filter((d) => !d.locked)).toHaveLength(5);

    const rect = geom.rects.find((r) => r.id === 'room-nback')!;
    const chambers = geom.items.filter((i) => i.kind === 'chamber');
    const quiet = chambers.filter((c) => 'quiet' in c && c.quiet);
    expect(quiet).toHaveLength(1);

    const script = geom.items.find((i) => i.kind === 'text' && i.text === 'in the workshop');
    expect(script).toBeDefined();
    expect(script && 'font' in script && script.font).toBe('script');
    if (script && 'x' in script && 'y' in script) {
      expect(Math.abs(script.x - rect.x) <= rect.w / 2).toBe(true);
      expect(Math.abs(script.y - rect.y) <= rect.h / 2).toBe(true);
    }
  });
});
