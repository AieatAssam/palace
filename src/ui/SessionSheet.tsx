import { useMemo } from 'react';
import { stageLabel, stageProgress } from '../game/stages';
import { usePalace } from '../store';
import { SheetLayer } from './SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH } from './sheet';

const HEIGHT = 7.6;
const X = 1.2;
/** Wax seal centre: below the controls' rects (which end at y = −2.79), clear of the page edge. */
const SEAL = { x: -0.45, y: -3.2 };

/** End of a sitting: a ledger page laid on the desk. */
export function SessionSheet() {
  const session = usePalace((s) => s.session);
  const deck = usePalace((s) => s.saved.deck);
  const stage = usePalace((s) => s.stage)();
  const again = usePalace((s) => s.again);
  const leave = usePalace((s) => s.leave);
  const prog = stageProgress(stage, deck);
  const pct = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;

  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), []);
  const rows: [string, string][] = [
    ['Longest run', String(session.best)],
    ['Strengthened', String(session.strengthened.length)],
    ['To revisit', String(session.slipped.length)],
  ];
  const figure = session.answered ? `${pct}%` : '—';
  const verb = stage.drill === 'melody' ? 'played clean' : 'named';
  const caption = session.answered ? `${session.correct} of ${session.answered} ${verb}` : 'Nothing answered';
  // The stage in play; if this sitting carried it over the bar, it says so, with its gilt mark.
  const masteredNow = session.mastered.includes(stage.id);
  const roomLabel = masteredNow ? 'Mastered' : prog.mastered ? 'Stage \u00b7 mastered' : 'Stage';
  const roomName = stageLabel(stage);
  const toward = Math.round(prog.toward * 100) / 100;

  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'Palace · Fretboard', x: 0, y: 2.75, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: 'Today', x: 0, y: 2.2, size: 0.54, font: 'italic', ink: 'gilt', align: 'center' },
      // The date in a fine hand, with air above (clear of the descenders) and below (clear of the rule).
      { kind: 'text', text: today, x: 0, y: 1.72, size: 0.27, font: 'script', ink: 'iron', align: 'center' },
      { kind: 'rule', y: 1.42, x0: -X, x1: X, weight: 'double' },
      { kind: 'text', text: figure, x: 0, y: 0.72, size: 0.74, font: 'figures', align: 'center' },
      { kind: 'text', text: caption, x: 0, y: 0.26, size: 0.18, font: 'italic', ink: 'soft', align: 'center' },
      { kind: 'rule', y: -0.05, x0: -X, x1: X },
    ];
    rows.forEach(([k, v], i) => {
      const base = -0.05 - 0.46 * i - 0.31;
      items.push(
        { kind: 'text', text: k, x: -X, y: base, size: 0.18, font: 'smcp', ink: 'soft' },
        { kind: 'text', text: v, x: X, y: base, size: 0.28, font: 'figures', align: 'right' },
        { kind: 'rule', y: -0.05 - 0.46 * (i + 1), x0: -X, x1: X },
      );
    });
    items.push(
      { kind: 'text', text: roomLabel, x: -X, y: -1.78, size: 0.18, font: 'smcp', ink: 'soft' },
      { kind: 'text', text: roomName, x: -X, y: -2.04, size: 0.2, font: 'italic' },
      ...(prog.mastered ? [{ kind: 'mark' as const, x: X - 0.06, y: -1.84, r: 0.06 }] : []),
      { kind: 'bar', y: -2.2, x0: -X, x1: X, fill: toward },
      { kind: 'text', text: 'Again', x: -0.72, y: -2.62, size: 0.27, font: 'smcp', align: 'center' },
      { kind: 'text', text: 'Leave', x: 0.72, y: -2.62, size: 0.27, font: 'smcp', ink: 'quiet', align: 'center' },
      // Seal and signature share a line under the controls, centred as a pair.
      { kind: 'text', text: 'Palace', x: SEAL.x + 0.5, y: SEAL.y - 0.08, size: 0.3, font: 'script', ink: 'iron', align: 'left', tilt: 3 },
    );
    const rects: SheetRect[] = [
      { id: 'again', x: -0.72, y: -2.54, w: 1.0, h: 0.5 },
      { id: 'leave', x: 0.72, y: -2.54, w: 1.0, h: 0.5 },
    ];
    return { key: 'session', width: SHEET_WIDTH, height: HEIGHT, items, rects, monogram: true, seal: SEAL };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, figure, caption, roomLabel, roomName, toward, prog.mastered, session.best, session.strengthened.length, session.slipped.length]);

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
        {figure} {caption}
      </p>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p>
        {roomLabel} {roomName}
      </p>
    </SheetLayer>
  );
}
