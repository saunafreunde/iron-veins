import type { ReactElement } from 'react';
import { formatInteger, t } from '../i18n';
import { useSimStore } from './store';

export function SystemPanel(): ReactElement {
  useSimStore((s) => s.locale);
  const tick = useSimStore((s) => s.tick);
  const seed = useSimStore((s) => s.seed);
  const commandsExecuted = useSimStore((s) => s.commandsExecuted);
  const simRateCentiHz = useSimStore((s) => s.simRateCentiHz);
  const stateHash = useSimStore((s) => s.stateHash);
  const mapSize = useSimStore((s) => s.mapSize);
  const townCount = useSimStore((s) => s.townCount);
  const industryCount = useSimStore((s) => s.industryCount);
  const isDesktop = useSimStore((s) => s.isDesktop);
  const sharedMemoryAvailable = useSimStore((s) => s.sharedMemoryAvailable);
  const showDebug = useSimStore((s) => s.showDebug);

  return (
    <section className="panel">
      <h2 className="panel__title">{t('ui.system.title')}</h2>
      <dl className="readout">
        <div>
          <dt>{t('ui.system.tick')}</dt>
          <dd className="value value--mono">{formatInteger(tick)}</dd>
        </div>
        <div>
          <dt>{t('ui.system.simRate')}</dt>
          <dd className="value value--mono">
            {t('ui.system.simRateValue', { rate: (simRateCentiHz / 100).toFixed(1) })}
          </dd>
        </div>
        <div>
          <dt>{t('ui.system.map')}</dt>
          <dd className="value value--mono">
            {mapSize} x {mapSize}
          </dd>
        </div>
        <div>
          <dt>{t('ui.system.towns')}</dt>
          <dd className="value value--mono">
            {formatInteger(townCount)} / {formatInteger(industryCount)}
          </dd>
        </div>
        <div>
          <dt>{t('ui.system.shell')}</dt>
          <dd className="value">
            {isDesktop ? t('ui.system.shellDesktop') : t('ui.system.shellBrowser')}
          </dd>
        </div>
        <div>
          <dt>{t('ui.system.isolation')}</dt>
          <dd className={sharedMemoryAvailable ? 'value value--success' : 'value value--danger'}>
            {sharedMemoryAvailable ? t('ui.system.isolationOk') : t('ui.system.isolationMissing')}
          </dd>
        </div>
        {showDebug && (
          <>
            <div>
              <dt>{t('ui.system.seed')}</dt>
              <dd className="value value--mono">{seed >>> 0}</dd>
            </div>
            <div>
              <dt>{t('ui.system.commands')}</dt>
              <dd className="value value--mono">{formatInteger(commandsExecuted)}</dd>
            </div>
            <div>
              <dt>{t('ui.system.stateHash')}</dt>
              <dd className="value value--mono">{stateHash}</dd>
            </div>
          </>
        )}
      </dl>
    </section>
  );
}
