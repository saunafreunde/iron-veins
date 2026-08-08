import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from './i18n';
import { getPlatformInfo, reportStartupDiagnostics } from './platform/Platform';
import { DEFAULT_MAP_SIZE, Difficulty, MapClimate } from './sim/constants';
import { App } from './ui/App';
import { startAudio } from './ui/audioBridge';
import { recordSaveWritten, scanStoredCrashBundles } from './ui/crashReporter';
import { captureThumbnail } from './ui/Minimap';
import { refreshReplays, storeReplay } from './ui/replays';
import { refreshSaves, storeSave } from './ui/saves';
import { loadSettings } from './ui/settings';
import { SimClient } from './ui/SimClient';
import { useSimStore } from './ui/store';
import './ui/styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html is missing the #root container.');
}

/**
 * The simulation is started outside React on purpose: its lifetime is tied to
 * the application, not to a component tree that StrictMode mounts twice.
 */
const client = new SimClient();

/**
 * A save the worker encoded has to be given a picture and a home.
 *
 * The picture is taken here rather than in the worker because it is a picture
 * of the map as the MAIN THREAD already holds it: the worker owns the tile
 * layers but has no canvas to draw them on, and sending a megabyte of pixels
 * across the boundary to paint them on the other side would be absurd.
 */
client.onSaveWritten = (message) => {
  void storeSave(
    message.bytes,
    message.slot,
    message.label,
    message.year,
    message.month,
    message.companyValueCt,
    captureThumbnail(),
    Date.now(),
  ).then((entry) => {
    // The crash reporter keeps the freshest shelf entry on the main thread,
    // so a crash bundle can copy it without asking a dead worker (D-132).
    recordSaveWritten(entry);
  });
};

/**
 * A recording the worker built or read gets a name and a home, exactly like a
 * save (SPEC2 M16). No thumbnail: the picture would be of the world the
 * recording STARTS at, which for a replay is a map nobody has built anything
 * on yet - the years and the companies are what tells two recordings apart.
 */
client.onReplayWritten = (message) => {
  void storeReplay(message.bytes, message.meta, message.label, Date.now());
};

client.start({
  // Main-thread randomness is fine - the seed becomes part of the world state
  // and everything downstream of it is derived deterministically.
  seed: Math.floor(Math.random() * 0x1_0000_0000),
  difficulty: Difficulty.Normal,
  climate: MapClimate.Temperate,
  mapSize: DEFAULT_MAP_SIZE,
  companyName: t('ui.defaultCompanyName'),
  companyColorIndex: 1,
});

// Settings first, so the language, the scale and the palette are right before
// anything is drawn rather than a frame after it. Then the save shelf, and
// then the crash shelf: a bundle a dead worker left behind is offered on the
// start AFTER the crash (SPEC2 M10, D-139).
void loadSettings()
  .then(() => refreshSaves())
  .then(() => refreshReplays())
  .then(() => scanStoredCrashBundles());

/**
 * No browser starts an AudioContext before the player has touched something,
 * so the engine waits for the first gesture of any kind. Built at boot it
 * would be silently dead for the whole session.
 */
function armAudio(): void {
  startAudio(client);
  window.removeEventListener('pointerdown', armAudio);
  window.removeEventListener('keydown', armAudio);
}
window.addEventListener('pointerdown', armAudio);
window.addEventListener('keydown', armAudio);

void getPlatformInfo().then(async (info) => {
  useSimStore.getState().setPlatform(info.appVersion, info.isDesktop);
  await reportStartupDiagnostics({
    appVersion: info.appVersion,
    crossOriginIsolated: window.crossOriginIsolated,
    sharedMemory: typeof SharedArrayBuffer !== 'undefined',
    userAgent: navigator.userAgent,
  });
});

createRoot(container).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
