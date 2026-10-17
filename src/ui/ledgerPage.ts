import { type SheetGeom, type SheetItem, type SheetRect, SHEET_WIDTH } from './sheet';

const HEIGHT = 7.6;
const X = 1.2;
/** Wax seal centre: below the controls' rects (which end at y = −2.79), clear of the page edge. */
export const LEDGER_SEAL = { x: -0.45, y: -3.2 };
/** The money column's double rule: entries to its left, figures to its right. */
const COLUMN_X = 0.3;
const ROW = 0.46;

export interface LedgerPageInput {
  /** The sheet's key (a new key slides a fresh page in). */
  key: string;
  /** The room's name, for the running head ("Palace · Echo"). */
  room: string;
  /** Today's date, written out. */
  today: string;
  /** The sitting's headline figure ("84%", "7", or a dash when nothing was answered). */
  figure: string;
  caption: string;
  /** The sitting's entries: what was done, and its figure. */
  rows: [string, string][];
  /** "Stage", "Stage · mastered" or "Mastered". */
  stageLabel: string;
  stageName: string;
  /** The stage is over its bar: a gilt mark beside it. */
  mastered: boolean;
  /** 0–1 towards the stage's bar. */
  toward: number;
}

/**
 * The page that closes a sitting, kept like an account book: a printed head, today's figures
 * written by hand in iron-gall on blue ruling, an oxblood money column, the stage's bar, and
 * Again and Leave above the seal. Every room's end-of-sitting sheet is this page.
 */
export function ledgerPage(p: LedgerPageInput): SheetGeom {
  const rowsTop = -0.05;
  const rowsBottom = rowsTop - ROW * p.rows.length;
  const items: SheetItem[] = [
    { kind: 'text', text: `Palace · ${p.room}`, x: 0, y: 2.75, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
    { kind: 'text', text: 'Today', x: 0, y: 2.2, size: 0.54, font: 'italic', ink: 'gilt', align: 'center' },
    // The date in a fine hand, with air above (clear of the descenders) and below (clear of the rule).
    { kind: 'text', text: p.today, x: 0, y: 1.72, size: 0.27, font: 'script', ink: 'iron', align: 'center' },
    { kind: 'rule', y: 1.42, x0: -X, x1: X, weight: 'double' },
    // The day's figure, written large, and what it counts in print beneath.
    { kind: 'text', text: p.figure, x: 0, y: 0.7, size: 0.78, font: 'script', ink: 'iron', align: 'center', tilt: 2 },
    { kind: 'text', text: p.caption, x: 0, y: 0.26, size: 0.18, font: 'italic', ink: 'soft', align: 'center' },
    { kind: 'rule', y: rowsTop, x0: -X, x1: X, weight: 'ledger' },
    { kind: 'column', x: COLUMN_X, y0: rowsTop + 0.12, y1: rowsBottom, double: true },
  ];
  p.rows.forEach(([k, v], i) => {
    const base = rowsTop - ROW * i - 0.32;
    items.push(
      { kind: 'text', text: k, x: -X, y: base, size: 0.22, font: 'script', ink: 'iron' },
      { kind: 'text', text: v, x: X - 0.04, y: base, size: 0.28, font: 'script', ink: 'iron', align: 'right' },
      { kind: 'rule', y: rowsTop - ROW * (i + 1), x0: -X, x1: X, weight: 'ledger' },
    );
  });
  items.push(
    { kind: 'text', text: p.stageLabel, x: -X, y: -1.78, size: 0.18, font: 'smcp', ink: 'soft' },
    { kind: 'text', text: p.stageName, x: -X, y: -2.04, size: 0.2, font: 'italic' },
    ...(p.mastered ? [{ kind: 'mark' as const, x: X - 0.06, y: -1.84, r: 0.06 }] : []),
    { kind: 'bar', y: -2.2, x0: -X, x1: X, fill: p.toward },
    { kind: 'text', text: 'Again', x: -0.72, y: -2.62, size: 0.27, font: 'smcp', align: 'center' },
    { kind: 'text', text: 'Leave', x: 0.72, y: -2.62, size: 0.27, font: 'smcp', ink: 'quiet', align: 'center' },
    // Seal and signature share a line under the controls, centred as a pair.
    { kind: 'text', text: 'Palace', x: LEDGER_SEAL.x + 0.5, y: LEDGER_SEAL.y - 0.08, size: 0.3, font: 'script', ink: 'iron', align: 'left', tilt: 3 },
  );
  const rects: SheetRect[] = [
    { id: 'again', x: -0.72, y: -2.54, w: 1.0, h: 0.5 },
    { id: 'leave', x: 0.72, y: -2.54, w: 1.0, h: 0.5 },
  ];
  return { key: p.key, width: SHEET_WIDTH, height: HEIGHT, items, rects, monogram: true, seal: LEDGER_SEAL };
}
