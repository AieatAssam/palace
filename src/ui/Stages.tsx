import { useMemo, useState } from 'react';
import { BOOKS, type Book, type Chapter, STAGES, type Stage, bookTitle, stageProgress } from '../game/stages';
import { usePalace } from '../store';
import { SheetLayer, type SheetControl } from './SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH, measure } from './sheet';

const HEIGHT = 7.9;
const TOP = HEIGHT / 2;
const X = 1.2;
const CELL_H = 0.6;
const ROW = 1.02;

/** The card's rows: a chapter heading over a run of stage cells. */
const ROWS: { title: string; chapters: Chapter[] }[] = [
  { title: 'One string', chapters: ['string'] },
  { title: 'Two strings', chapters: ['pair'] },
  { title: 'The neck, by fret', chapters: ['neck'] },
  { title: 'Whole neck', chapters: ['octave', 'find'] },
];

function cellLabel(stage: Stage) {
  return `${stage.title}, ${bookTitle(stage.book).toLowerCase()}`;
}

/**
 * The stage card: every stage of the syllabus on one ledger page, laid on the desk.
 * Two books (naturals, then sharps and flats); a gilt rosette marks a mastered stage,
 * a brass frame the one in play. Choosing a cell puts that stage on the neck.
 */
export function Stages() {
  const deck = usePalace((s) => s.saved.deck);
  const current = usePalace((s) => s.saved.stageId);
  const choose = usePalace((s) => s.chooseStage);
  const close = usePalace((s) => s.closeStages);
  const currentStage = STAGES.find((s) => s.id === current)!;
  const [book, setBook] = useState<Book>(currentStage.book);

  const progress = useMemo(() => new Map(STAGES.map((s) => [s.id, stageProgress(s, deck)])), [deck]);
  const masteredCount = STAGES.filter((s) => progress.get(s.id)!.mastered).length;
  const now = progress.get(current)!;
  const nowLine = `${cellLabel(currentStage)} · ${now.sure} of ${now.total} sure`;
  const tally = `${masteredCount} of ${STAGES.length} mastered`;
  /** Drawn state only: what changes the picture. */
  const marks = STAGES.map((s) => {
    const p = progress.get(s.id)!;
    return `${p.mastered ? 1 : 0}${Math.round(p.toward * 20)}`;
  }).join('');

  const layout = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'Palace · Fretboard', x: 0, y: TOP - 0.55, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: 'Stages', x: 0, y: TOP - 1.08, size: 0.5, font: 'italic', ink: 'gilt', align: 'center' },
    ];
    const rects: SheetRect[] = [];
    const cells: { stage: Stage; id: string }[] = [];

    // The two books, as a pair of choices.
    const bookY = TOP - 1.56;
    BOOKS.forEach((b, i) => {
      const cx = i === 0 ? -0.62 : 0.6;
      const chosen = b.id === book;
      items.push({ kind: 'text', text: b.title, x: cx, y: bookY, size: 0.2, ink: chosen ? 'ink' : 'quiet', align: 'center' });
      if (chosen) items.push({ kind: 'lozenge', x: cx - measure(b.title, 0.2) / 2 - 0.1, y: bookY + 0.065 });
      rects.push({ id: `book-${b.id}`, x: cx, y: bookY + 0.06, w: 1.1, h: 0.46 });
    });
    items.push({ kind: 'rule', y: TOP - 1.86, x0: -X, x1: X, weight: 'double' });

    ROWS.forEach((row, r) => {
      const top = TOP - 2.08 - ROW * r;
      items.push({ kind: 'text', text: row.title, x: -X, y: top - 0.14, size: 0.16, font: 'smcp', ink: 'soft' });
      const stages = STAGES.filter((s) => s.book === book && row.chapters.includes(s.chapter));
      const cw = (2 * X) / stages.length;
      const cy = top - 0.26 - CELL_H / 2;
      stages.forEach((stage, i) => {
        const cx = -X + cw * (i + 0.5);
        const p = progress.get(stage.id)!;
        const size = stage.chapter === 'pair' ? 0.22 : 0.24;
        items.push({ kind: 'text', text: stage.short, x: cx, y: cy - 0.01, size, ink: p.mastered ? 'gilt' : 'ink', align: 'center' });
        // Mastery: a short gilt-on-hairline bar under the label.
        const bw = Math.min(0.3, cw * 0.55);
        items.push({ kind: 'bar', y: cy - 0.15, x0: cx - bw / 2, x1: cx + bw / 2, fill: p.toward });
        // Mastered: a gilt rosette over the label.
        if (p.mastered) items.push({ kind: 'mark', x: cx, y: cy + 0.2, r: 0.05 });
        if (stage.id === current) items.push({ kind: 'box', x: cx, y: cy + 0.02, w: cw - 0.06, h: CELL_H - 0.04 });
        const id = `stage-${stage.id}`;
        rects.push({ id, x: cx, y: cy + 0.02, w: cw - 0.02, h: CELL_H });
        cells.push({ stage, id });
      });
    });

    const foot = TOP - 2.08 - ROW * ROWS.length;
    items.push({ kind: 'rule', y: foot + 0.02, x0: -X, x1: X });
    items.push({ kind: 'text', text: nowLine, x: 0, y: foot - 0.3, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    const tallyW = measure(tally, 0.17);
    items.push({ kind: 'mark', x: -tallyW / 2 - 0.02, y: foot - 0.6 + 0.055, r: 0.05 });
    items.push({ kind: 'text', text: tally, x: 0.08, y: foot - 0.6, size: 0.17, font: 'italic', ink: 'soft', align: 'center' });
    items.push({ kind: 'text', text: 'Done', x: 0, y: foot - 1.08, size: 0.3, font: 'smcp', align: 'center' });
    rects.push({ id: 'done', x: 0, y: foot - 0.99, w: 1.2, h: 0.5 });
    return { geom: { key: 'stages', width: SHEET_WIDTH, height: HEIGHT, items, rects, solo: true }, cells };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, current, marks, nowLine, tally]);

  const controls: SheetControl[] = [
    ...BOOKS.map((b) => ({
      id: `book-${b.id}`,
      testId: `book-${b.id}`,
      label: b.title,
      group: 'book',
      groupLabel: 'Book',
      checked: b.id === book,
      onActivate: () => setBook(b.id),
    })),
    ...layout.cells.map(({ stage, id }) => {
      const p = progress.get(stage.id)!;
      return {
        id,
        testId: id,
        label: `${cellLabel(stage)}: ${p.sure} of ${p.total} sure${p.mastered ? ', mastered' : ''}`,
        current: stage.id === current,
        autoFocus: stage.id === current,
        onActivate: () => choose(stage.id),
      };
    }),
    { id: 'done', testId: 'stages-close', label: 'Done', onActivate: close, autoFocus: currentStage.book !== book },
  ];

  return (
    <SheetLayer geom={layout.geom} controls={controls} testId="stages" label="Stages" onEscape={close} onBackdrop={close}>
      <h2>Stages</h2>
      <p>{nowLine}</p>
      <p>{tally}</p>
    </SheetLayer>
  );
}
