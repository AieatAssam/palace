import { useState } from 'react';
import { activeRoom } from './modes/registry';
import { useCalm } from './motion';
import { RewardsOverlay } from './rewards/RewardsOverlay';
import { usePalace } from './store';
import { Scene } from './three/Scene';
import { Attract } from './ui/Attract';
import { Hub } from './ui/Hub';
import { Primer } from './ui/Primer';
import { Settings } from './ui/Settings';
import { Workshop } from './ui/Workshop';

/** One desk, always lit; screens are ink laid over it. */
export function App() {
  const screen = usePalace((s) => s.screen);
  const replayPrimer = usePalace((s) => s.replayPrimer);
  const modeId = usePalace((s) => s.saved.modeId);
  const stagesOpen = usePalace((s) => s.stagesOpen && (s.screen === 'play' || s.screen === 'hub'));
  const workshop = usePalace((s) => (s.screen === 'hub' ? s.workshop : null));
  const calm = useCalm();
  const [settings, setSettings] = useState(false);
  const room = activeRoom(modeId);
  const { Overlay, StageCard, Session } = room;
  const hubCard = screen === 'hub' && !stagesOpen && !workshop && !settings;

  return (
    <div className={`app ${calm ? 'calm' : ''}`} data-screen={screen}>
      <Scene />
      <div className="dim" aria-hidden />
      <Overlay onSettings={() => setSettings(true)} hidden={screen !== 'play' || settings || stagesOpen} />
      <RewardsOverlay />
      {screen === 'attract' && <Attract />}
      {screen === 'primer' && <Primer />}
      {hubCard && <Hub onSettings={() => setSettings(true)} />}
      {workshop && !settings && <Workshop id={workshop} />}
      {screen === 'session' && <Session />}
      {stagesOpen && !settings && <StageCard />}
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
