/**
 * The four canonical benchmark maps of SPEC2 M22, named - and NOTHING ELSE.
 *
 * **This file imports nothing, and that is a bundle decision with a
 * measurement behind it** (D-191/D-192, and the `save/version.ts` precedent).
 * The benchmark screen needs three strings per map to draw its list; the
 * CATALOGUE beside this file needs `parseBenchmarkMap`, which needs
 * `save/format.ts`, which pulls in the entity codecs and with them the whole
 * `World`. One static import of the catalogue from a panel would put all of
 * that in the entry chunk of a game that will usually never run a benchmark -
 * exactly the +248 kB accident D-191 records.
 *
 * So the identity of a benchmark map lives here, above everything that
 * DECODES one. `catalog.ts` stands on top of it, and a coupling test walks
 * both against the files on disk and against both locales.
 */

export const BENCHMARK_MAP_IDS = [
  'megaJunction',
  'megalopolis',
  'archipelago',
  'hundredKEdges',
] as const;
export type BenchmarkMapId = (typeof BENCHMARK_MAP_IDS)[number];

/** Caption and one-sentence description key per map, for the result screen. */
export interface BenchmarkLabels {
  readonly nameKey: string;
  readonly descriptionKey: string;
}

export const BENCHMARK_MAP_LABELS: Readonly<Record<BenchmarkMapId, BenchmarkLabels>> = {
  megaJunction: {
    nameKey: 'ui.benchmark.map.megaJunction',
    descriptionKey: 'ui.benchmark.map.megaJunctionHint',
  },
  megalopolis: {
    nameKey: 'ui.benchmark.map.megalopolis',
    descriptionKey: 'ui.benchmark.map.megalopolisHint',
  },
  archipelago: {
    nameKey: 'ui.benchmark.map.archipelago',
    descriptionKey: 'ui.benchmark.map.archipelagoHint',
  },
  hundredKEdges: {
    nameKey: 'ui.benchmark.map.hundredKEdges',
    descriptionKey: 'ui.benchmark.map.hundredKEdgesHint',
  },
};

/** File name of each map's command log, under `src/sim/bench/maps/`. */
export const BENCHMARK_MAP_FILES: Readonly<Record<BenchmarkMapId, string>> = {
  megaJunction: 'mega-junction.json',
  megalopolis: 'megalopolis.json',
  archipelago: 'archipelago.json',
  hundredKEdges: 'hundred-k-edges.json',
};
