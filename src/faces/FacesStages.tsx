import { useMemo } from 'react';
import { usePalace } from '../store';
import { SheetLayer, type SheetControl } from '../ui/SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH, measure } from '../ui/sheet';
import { FACES_STAGES, facesMastered, facesProgress } from './logic';
import { useFaces } from './store';

const ROW = 0.74;
const HEAD = 1.98;
const FOOT = 1.64;
const HEIGHT = HEAD + ROW * FACES_STAGES.length + FOOT;
const TOP = HEIGHT / 2;
const X = 1.2;

/**
 * Faces' stage card: every stage on one page, each with the faces known against its cast.
 * A gilt rosette marks a stage with every face known, a brass frame the one on the desk.
 * Every stage is open.
 */
export function FacesStages() {
  const deck = useFaces((s) => s.deck);
  const current = useFaces((s) => s.stageId);
  const choose = useFaces((s) => s.chooseStage);
  const close = usePalace((s) => s.closeStages);
  const currentStage = FACES_STAGES.find((s) => s.id === current)!;
  const progress = useMemo(() => new Map(FACES_STAGES.map((s) => [s.id, facesProgress(s, deck)])), [deck]);
  const now = progress.get(current)!;
  const nowLine = `${currentStage.title} · ${now.known} of ${now.total} known`;
  const tally = `${facesMastered(deck)} of ${FACES_STAGES.length} mastered`;
  const marks = FACES_STAGES.map((s) => `${progress.get(s.id)!.known}`).join(',');

  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'Palace · Faces', x: 0, y: TOP - 0.55, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: 'Stages', x: 0, y: TOP - 1.08, size: 0.5, font: 'italic', ink: 'gilt', align: 'center' },
      { kind: 'text', text: 'Meet the sitters, then name them.', x: 0, y: TOP - 1.5, size: 0.17, font: 'italic', ink: 'soft', align: 'center' },
      { kind: 'rule', y: TOP - 1.76, x0: -X, x1: X, weight: 'double' },
    ];
    const rects: SheetRect[] = [];
    FACES_STAGES.forEach((stage, i) => {
      const cy = TOP - HEAD - ROW * i - ROW / 2;
      const p = progress.get(stage.id)!;
      const fig = `${p.known} / ${p.total}`;
      items.push(
        { kind: 'text', text: stage.short, x: -X + 0.08, y: cy + 0.04, size: 0.22, ink: p.mastered ? 'gilt' : 'ink', label: true },
        { kind: 'text', text: stage.note, x: -X + 0.08, y: cy - 0.2, size: 0.15, font: 'italic', ink: 'soft' },
        { kind: 'text', text: fig, x: X - 0.08, y: cy + 0.02, size: 0.24, font: 'figures', ink: p.known ? 'ink' : 'quiet', align: 'right' },
        { kind: 'bar', y: cy - 0.16, x0: X - 0.62, x1: X - 0.08, fill: p.toward },
      );
      if (p.mastered) items.push({ kind: 'mark', x: X - 0.08 - measure(fig, 0.24, 'figures') - 0.1, y: cy + 0.09, r: 0.05 });
      if (stage.id === current) items.push({ kind: 'box', x: 0, y: cy - 0.02, w: 2 * X + 0.02, h: ROW - 0.06 });
      if (i < FACES_STAGES.length - 1) items.push({ kind: 'rule', y: cy - ROW / 2, x0: -X + 0.08, x1: X - 0.08 });
      rects.push({ id: `faces-stage-${stage.id}`, x: 0, y: cy - 0.02, w: 2 * X, h: ROW - 0.04 });
    });
    const foot = TOP - HEAD - ROW * FACES_STAGES.length;
    items.push({ kind: 'rule', y: foot - 0.02, x0: -X, x1: X });
    items.push({ kind: 'text', text: nowLine, x: 0, y: foot - 0.34, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    const tallyW = measure(tally, 0.17);
    items.push({ kind: 'mark', x: -tallyW / 2 - 0.02, y: foot - 0.64 + 0.055, r: 0.05 });
    items.push({ kind: 'text', text: tally, x: 0.08, y: foot - 0.64, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    items.push({ kind: 'text', text: 'Done', x: 0, y: foot - 1.12, size: 0.3, font: 'smcp', align: 'center' });
    rects.push({ id: 'done', x: 0, y: foot - 1.03, w: 1.2, h: 0.5 });
    return { key: 'faces-stages', width: SHEET_WIDTH, height: HEIGHT, items, rects, solo: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, marks, nowLine, tally]);

  const controls: SheetControl[] = [
    ...FACES_STAGES.map((stage) => {
      const p = progress.get(stage.id)!;
      return {
        id: `faces-stage-${stage.id}`,
        testId: `faces-stage-${stage.id}`,
        label: `${stage.short}, ${stage.note.toLowerCase()}: ${p.known} of ${p.total} known${p.mastered ? ', mastered' : ''}`,
        current: stage.id === current,
        autoFocus: stage.id === current,
        onActivate: () => choose(stage.id),
      };
    }),
    { id: 'done', testId: 'stages-close', label: 'Done', onActivate: close },
  ];

  return (
    <SheetLayer geom={geom} controls={controls} testId="stages" label="Faces stages" onEscape={close} onBackdrop={close}>
      <h2>Faces stages</h2>
      <p>Meet the sitters, then name them.</p>
      <p>{nowLine}</p>
      <p>{tally}</p>
    </SheetLayer>
  );
}
