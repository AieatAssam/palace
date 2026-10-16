import { useEffect, useState } from 'react';
import { usePalace } from '../store';

const BEATS = [
  {
    title: 'A light rests on the neck.',
    body: 'Each question is one place on the fretboard, marked in brass. Name the note it sounds.',
  },
  {
    title: 'Answer on the keys, or the neck.',
    body: 'In Name, choose from the twelve keys. In Find, touch every place a note lives.',
  },
  {
    title: 'The room remembers.',
    body: 'Sure answers settle; slow ones return sooner. New strings and frets open as you learn.',
  },
];

const NUMERALS = ['I', 'II', 'III'];

/** First visit only: three beats over the dimmed desk. Tap anywhere to turn the page. */
export function Primer() {
  const done = usePalace((s) => s.completePrimer);
  const [beat, setBeat] = useState(0);
  const b = BEATS[beat]!;
  const last = beat === BEATS.length - 1;
  const advance = () => (last ? done() : setBeat(beat + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done();
      else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (last) done();
        else setBeat((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, done]);

  return (
    <section className="primer" data-testid="primer" role="dialog" aria-modal="true" aria-label="Primer" onClick={advance}>
      <div className="primer-page" key={beat}>
        <p className="numeral" aria-label={`${beat + 1} of ${BEATS.length}`}>
          {NUMERALS[beat]}
        </p>
        <h2 className="primer-title">{b.title}</h2>
        <p className="primer-body">{b.body}</p>
      </div>
      <div className="primer-actions">
        <button
          className="text-action quiet"
          data-testid="primer-skip"
          onClick={(e) => {
            e.stopPropagation();
            done();
          }}
        >
          Skip primer
        </button>
        <button
          className="text-action"
          data-testid="primer-next"
          autoFocus
          onClick={(e) => {
            e.stopPropagation();
            advance();
          }}
        >
          {last ? 'Begin' : 'Continue'}
        </button>
      </div>
    </section>
  );
}
