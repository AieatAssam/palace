import { useEffect } from 'react';
import { useCalm } from '../motion';
import { usePalace } from '../store';

const SHIMMER_EVERY = 4600;

/** Title: the desk at rest, the wordmark, one action. */
export function Attract() {
  const begin = usePalace((s) => s.begin);
  const returning = usePalace((s) => Object.keys(s.saved.deck).length > 0);
  // The neck steps right (left for left-handers) on the title; the type takes the other side.
  const leftHanded = usePalace((s) => s.saved.settings.leftHanded);
  const calm = useCalm();

  // Every few seconds one open string sighs: silent, ungraded.
  useEffect(() => {
    if (calm) return;
    const id = setInterval(() => {
      const st = usePalace.getState();
      const strings = st.stage().strings;
      const string = strings[Math.floor(Math.random() * strings.length)]!;
      st.shimmer({ string, fret: 0 });
    }, SHIMMER_EVERY);
    return () => clearInterval(id);
  }, [calm]);

  return (
    <section
      className={`attract ${leftHanded ? 'attract-mirror' : ''}`}
      data-testid="attract"
      aria-labelledby="attract-title"
    >
      <div className="attract-block">
        <p className="attract-kicker">
          <span>Six rooms</span> One open
        </p>
        <h1 id="attract-title" className="wordmark-large">
          Palace
        </h1>
        <p className="attract-line">Each room trains a different kind of memory.</p>
        <span className="attract-rule" aria-hidden />
        <button className="text-action attract-action" onClick={begin} data-testid="attract-begin" autoFocus>
          {returning ? 'Continue' : 'Begin'}
        </button>
        </div>
      <p className="attract-foot">Saved on this device.</p>
    </section>
  );
}
