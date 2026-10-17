import { useEffect, useRef, useState } from 'react';
import { comboOf } from './logic';
import { useRewards } from './store';

/** A milestone fills the meter to the end and holds it there this long before it empties. */
const FULL_MS = 520;

/**
 * The combo meter: a slim brass rule that fills over each run of five correct answers,
 * with a small lozenge for every milestone the run has passed. A miss drains it.
 */
export function ComboMeter() {
  const streak = useRewards((s) => s.streak);
  const flourish = useRewards((s) => s.flourish);
  const c = comboOf(streak);
  const [full, setFull] = useState(false);
  const seen = useRef(flourish?.id ?? 0);

  useEffect(() => {
    if (!flourish || flourish.id === seen.current) return;
    seen.current = flourish.id;
    setFull(true);
    const id = setTimeout(() => setFull(false), FULL_MS);
    return () => clearTimeout(id);
  }, [flourish]);

  const fill = full ? 1 : c.fill;
  const tiers = Math.min(4, c.tier);
  return (
    <span
      className={`combo ${full ? 'combo-full' : ''}`}
      role="meter"
      aria-label="Toward the next flourish"
      aria-valuemin={0}
      aria-valuemax={c.of}
      aria-valuenow={c.step}
      aria-valuetext={`${c.step} of ${c.of}`}
      data-testid="combo"
      data-tier={c.tier}
    >
      <span className="combo-track">
        <span className="combo-fill" style={{ transform: `scaleX(${fill})` }} />
      </span>
      <span className="combo-tiers" aria-hidden>
        {Array.from({ length: tiers }, (_, i) => (
          <span key={i} className="combo-tier" />
        ))}
      </span>
    </span>
  );
}
