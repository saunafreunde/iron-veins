import type { ReactElement } from 'react';
import { formatInteger, t } from '../i18n';

import { BENCHMARK_MAP_IDS, BENCHMARK_MAP_LABELS } from '../sim/bench/ids';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * The benchmark screen of SPEC2 M22: pick one of the four canonical maps, run
 * it, read the p50 and p99 the simulation actually reached.
 *
 * **It imports `bench/ids.ts` and never `bench/catalog.ts`**, and that is the
 * whole reason `ids.ts` exists (D-191): the catalogue can decode a map, which
 * means it stands on `save/format.ts`, which drags the entity codecs and the
 * `World` into whatever chunk imports it. This screen needs three strings per
 * map and takes exactly those.
 *
 * Nothing here measures anything either. The clock is in `SimWorker.ts` and
 * the arithmetic is in `sim/bench/stats.ts` - the same function the perf suite
 * uses, so the number a player reads and the number in SPEC2's ledger are the
 * same number computed the same way.
 *
 * Loaded lazily, like the workshop and the end screen (D-192).
 */
export function BenchmarkPanel({
  client,
  onClose,
}: {
  readonly client: SimClient;
  readonly onClose: () => void;
}): ReactElement {
  useSimStore((s) => s.locale);
  const running = useSimStore((s) => s.benchmarkRunning);
  const result = useSimStore((s) => s.benchmarkResult);

  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">{t('ui.benchmark.title')}</h2>
      <p className="panel__hint">{t('ui.benchmark.hint')}</p>

      <ul className="list">
        {BENCHMARK_MAP_IDS.map((id) => (
          <li key={id} className="row">
            <span>{t(BENCHMARK_MAP_LABELS[id].nameKey)}</span>
            <span className="row__meta">{t(BENCHMARK_MAP_LABELS[id].descriptionKey)}</span>
            <button
              type="button"
              className={id === running ? 'button button--active' : 'button'}
              disabled={running !== null}
              onClick={() => client.runBenchmark(id)}
            >
              {id === running ? t('ui.benchmark.working') : t('ui.benchmark.run')}
            </button>
          </li>
        ))}
      </ul>

      {running !== null && <p className="panel__hint">{t('ui.benchmark.busy')}</p>}

      {result !== null && (
        <>
          <h3 className="panel__title">
            {t('ui.benchmark.result', {
              map: t(
                BENCHMARK_MAP_LABELS[result.mapId as keyof typeof BENCHMARK_MAP_LABELS].nameKey,
              ),
            })}
          </h3>
          <ul className="list">
            <li className="row">
              <span>{t('ui.benchmark.p50')}</span>
              <span className="row__meta">{result.p50Ms.toFixed(3)} ms</span>
            </li>
            <li className="row">
              <span>{t('ui.benchmark.p99')}</span>
              <span className="row__meta">{result.p99Ms.toFixed(3)} ms</span>
            </li>
            <li className="row">
              <span>{t('ui.benchmark.max')}</span>
              <span className="row__meta">{result.maxMs.toFixed(3)} ms</span>
            </li>
            <li className="row">
              <span>{t('ui.benchmark.mean')}</span>
              <span className="row__meta">{result.meanMs.toFixed(3)} ms</span>
            </li>
            <li className="row">
              <span>{t('ui.benchmark.ticks')}</span>
              <span className="row__meta">{formatInteger(result.ticks)}</span>
            </li>
            <li className="row">
              <span>{t('ui.benchmark.build')}</span>
              <span className="row__meta">{(result.buildMs / 1000).toFixed(1)} s</span>
            </li>
          </ul>
          {/* What the numbers are ABOUT. A percentile over an unnamed world is
              a number without a subject (D-197), and this screen is the one
              place a player ever sees one. */}
          <p className="panel__hint">
            {t('ui.benchmark.world', {
              size: result.mapSize,
              vehicles: formatInteger(result.vehicles),
              stations: formatInteger(result.stations),
              towns: formatInteger(result.towns),
              industries: formatInteger(result.industries),
              arcs: formatInteger(result.railArcs),
              junctions: formatInteger(result.railJunctions),
              landmasses: formatInteger(result.landmasses),
            })}
          </p>
        </>
      )}

      <div className="button-row">
        <button type="button" className="button" onClick={onClose}>
          {t('ui.close')}
        </button>
      </div>
    </section>
  );
}
