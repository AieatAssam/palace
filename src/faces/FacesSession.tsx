import { useMemo } from 'react';
import { usePalace } from '../store';
import { SheetLayer } from '../ui/SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH } from '../ui/sheet';
import { cardId, castOf, facesProgress, isKnown } from './logic';
import { useFaces } from './store';

const X = 1.2;
const LINE = 0.36;

/**
 * End of a sitting in Faces: the answers right, then the stage's sitters written into the
 * ledger by hand, each with a tick once you know the face, and the stage against its bar.
 */
export function FacesSession() {
  const sitting = useFaces((s) => s.sitting);
  const deck = useFaces((s) => s.deck);
  const stage = useFaces((s) => s.stage)();
  const again = useFaces((s) => s.again);
  const leave = usePalace((s) => s.leave);
  const prog = facesProgress(stage, deck);
  const cast = castOf(stage);
  const trades = stage.kinds.includes('trade');
  const ledger = cast.map((s) => ({ name: s.name, trade: s.trade, known: isKnown(deck[cardId(stage.id, s.id)]) }));

  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), []);
  const figure = `${sitting.right} / ${sitting.asked}`;
  const gained = prog.known - sitting.knownBefore;
  const caption = sitting.asked === 0 ? 'No questions yet' : gained > 0 ? `Named right, ${gained} more ${gained === 1 ? 'face' : 'faces'} known` : 'Named right';
  const roomLabel = sitting.mastered ? 'Mastered' : prog.mastered ? 'Stage · mastered' : 'Stage';
  const height = 6.0 + LINE * cast.length;
  const top = height / 2;
  const seal = { x: -0.45, y: -top + 0.6 };

  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'Palace · Faces', x: 0, y: top - 0.45, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: 'Today', x: 0, y: top - 1.0, size: 0.54, font: 'italic', ink: 'gilt', align: 'center' },
      { kind: 'text', text: today, x: 0, y: top - 1.48, size: 0.27, font: 'script', ink: 'iron', align: 'center' },
      { kind: 'rule', y: top - 1.78, x0: -X, x1: X, weight: 'double' },
      { kind: 'text', text: figure, x: 0, y: top - 2.42, size: 0.6, font: 'figures', align: 'center' },
      { kind: 'text', text: caption, x: 0, y: top - 2.82, size: 0.18, font: 'italic', ink: 'soft', align: 'center' },
      { kind: 'rule', y: top - 3.06, x0: -X, x1: X },
    ];
    // The ledger: each sitter in a clerk's hand, a tick for a face you know.
    ledger.forEach((l, i) => {
      const y = top - 3.4 - LINE * i;
      items.push({ kind: 'text', text: l.name, x: -X + 0.04, y, size: 0.24, font: 'script', ink: l.known ? 'iron' : 'soft' });
      if (trades) items.push({ kind: 'text', text: l.trade, x: X - 0.36, y, size: 0.15, font: 'italic', ink: 'soft', align: 'right' });
      if (l.known) items.push({ kind: 'mark', x: X - 0.1, y: y + 0.06, r: 0.045 });
    });
    const after = top - 3.4 - LINE * cast.length;
    items.push(
      { kind: 'rule', y: after + 0.1, x0: -X, x1: X },
      { kind: 'text', text: roomLabel, x: -X, y: after - 0.22, size: 0.18, font: 'smcp', ink: 'soft' },
      { kind: 'text', text: `${stage.title} · ${prog.known} of ${prog.total} known`, x: -X, y: after - 0.48, size: 0.2, font: 'italic' },
      { kind: 'bar', y: after - 0.64, x0: -X, x1: X, fill: Math.round(prog.toward * 100) / 100 },
      { kind: 'text', text: 'Again', x: -0.72, y: after - 1.06, size: 0.27, font: 'smcp', align: 'center' },
      { kind: 'text', text: 'Leave', x: 0.72, y: after - 1.06, size: 0.27, font: 'smcp', ink: 'quiet', align: 'center' },
      { kind: 'text', text: 'Palace', x: seal.x + 0.5, y: seal.y - 0.08, size: 0.3, font: 'script', ink: 'iron', align: 'left', tilt: 3 },
    );
    const rects: SheetRect[] = [
      { id: 'again', x: -0.72, y: after - 0.98, w: 1.0, h: 0.5 },
      { id: 'leave', x: 0.72, y: after - 0.98, w: 1.0, h: 0.5 },
    ];
    return { key: 'faces-session', width: SHEET_WIDTH, height, items, rects, monogram: true, seal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, figure, caption, roomLabel, stage.title, prog.known, JSON.stringify(ledger)]);

  return (
    <SheetLayer
      geom={geom}
      testId="session-sheet"
      label="Today"
      controls={[
        { id: 'again', testId: 'session-again', label: 'Again', onActivate: again, autoFocus: true },
        { id: 'leave', testId: 'session-leave', label: 'Leave', onActivate: leave },
      ]}
    >
      <h2>Today</h2>
      <p>{today}</p>
      <p>
        {sitting.right} of {sitting.asked}. {caption}.
      </p>
      <ul>
        {ledger.map((l) => (
          <li key={l.name}>
            {l.name}
            {trades ? `, ${l.trade.toLowerCase()}` : ''}: {l.known ? 'known' : 'not yet known'}
          </li>
        ))}
      </ul>
      <p>
        {roomLabel}: {stage.title}, {prog.known} of {prog.total} known
      </p>
    </SheetLayer>
  );
}
