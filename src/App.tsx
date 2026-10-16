import { useState } from 'react';
import { useCalm } from './motion';
import { usePalace } from './store';
import { Scene } from './three/Scene';
import { Attract } from './ui/Attract';
import { Hud } from './ui/Hud';
import { Primer } from './ui/Primer';
import { SessionSheet } from './ui/SessionSheet';
import { Settings } from './ui/Settings';

/** One desk, always lit; screens are ink laid over it. */
export function App() {
  const screen = usePalace((s) => s.screen);
  const replayPrimer = usePalace((s) => s.replayPrimer);
  const calm = useCalm();
  const [settings, setSettings] = useState(false);

  return (
    <div className={`app ${calm ? 'calm' : ''}`} data-screen={screen}>
      <Scene />
      <div className="dim" aria-hidden />
      <Hud onSettings={() => setSettings(true)} hidden={screen !== 'play'} />
      {screen === 'attract' && <Attract />}
      {screen === 'primer' && <Primer />}
      {screen === 'session' && <SessionSheet />}
      {settings && (
        <Settings
          onClose={() => setSettings(false)}
          onReplayPrimer={() => {
            setSettings(false);
            replayPrimer();
          }}
        />
      )}
    </div>
  );
}
