import { useEffect, useMemo, useState } from 'react';
import { usePalace } from '../store';
import { SheetLayer } from './SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH } from './sheet';

const BEATS = [
  {
    title: 'A brass light marks a place.',
    body: 'Name the note that sounds there.',
  },
  {
    title: 'Name it, or find it.',
    body: 'Name: pick one of twelve keys. Find: touch every place the note lives.',
  },
  {
    title: 'Slow answers come back.',
    body: 'Sure answers rest. Slow ones return sooner. Strings and frets open as you advance.',
  },
];

const NUMERALS = ['I', 'II', 'III'];
const HEIGHT = 4.9;
const X = 1.2;

/** First visit only: three beats on a page laid on the desk. Tap anywhere to turn it. */
export function Primer() {
  const done = usePalace((s) => s.completePrimer);
  const [beat, setBeat] = useState(0);
  const b = BEATS[beat]!;
  const last = beat === BEATS.length - 1;
  const advance = () => (last ? done() : setBeat(beat + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (last) done();
        else setBeat((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, done]);

  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'The Fretboard Room', x: 0, y: 1.98, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
    ];
    NUMERALS.forEach((n, i) => {
      items.push({ kind: 'text', text: n, x: (i - 1) * 0.7, y: 1.42, size: i === beat ? 0.4 : 0.28, ink: i === beat ? 'ink' : 'quiet', align: 'center' });
    });
    items.push(
      { kind: 'rule', y: 1.12, x0: -X, x1: X, weight: 'double' },
      { kind: 'text', text: b.title, x: 0, y: 0.9, size: 0.34, font: 'italic', align: 'center', maxWidth: 2.4, lineHeight: 1.12 },
      { kind: 'text', text: b.body, x: 0, y: -0.28, size: 0.2, align: 'center', maxWidth: 2.4, lineHeight: 1.4 },
      { kind: 'text', text: 'Skip', x: -0.78, y: -1.92, size: 0.2, font: 'smcp', ink: 'quiet', align: 'center' },
      { kind: 'text', text: last ? 'Begin' : 'Next', x: 0.62, y: -1.92, size: 0.23, font: 'smcp', align: 'center' },
    );
    const rects: SheetRect[] = [
      { id: 'skip', x: -0.78, y: -1.86, w: 1.2, h: 0.5 },
      { id: 'next', x: 0.62, y: -1.85, w: 1.2, h: 0.5 },
    ];
    return { key: 'primer', width: SHEET_WIDTH, height: HEIGHT, items, rects };
  }, [beat, b, last]);

  return (
    <SheetLayer
      geom={geom}
      testId="primer"
      label="Primer"
      onEscape={done}
      onBackdrop={advance}
      controls={[
        { id: 'skip', testId: 'primer-skip', label: 'Skip', onActivate: done },
        { id: 'next', testId: 'primer-next', label: last ? 'Begin' : 'Next', onActivate: advance, autoFocus: true },
      ]}
    >
      <p className="numeral" aria-label={`${beat + 1} of ${BEATS.length}`}>
        {NUMERALS[beat]}
      </p>
      <h2>{b.title}</h2>
      <p>{b.body}</p>
    </SheetLayer>
  );
}
