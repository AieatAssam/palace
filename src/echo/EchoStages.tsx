import { useMemo } from 'react';
import { usePalace } from '../store';
import { SheetLayer, type SheetControl } from '../ui/SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH, measure } from '../ui/sheet';
import { ECHO_STAGES, echoProgress } from './logic';
import { echoMastered, useEcho } from './store';

const ROW = 0.74;
const HEAD = 1.98;
const FOOT = 1.62;
const HEIGHT = HEAD + ROW * ECHO_STAGES.length + FOOT;
const TOP = HEIGHT / 2;
const X = 1.2;

/**
 * Echo's stage card: every stage on one page, each with the longest line rung clean against
 * the line that masters it. A gilt rosette marks a mastered stage, a brass frame the one on
 * the bells. Every stage is open.
 */
export function EchoStages() {
  const record = useEcho((s) => s.record);
  const current = useEcho((s) => s.stageId);
  const choose = useEcho((s) => s.chooseStage);
  const close = usePalace((s) => s.closeStages);
  const currentStage = ECHO_STAGES.find((s) => s.id === current)!;
  const progress = useMemo(() => new Map(ECHO_STAGES.map((s) => [s.id, echoProgress(s, record)])), [record]);
  const now = progress.get(current)!;
  const nowLine = `${currentStage.title} · best line ${now.best} of ${now.mastery}`;
  const tally = `${echoMastered(record)} of ${ECHO_STAGES.length} mastered`;
  const marks = ECHO_STAGES.map((s) => `${progress.get(s.id)!.best}`).join(',');

  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'Palace · Echo', x: 0, y: TOP - 0.55, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: 'Stages', x: 0, y: TOP - 1.08, size: 0.5, font: 'italic', ink: 'gilt', align: 'center' },
      { kind: 'text', text: 'Watch, listen, ring the line back.', x: 0, y: TOP - 1.5, size: 0.17, font: 'italic', ink: 'soft', align: 'center' },
      { kind: 'rule', y: TOP - 1.76, x0: -X, x1: X, weight: 'double' },
    ];
    const rects: SheetRect[] = [];
    ECHO_STAGES.forEach((stage, i) => {
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
      if (i < ECHO_STAGES.length - 1) items.push({ kind: 'rule', y: cy - ROW / 2, x0: -X + 0.08, x1: X - 0.08 });
      rects.push({ id: `echo-stage-${stage.id}`, x: 0, y: cy - 0.02, w: 2 * X, h: ROW - 0.04 });
    });
    const foot = TOP - HEAD - ROW * ECHO_STAGES.length;
    items.push({ kind: 'rule', y: foot - 0.02, x0: -X, x1: X });
    items.push({ kind: 'text', text: nowLine, x: 0, y: foot - 0.34, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    const tallyW = measure(tally, 0.17);
    items.push({ kind: 'mark', x: -tallyW / 2 - 0.02, y: foot - 0.64 + 0.055, r: 0.05 });
    items.push({ kind: 'text', text: tally, x: 0.08, y: foot - 0.64, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    items.push({ kind: 'text', text: 'Done', x: 0, y: foot - 1.12, size: 0.3, font: 'smcp', align: 'center' });
    rects.push({ id: 'done', x: 0, y: foot - 1.03, w: 1.2, h: 0.5 });
    return { key: 'echo-stages', width: SHEET_WIDTH, height: HEIGHT, items, rects, solo: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, marks, nowLine, tally]);

  const controls: SheetControl[] = [
    ...ECHO_STAGES.map((stage) => {
      const p = progress.get(stage.id)!;
      return {
        id: `echo-stage-${stage.id}`,
        testId: `echo-stage-${stage.id}`,
        label: `${stage.short}, ${stage.note.toLowerCase()}: best line ${p.best} of ${p.mastery}${p.mastered ? ', mastered' : ''}`,
        current: stage.id === current,
        autoFocus: stage.id === current,
        onActivate: () => choose(stage.id),
      };
    }),
    { id: 'done', testId: 'stages-close', label: 'Done', onActivate: close },
  ];

  return (
    <SheetLayer geom={geom} controls={controls} testId="stages" label="Echo stages" onEscape={close} onBackdrop={close}>
      <h2>Echo stages</h2>
      <p>Watch, listen, ring the line back.</p>
      <p>{nowLine}</p>
      <p>{tally}</p>
    </SheetLayer>
  );
}
