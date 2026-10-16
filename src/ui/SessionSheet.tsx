import { stageProgress } from '../game/unlocks';
import { usePalace } from '../store';

/** End of a sitting: a ledger page over the dimmed desk. */
export function SessionSheet() {
  const session = usePalace((s) => s.session);
  const deck = usePalace((s) => s.saved.deck);
  const stage = usePalace((s) => s.stage)();
  const again = usePalace((s) => s.again);
  const leave = usePalace((s) => s.leave);
  const prog = stageProgress(stage, deck);
  const pct = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const rows: [string, string][] = [
    ['Longest run', String(session.best)],
    ['Strengthened', String(session.strengthened.length)],
    ['To revisit', String(session.slipped.length)],
  ];

  return (
    <div className="sheet-scrim">
      <section className="ledger" role="dialog" aria-modal="true" aria-labelledby="ledger-title" data-testid="session-sheet">
        <p className="ledger-mark">Palace · Fretboard</p>
        <h2 id="ledger-title" className="ledger-title">
          Today
        </h2>
        <p className="ledger-date">{today}</p>
        <div className="ledger-hero">
          <span className="ledger-figure">{session.answered ? `${pct}%` : '—'}</span>
          <span className="ledger-caption">
            {session.answered ? `${session.correct} of ${session.answered} named` : 'Nothing answered'}
          </span>
        </div>
        <dl className="ledger-rows">
          {rows.map(([k, v]) => (
            <div className="ledger-row" key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="ledger-room">
          {session.opened ? (
            <p>
              <span className="meta-label">Opened</span> {session.opened}
            </p>
          ) : (
            <p>
              <span className="meta-label">Room</span> {stage.title}
            </p>
          )}
          <span className="hairline" aria-hidden>
            <span style={{ width: `${Math.round(prog.toward * 100)}%` }} />
          </span>
        </div>
        <div className="ledger-actions">
          <button className="text-action" onClick={again} data-testid="session-again" autoFocus>
            Again
          </button>
          <button className="text-action quiet" onClick={leave} data-testid="session-leave">
            Leave
          </button>
        </div>
      </section>
    </div>
  );
}
