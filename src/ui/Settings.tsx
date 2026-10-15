import { useState } from 'react';
import { usePalace } from '../store';

function Toggle({ label, hint, on, onChange, testId }: { label: string; hint?: string; on: boolean; onChange(v: boolean): void; testId: string }) {
  return (
    <label className="toggle">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span className="track" aria-hidden>
        <span className="thumb" />
      </span>
    </label>
  );
}

export function Settings({ onClose, onReplayIntro }: { onClose: () => void; onReplayIntro: () => void }) {
  const settings = usePalace((s) => s.saved.settings);
  const setLeftHanded = usePalace((s) => s.setLeftHanded);
  const setSound = usePalace((s) => s.setSound);
  const reset = usePalace((s) => s.resetProgress);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <Toggle
          label="Left-handed"
          hint="Mirror the neck"
          on={settings.leftHanded}
          onChange={setLeftHanded}
          testId="toggle-left-handed"
        />
        <Toggle label="Sound" on={settings.sound} onChange={setSound} testId="toggle-sound" />
        <div className="panel-actions">
          <button className="ghost" onClick={onReplayIntro}>
            Replay intro
          </button>
          {confirming ? (
            <button
              className="ghost danger"
              onClick={() => {
                reset();
                setConfirming(false);
                onClose();
              }}
            >
              Really reset?
            </button>
          ) : (
            <button className="ghost" onClick={() => setConfirming(true)}>
              Reset progress
            </button>
          )}
        </div>
        <button className="primary" onClick={onClose} data-testid="settings-close">
          Done
        </button>
      </div>
    </div>
  );
}
