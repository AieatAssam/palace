import { useEffect, useState } from 'react';
import type { Settings as SettingsShape } from '../game/storage';
import { usePalace } from '../store';

/** A ledger line: the label, then two words with the chosen one underlined in brass. */
function Choice<T extends string | boolean>({
  label,
  hint,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange(v: T): void;
  testId: string;
}) {
  return (
    <div className="setting">
      <span className="setting-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="choice" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            role="radio"
            aria-checked={v === value}
            className={v === value ? 'active' : ''}
            onClick={() => onChange(v)}
            data-testid={`${testId}-${String(v)}`}
          >
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}

const ON_OFF = [
  [true, 'On'],
  [false, 'Off'],
] as const;

export function Settings({ onClose, onReplayPrimer }: { onClose: () => void; onReplayPrimer: () => void }) {
  const settings = usePalace((s) => s.saved.settings);
  const update = usePalace((s) => s.updateSettings);
  const reset = usePalace((s) => s.resetProgress);
  const [confirming, setConfirming] = useState(false);
  const set =
    <K extends keyof SettingsShape>(k: K) =>
    (v: SettingsShape[K]) =>
      update({ [k]: v });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <section
        className="ledger settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-title" className="ledger-title">
          Settings
        </h2>
        <div className="settings-rows">
          <Choice
            label="Handedness"
            hint="Left mirrors the neck"
            value={settings.leftHanded}
            options={[
              [false, 'Right'],
              [true, 'Left'],
            ]}
            onChange={set('leftHanded')}
            testId="hand"
          />
          <Choice label="Sound" value={settings.sound} options={ON_OFF} onChange={set('sound')} testId="sound" />
          <Choice label="Haptics" value={settings.haptics} options={ON_OFF} onChange={set('haptics')} testId="haptics" />
          <Choice
            label="Reduce motion"
            value={settings.reduceMotion}
            options={ON_OFF}
            onChange={set('reduceMotion')}
            testId="motion"
          />
        </div>
        <div className="settings-links">
          <button className="text-action quiet" onClick={onReplayPrimer} data-testid="replay-primer">
            Replay primer
          </button>
          {confirming ? (
            <span className="confirm">
              <button
                className="text-action danger"
                onClick={() => {
                  reset();
                  setConfirming(false);
                  onClose();
                }}
                data-testid="clear-confirm"
              >
                Clear everything
              </button>
              <button className="text-action quiet" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button className="text-action quiet danger-quiet" onClick={() => setConfirming(true)} data-testid="clear-progress">
              Clear progress
            </button>
          )}
        </div>
        <button className="text-action done" onClick={onClose} data-testid="settings-close" autoFocus>
          Done
        </button>
      </section>
    </div>
  );
}
