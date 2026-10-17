import { useMemo } from 'react';
import { usePalace } from '../store';
import { SheetLayer } from '../ui/SheetLayer';
import { type SheetItem, type SheetRect, SHEET_WIDTH } from '../ui/sheet';
import { blocksProgress } from './logic';
import { useBlocks } from './store';

const HEIGHT = 7.6;
const X = 1.2;
const SEAL = { x: -0.45, y: -3.2 };

/** End of a sitting in Blocks: the longest line, the lines tapped back, the stage's best against its bar. */
export function BlocksSession() {
  const sitting = useBlocks((s) => s.sitting);
  const record = useBlocks((s) => s.record);
  const stage = useBlocks((s) => s.stage)();
  const again = useBlocks((s) => s.again);
  const leave = usePalace((s) => s.leave);
  const prog = blocksProgress(stage, record);

  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), []);
  const rows: [string, string][] = [
    ['Clean lines', `${sitting.clean} of ${sitting.lines}`],
    ['Best on this stage', String(prog.best)],
    ['Slips', String(sitting.slips)],
  ];
  const figure = sitting.longest ? String(sitting.longest) : '–';
  const caption = sitting.longest ? (sitting.newBest ? 'Longest line, a new best' : 'Longest line') : 'No clean line yet';
  const roomLabel = sitting.mastered ? 'Mastered' : prog.mastered ? 'Stage · mastered' : 'Stage';
  const toward = Math.round(prog.toward * 100) / 100;

  const geom = useMemo(() => {
    const items: SheetItem[] = [
      { kind: 'text', text: 'Palace · Blocks', x: 0, y: 2.75, size: 0.17, font: 'smcp', ink: 'soft', align: 'center' },
      { kind: 'text', text: 'Today', x: 0, y: 2.2, size: 0.54, font: 'italic', ink: 'gilt', align: 'center' },
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
      { kind: 'text', text: stage.title, x: -X, y: -2.04, size: 0.2, font: 'italic' },
      ...(prog.mastered ? [{ kind: 'mark' as const, x: X - 0.06, y: -1.84, r: 0.06 }] : []),
      { kind: 'bar', y: -2.2, x0: -X, x1: X, fill: toward },
      { kind: 'text', text: 'Again', x: -0.72, y: -2.62, size: 0.27, font: 'smcp', align: 'center' },
      { kind: 'text', text: 'Leave', x: 0.72, y: -2.62, size: 0.27, font: 'smcp', ink: 'quiet', align: 'center' },
      { kind: 'text', text: 'Palace', x: SEAL.x + 0.5, y: SEAL.y - 0.08, size: 0.3, font: 'script', ink: 'iron', align: 'left', tilt: 3 },
    );
    const rects: SheetRect[] = [
      { id: 'again', x: -0.72, y: -2.54, w: 1.0, h: 0.5 },
      { id: 'leave', x: 0.72, y: -2.54, w: 1.0, h: 0.5 },
    ];
    return { key: 'blocks-session', width: SHEET_WIDTH, height: HEIGHT, items, rects, monogram: true, seal: SEAL };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, figure, caption, roomLabel, stage.title, toward, prog.mastered, JSON.stringify(rows)]);

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
        {figure}. {caption}.
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
        {roomLabel}: {stage.title}
      </p>
    </SheetLayer>
  );
}
