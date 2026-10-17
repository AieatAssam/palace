import { useMemo } from 'react';
import { usePalace } from '../store';
import { SheetLayer, type SheetControl } from '../ui/SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH, measure } from '../ui/sheet';
import { BLOCKS_STAGES, bestSpan, blocksMastered, blocksProgress } from './logic';
import { useBlocks } from './store';

const ROW = 0.74;
const HEAD = 1.98;
const FOOT = 1.94;
const HEIGHT = HEAD + ROW * BLOCKS_STAGES.length + FOOT;
const TOP = HEIGHT / 2;
const X = 1.2;

/**
 * Blocks' stage card: every stage on one page, each with the longest line tapped back clean
 * against the line that masters it, and the room's best span each way at the foot. A gilt
 * rosette marks a mastered stage, a brass frame the one on the blotter. Every stage is open.
 */
export function BlocksStages() {
  const record = useBlocks((s) => s.record);
  const current = useBlocks((s) => s.stageId);
  const choose = useBlocks((s) => s.chooseStage);
  const close = usePalace((s) => s.closeStages);
  const currentStage = BLOCKS_STAGES.find((s) => s.id === current)!;
  const progress = useMemo(() => new Map(BLOCKS_STAGES.map((s) => [s.id, blocksProgress(s, record)])), [record]);
  const now = progress.get(current)!;
  const nowLine = `${currentStage.title} · best line ${now.best} of ${now.mastery}`;
  const tally = `${blocksMastered(record)} of ${BLOCKS_STAGES.length} mastered`;
  const spans = `Best span ${bestSpan(record, 'forward')} in order, ${bestSpan(record, 'reverse')} last first`;
  const marks = BLOCKS_STAGES.map((s) => `${progress.get(s.id)!.best}`).join(',');

  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'Palace · Blocks', x: 0, y: TOP - 0.55, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: 'Stages', x: 0, y: TOP - 1.08, size: 0.5, font: 'italic', ink: 'gilt', align: 'center' },
      { kind: 'text', text: 'Watch the line, then tap it back.', x: 0, y: TOP - 1.5, size: 0.17, font: 'italic', ink: 'soft', align: 'center' },
      { kind: 'rule', y: TOP - 1.76, x0: -X, x1: X, weight: 'double' },
    ];
    const rects: SheetRect[] = [];
    BLOCKS_STAGES.forEach((stage, i) => {
      const cy = TOP - HEAD - ROW * i - ROW / 2;
      const p = progress.get(stage.id)!;
      items.push(
        { kind: 'text', text: stage.short, x: -X + 0.08, y: cy + 0.04, size: 0.22, ink: p.mastered ? 'gilt' : 'ink', label: true },
        { kind: 'text', text: stage.note, x: -X + 0.08, y: cy - 0.2, size: 0.15, font: 'italic', ink: 'soft' },
        { kind: 'text', text: `${p.best} / ${p.mastery}`, x: X - 0.08, y: cy + 0.02, size: 0.24, font: 'figures', ink: p.best ? 'ink' : 'quiet', align: 'right' },
        { kind: 'bar', y: cy - 0.16, x0: X - 0.62, x1: X - 0.08, fill: p.toward },
      );
      if (p.mastered) items.push({ kind: 'mark', x: X - 0.08 - measure(`${p.best} / ${p.mastery}`, 0.24, 'figures') - 0.1, y: cy + 0.09, r: 0.05 });
      if (stage.id === current) items.push({ kind: 'box', x: 0, y: cy - 0.02, w: 2 * X + 0.02, h: ROW - 0.06 });
      if (i < BLOCKS_STAGES.length - 1) items.push({ kind: 'rule', y: cy - ROW / 2, x0: -X + 0.08, x1: X - 0.08 });
      rects.push({ id: `blocks-stage-${stage.id}`, x: 0, y: cy - 0.02, w: 2 * X, h: ROW - 0.04 });
    });
    const foot = TOP - HEAD - ROW * BLOCKS_STAGES.length;
    items.push({ kind: 'rule', y: foot - 0.02, x0: -X, x1: X });
    items.push({ kind: 'text', text: nowLine, x: 0, y: foot - 0.34, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    items.push({ kind: 'text', text: spans, x: 0, y: foot - 0.64, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    const tallyW = measure(tally, 0.17);
    items.push({ kind: 'mark', x: -tallyW / 2 - 0.02, y: foot - 0.94 + 0.055, r: 0.05 });
    items.push({ kind: 'text', text: tally, x: 0.08, y: foot - 0.94, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    items.push({ kind: 'text', text: 'Done', x: 0, y: foot - 1.42, size: 0.3, font: 'smcp', align: 'center' });
    rects.push({ id: 'done', x: 0, y: foot - 1.33, w: 1.2, h: 0.5 });
    return { key: 'blocks-stages', width: SHEET_WIDTH, height: HEIGHT, items, rects, solo: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, marks, nowLine, tally, spans]);

  const controls: SheetControl[] = [
    ...BLOCKS_STAGES.map((stage) => {
      const p = progress.get(stage.id)!;
      return {
        id: `blocks-stage-${stage.id}`,
        testId: `blocks-stage-${stage.id}`,
        label: `${stage.short}, ${stage.note.toLowerCase()}: best line ${p.best} of ${p.mastery}${p.mastered ? ', mastered' : ''}`,
        current: stage.id === current,
        autoFocus: stage.id === current,
        onActivate: () => choose(stage.id),
      };
    }),
    { id: 'done', testId: 'stages-close', label: 'Done', onActivate: close },
  ];

  return (
    <SheetLayer geom={geom} controls={controls} testId="stages" label="Blocks stages" onEscape={close} onBackdrop={close}>
      <h2>Blocks stages</h2>
      <p>Watch the line, then tap it back.</p>
      <p>{nowLine}</p>
      <p>{spans}</p>
      <p>{tally}</p>
    </SheetLayer>
  );
}
