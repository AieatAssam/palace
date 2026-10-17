import { useMemo } from 'react';
import { type ModeId, modeInfo } from '../modes/catalog';
import { usePalace } from '../store';
import { SheetLayer } from './SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH } from './sheet';

const HEIGHT = 5.5;
const TOP = HEIGHT / 2;
const X = 1.2;

/** A room not yet built: its plate turned over, saying what it will train. */
export function Workshop({ id }: { id: ModeId }) {
  const close = usePalace((s) => s.closeWorkshop);
  const m = modeInfo(id);

  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: `Room ${m.numeral}`, x: 0, y: TOP - 0.55, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: m.title, x: 0, y: TOP - 1.1, size: 0.5, font: 'italic', ink: 'gilt', align: 'center' },
      { kind: 'emblem', shape: m.emblem, x: 0, y: TOP - 1.62, size: 0.56 },
      { kind: 'text', text: 'In the workshop', x: 0, y: TOP - 2.32, size: 0.32, font: 'script', ink: 'iron', align: 'center', tilt: 2 },
      { kind: 'rule', y: TOP - 2.56, x0: -X, x1: X, weight: 'double' },
      { kind: 'text', text: m.pitch, x: 0, y: TOP - 2.8, size: 0.21, align: 'center', maxWidth: 2.3, lineHeight: 1.3 },
      { kind: 'rule', y: TOP - 3.86, x0: -X, x1: X },
      { kind: 'text', text: 'Trains', x: -X, y: TOP - 4.16, size: 0.17, font: 'smcp', ink: 'soft' },
      { kind: 'text', text: m.trains, x: X, y: TOP - 4.16, size: 0.2, font: 'italic', align: 'right' },
      { kind: 'text', text: 'Back', x: 0, y: TOP - 4.82, size: 0.27, font: 'smcp', align: 'center' },
    ];
    const rects: SheetRect[] = [{ id: 'back', x: 0, y: TOP - 4.74, w: 1.1, h: 0.5 }];
    return { key: `workshop-${id}`, width: SHEET_WIDTH, height: HEIGHT, items, rects, solo: true };
  }, [id, m]);

  return (
    <SheetLayer
      geom={geom}
      controls={[{ id: 'back', testId: 'workshop-back', label: 'Back to the rooms', onActivate: close, autoFocus: true }]}
      testId="workshop"
      label={`${m.title}, in the workshop`}
      onEscape={close}
      onBackdrop={close}
    >
      <h2>{m.title}</h2>
      <p>In the workshop.</p>
      <p>{m.pitch}</p>
      <p>Trains: {m.trains}</p>
    </SheetLayer>
  );
}
