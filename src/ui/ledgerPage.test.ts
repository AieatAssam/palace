import { describe, expect, it } from 'vitest';
import { LEDGER_SEAL, type LedgerPageInput, ledgerPage } from './ledgerPage';
import type { SheetItem, SheetRect } from './sheet';

const base: LedgerPageInput = {
  key: 'k1',
  room: 'Echo',
  today: '17 October',
  figure: '84%',
  caption: 'answered true',
  rows: [
    ['Rounds', '7'],
    ['Best run', '5'],
    ['Accuracy', '84%'],
  ],
  stageLabel: 'Stage · mastered',
  stageName: 'Second stage',
  mastered: false,
  toward: 0.4,
};

function overlaps(a: SheetRect, b: SheetRect) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

describe('ledgerPage', () => {
  const page = ledgerPage(base);
  const text = (t: string): SheetItem | undefined => page.items.find((i) => i.kind === 'text' && i.text === t);

  it('draws each row label and value as script text', () => {
    for (const [k, v] of base.rows) {
      const label = text(k);
      const value = text(v);
      expect(label, k).toBeDefined();
      expect(label && 'font' in label && label.font).toBe('script');
      expect(value, v).toBeDefined();
      expect(value && 'font' in value && value.font).toBe('script');
    }
  });

  it('draws a double money column', () => {
    const cols = page.items.filter((i) => i.kind === 'column');
    expect(cols.some((c) => c.kind === 'column' && c.double === true)).toBe(true);
  });

  it('separates the rows with ledger-weight rules', () => {
    const ledger = page.items.filter((i) => i.kind === 'rule' && i.weight === 'ledger');
    expect(ledger.length).toBeGreaterThanOrEqual(base.rows.length);
  });

  it('places Again and Leave as non-overlapping rects', () => {
    const again = page.rects.find((r) => r.id === 'again');
    const leave = page.rects.find((r) => r.id === 'leave');
    expect(again).toBeDefined();
    expect(leave).toBeDefined();
    expect(overlaps(again!, leave!)).toBe(false);
  });

  it('sets the seal centre below both rects', () => {
    expect(page.seal).toEqual(LEDGER_SEAL);
    for (const id of ['again', 'leave']) {
      const r = page.rects.find((x) => x.id === id)!;
      expect(page.seal!.y, id).toBeLessThan(r.y - r.h / 2);
    }
  });

  it('runs the room name in the running head', () => {
    expect(text(`Palace · ${base.room}`)).toBeDefined();
  });

  it('marks a mastered stage and not an unmastered one', () => {
    expect(page.items.some((i) => i.kind === 'mark')).toBe(false);
    const mastered = ledgerPage({ ...base, mastered: true });
    expect(mastered.items.some((i) => i.kind === 'mark')).toBe(true);
  });
});
