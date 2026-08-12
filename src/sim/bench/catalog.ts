import { BENCHMARK_MAP_IDS, BENCHMARK_MAP_LABELS, type BenchmarkMapId } from './ids';
import { parseBenchmarkMap, type BenchmarkMap } from './types';

/**
 * The four benchmark maps of SPEC2 M22, with the one thing `ids.ts` may not
 * carry: how to READ one.
 *
 * The split is the bundle rule of D-191 - see `ids.ts` for the measurement.
 * Everything here stands above `save/format.ts`, so nothing on the main thread
 * may import this file; the worker does, and so does the perf suite.
 *
 * **Every log is loaded DYNAMICALLY.** The four JSON files are together well
 * over a megabyte of command log, and a game that never runs a benchmark should
 * never fetch one.
 */

export interface BenchmarkEntry {
  readonly id: BenchmarkMapId;
  /** Caption in the benchmark screen; `t()` resolves it in both locales. */
  readonly nameKey: string;
  /** One sentence on what this world is built to stress. */
  readonly descriptionKey: string;
  /** Read and validate the log. Dynamic on purpose - see the note above. */
  load(): Promise<BenchmarkMap>;
}

async function loadFile(
  id: BenchmarkMapId,
  raw: Promise<{ default: unknown }>,
): Promise<BenchmarkMap> {
  const parsed = parseBenchmarkMap((await raw).default, `benchmark map ${id}`);
  if (parsed.id !== id) {
    throw new Error(`benchmark map ${id}: the file calls itself "${parsed.id}"`);
  }
  return parsed;
}

/** The loaders, keyed by id - the one place a file name reaches an import. */
const LOADERS: Readonly<Record<BenchmarkMapId, () => Promise<BenchmarkMap>>> = {
  megaJunction: () => loadFile('megaJunction', import('./maps/mega-junction.json')),
  megalopolis: () => loadFile('megalopolis', import('./maps/megalopolis.json')),
  archipelago: () => loadFile('archipelago', import('./maps/archipelago.json')),
  hundredKEdges: () => loadFile('hundredKEdges', import('./maps/hundred-k-edges.json')),
};

export const BENCHMARK_MAPS: readonly BenchmarkEntry[] = BENCHMARK_MAP_IDS.map((id) => ({
  id,
  nameKey: BENCHMARK_MAP_LABELS[id].nameKey,
  descriptionKey: BENCHMARK_MAP_LABELS[id].descriptionKey,
  load: LOADERS[id],
}));

/** The entry with this id, or null - the id may come off a message. */
export function benchmarkEntry(id: string): BenchmarkEntry | null {
  for (const entry of BENCHMARK_MAPS) {
    if (entry.id === id) return entry;
  }
  return null;
}
