import { useState } from 'react';
import { usePalace } from './store';
import { Scene } from './three/Scene';
import { Hud } from './ui/Hud';
import { Onboarding } from './ui/Onboarding';
import { Settings } from './ui/Settings';

export function App() {
  const onboarded = usePalace((s) => s.saved.onboarded);
  const completeOnboarding = usePalace((s) => s.completeOnboarding);
  const [intro, setIntro] = useState(!onboarded);
  const [settings, setSettings] = useState(false);

  return (
    <div className="app">
      <Scene />
      <Hud onSettings={() => setSettings(true)} hidden={intro} />
      {settings && (
        <Settings
          onClose={() => setSettings(false)}
          onReplayIntro={() => {
            setSettings(false);
            setIntro(true);
          }}
        />
      )}
      {intro && (
        <Onboarding
          onDone={() => {
            completeOnboarding();
            setIntro(false);
          }}
        />
      )}
    </div>
  );
}
