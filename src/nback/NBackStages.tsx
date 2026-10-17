import { useMemo } from 'react';
import { usePalace } from '../store';
import { SheetLayer, type SheetControl } from '../ui/SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH, measure } from '../ui/sheet';
import { NBACK_STAGES, nbackMastered, nbackProgress } from './logic';
import { useNBack } from './store';

const ROW = 1.1;
const HEAD = 1.98;
const FOOT = 1.94;
const HEIGHT = HEAD + ROW * NBACK_STAGES.length + FOOT;
const TOP = HEIGHT / 2;
const X = 1.4;

/**
 * N-Back's stage card: every stage on one page, each with how to play it (a worked example
 * last) and its best score against the score that masters it. A gilt rosette marks a mastered stage, a brass frame the one on the tray.
 * Every stage is open.
 */
export function NBackStages() {
  const record = useNBack((s) => s.record);
  const current = useNBack((s) => s.stageId);
  const choose = useNBack((s) => s.chooseStage);
  const close = usePalace((s) => s.closeStages);
  const currentStage = NBACK_STAGES.find((s) => s.id === current)!;
  const progress = useMemo(() => new Map(NBACK_STAGES.map((s) => [s.id, nbackProgress(s, record)])), [record]);
  const now = progress.get(current)!;
  const nowLine = `${currentStage.title} · best ${now.best} of ${now.mastery}`;
  const tally = `${nbackMastered(record)} of ${NBACK_STAGES.length} mastered`;
  const spans = 'Misses and wrong presses lower your score';
  const marks = NBACK_STAGES.map((s) => `${progress.get(s.id)!.best}`).join(',');

  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'Palace · N-Back', x: 0, y: TOP - 0.55, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: 'Stages', x: 0, y: TOP - 1.08, size: 0.5, font: 'italic', ink: 'gilt', align: 'center' },
      { kind: 'text', text: 'Each turn, one square on the tray lights up.', x: 0, y: TOP - 1.5, size: 0.17, font: 'italic', ink: 'soft', align: 'center' },
      { kind: 'rule', y: TOP - 1.76, x0: -X, x1: X, weight: 'double' },
    ];
    const rects: SheetRect[] = [];
    NBACK_STAGES.forEach((stage, i) => {
      const cy = TOP - HEAD - ROW * i - ROW / 2;
      const p = progress.get(stage.id)!;
      items.push(
        { kind: 'text', text: stage.short, x: -X + 0.08, y: cy + 0.3, size: 0.22, ink: p.mastered ? 'gilt' : 'ink', label: true },
        ...stage.how.map((line, j): SheetItem => ({ kind: 'text', text: line, x: -X + 0.08, y: cy + 0.04 - 0.2 * j, size: 0.13, font: 'italic', ink: 'soft' })),
        { kind: 'text', text: `${p.best} / ${p.mastery}`, x: X - 0.08, y: cy + 0.3, size: 0.24, font: 'figures', ink: p.best ? 'ink' : 'quiet', align: 'right' },
        { kind: 'bar', y: cy + 0.2, x0: X - 0.62, x1: X - 0.08, fill: p.toward },
      );
      if (p.mastered) items.push({ kind: 'mark', x: X - 0.08 - measure(`${p.best} / ${p.mastery}`, 0.24, 'figures') - 0.1, y: cy + 0.37, r: 0.05 });
      if (stage.id === current) items.push({ kind: 'box', x: 0, y: cy - 0.02, w: 2 * X + 0.02, h: ROW - 0.06 });
      if (i < NBACK_STAGES.length - 1) items.push({ kind: 'rule', y: cy - ROW / 2, x0: -X + 0.08, x1: X - 0.08 });
      rects.push({ id: `nback-stage-${stage.id}`, x: 0, y: cy - 0.02, w: 2 * X, h: ROW - 0.04 });
    });
    const foot = TOP - HEAD - ROW * NBACK_STAGES.length;
    items.push({ kind: 'rule', y: foot - 0.02, x0: -X, x1: X });
    items.push({ kind: 'text', text: nowLine, x: 0, y: foot - 0.34, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    items.push({ kind: 'text', text: spans, x: 0, y: foot - 0.64, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    const tallyW = measure(tally, 0.17);
    items.push({ kind: 'mark', x: -tallyW / 2 - 0.02, y: foot - 0.94 + 0.055, r: 0.05 });
    items.push({ kind: 'text', text: tally, x: 0.08, y: foot - 0.94, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    items.push({ kind: 'text', text: 'Done', x: 0, y: foot - 1.42, size: 0.3, font: 'smcp', align: 'center' });
    rects.push({ id: 'done', x: 0, y: foot - 1.33, w: 1.2, h: 0.5 });
    return { key: 'nback-stages', width: SHEET_WIDTH, height: HEIGHT, items, rects, solo: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, marks, nowLine, tally, spans]);

  const controls: SheetControl[] = [
    ...NBACK_STAGES.map((stage) => {
      const p = progress.get(stage.id)!;
      return {
        id: `nback-stage-${stage.id}`,
        testId: `nback-stage-${stage.id}`,
        label: `${stage.short}: ${stage.how.join(' ')} Best ${p.best} of ${p.mastery}${p.mastered ? ', mastered' : ''}.`,
        current: stage.id === current,
        autoFocus: stage.id === current,
        onActivate: () => choose(stage.id),
      };
    }),
    { id: 'done', testId: 'stages-close', label: 'Done', onActivate: close },
  ];

  return (
    <SheetLayer geom={geom} controls={controls} testId="stages" label="N-Back stages" onEscape={close} onBackdrop={close}>
      <h2>N-Back stages</h2>
      <p>Each turn, one square on the tray lights up.</p>
      <p>{nowLine}</p>
      <p>{spans}</p>
      <p>{tally}</p>
    </SheetLayer>
  );
}
