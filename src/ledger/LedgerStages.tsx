import { useMemo } from 'react';
import { usePalace } from '../store';
import { SheetLayer, type SheetControl } from '../ui/SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH, measure } from '../ui/sheet';
import { LEDGER_STAGES, ledgerMastered, ledgerProgress, longestHeld } from './logic';
import { useLedger } from './store';

const ROW = 0.74;
const HEAD = 1.98;
const FOOT = 1.94;
const HEIGHT = HEAD + ROW * LEDGER_STAGES.length + FOOT;
const TOP = HEIGHT / 2;
const X = 1.2;

/** A stage's standing in words: figures held for a span stage, pegs known for a drill. */
const standing = (kind: string, have: number, need: number) => (kind === 'span' ? `best ${have} of ${need} digits` : `${have} of ${need} learned`);

/**
 * Ledger's stage card: every stage on one page, the span stages with the longest number keyed
 * back clean against the length that masters them, the peg stages with the pegs known. A gilt
 * rosette marks a mastered stage, a brass frame the one open in the ledger. Every stage is open.
 */
export function LedgerStages() {
  const record = useLedger((s) => s.record);
  const current = useLedger((s) => s.stageId);
  const choose = useLedger((s) => s.chooseStage);
  const close = usePalace((s) => s.closeStages);
  const currentStage = LEDGER_STAGES.find((s) => s.id === current)!;
  const progress = useMemo(() => new Map(LEDGER_STAGES.map((s) => [s.id, ledgerProgress(s, record)])), [record]);
  const now = progress.get(current)!;
  const nowLine = `${currentStage.title} · ${standing(currentStage.kind, now.have, now.need)}`;
  const tally = `${ledgerMastered(record)} of ${LEDGER_STAGES.length} mastered`;
  const spans = `Longest number recalled: ${longestHeld(record)} digits`;
  const marks = LEDGER_STAGES.map((s) => `${progress.get(s.id)!.have}`).join(',');

  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'Palace · Ledger', x: 0, y: TOP - 0.55, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: 'Stages', x: 0, y: TOP - 1.08, size: 0.5, font: 'italic', ink: 'gilt', align: 'center' },
      { kind: 'text', text: 'Learn the peg words, then recall long numbers.', x: 0, y: TOP - 1.5, size: 0.17, font: 'italic', ink: 'soft', align: 'center' },
      { kind: 'rule', y: TOP - 1.76, x0: -X, x1: X, weight: 'double' },
    ];
    const rects: SheetRect[] = [];
    LEDGER_STAGES.forEach((stage, i) => {
      const cy = TOP - HEAD - ROW * i - ROW / 2;
      const p = progress.get(stage.id)!;
      items.push(
        { kind: 'text', text: stage.short, x: -X + 0.08, y: cy + 0.04, size: 0.22, ink: p.mastered ? 'gilt' : 'ink', label: true },
        { kind: 'text', text: stage.note, x: -X + 0.08, y: cy - 0.2, size: 0.15, font: 'italic', ink: 'soft' },
        { kind: 'text', text: `${p.have} / ${p.need}`, x: X - 0.08, y: cy + 0.02, size: 0.24, font: 'figures', ink: p.have ? 'ink' : 'quiet', align: 'right' },
        { kind: 'bar', y: cy - 0.16, x0: X - 0.62, x1: X - 0.08, fill: p.toward },
      );
      if (p.mastered) items.push({ kind: 'mark', x: X - 0.08 - measure(`${p.have} / ${p.need}`, 0.24, 'figures') - 0.1, y: cy + 0.09, r: 0.05 });
      if (stage.id === current) items.push({ kind: 'box', x: 0, y: cy - 0.02, w: 2 * X + 0.02, h: ROW - 0.06 });
      if (i < LEDGER_STAGES.length - 1) items.push({ kind: 'rule', y: cy - ROW / 2, x0: -X + 0.08, x1: X - 0.08 });
      rects.push({ id: `ledger-stage-${stage.id}`, x: 0, y: cy - 0.02, w: 2 * X, h: ROW - 0.04 });
    });
    const foot = TOP - HEAD - ROW * LEDGER_STAGES.length;
    items.push({ kind: 'rule', y: foot - 0.02, x0: -X, x1: X });
    items.push({ kind: 'text', text: nowLine, x: 0, y: foot - 0.34, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    items.push({ kind: 'text', text: spans, x: 0, y: foot - 0.64, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    const tallyW = measure(tally, 0.17);
    items.push({ kind: 'mark', x: -tallyW / 2 - 0.02, y: foot - 0.94 + 0.055, r: 0.05 });
    items.push({ kind: 'text', text: tally, x: 0.08, y: foot - 0.94, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    items.push({ kind: 'text', text: 'Done', x: 0, y: foot - 1.42, size: 0.3, font: 'smcp', align: 'center' });
    rects.push({ id: 'done', x: 0, y: foot - 1.33, w: 1.2, h: 0.5 });
    return { key: 'ledger-stages', width: SHEET_WIDTH, height: HEIGHT, items, rects, solo: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, marks, nowLine, tally, spans]);

  const controls: SheetControl[] = [
    ...LEDGER_STAGES.map((stage) => {
      const p = progress.get(stage.id)!;
      return {
        id: `ledger-stage-${stage.id}`,
        testId: `ledger-stage-${stage.id}`,
        label: `${stage.short}, ${stage.note.toLowerCase()}: ${standing(stage.kind, p.have, p.need)}${p.mastered ? ', mastered' : ''}`,
        current: stage.id === current,
        autoFocus: stage.id === current,
        onActivate: () => choose(stage.id),
      };
    }),
    { id: 'done', testId: 'stages-close', label: 'Done', onActivate: close },
  ];

  return (
    <SheetLayer geom={geom} controls={controls} testId="stages" label="Ledger stages" onEscape={close} onBackdrop={close}>
      <h2>Ledger stages</h2>
      <p>Learn the peg words, then recall long numbers.</p>
      <p>{nowLine}</p>
      <p>{spans}</p>
      <p>{tally}</p>
    </SheetLayer>
  );
}
