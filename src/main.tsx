import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { t } from './i18n';
import { getPlatformInfo } from './platform/Platform';
import { Difficulty } from './sim/constants';
import { App } from './ui/App';
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
client.start({
  // Main-thread randomness is fine - the seed becomes part of the world state
  // and everything downstream of it is derived deterministically.
  seed: Math.floor(Math.random() * 0x1_0000_0000),
  difficulty: Difficulty.Normal,
  companyName: t('ui.defaultCompanyName'),
  companyColorIndex: 1,
});

void getPlatformInfo().then((info) => {
  useSimStore.getState().setPlatform(info.appVersion, info.isDesktop);
});

createRoot(container).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
