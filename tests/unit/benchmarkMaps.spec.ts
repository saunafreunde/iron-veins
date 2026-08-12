import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import de from '../../src/i18n/de.json';
import en from '../../src/i18n/en.json';
import { BENCHMARK_MAPS } from '../../src/sim/bench/catalog';
import {
  BENCHMARK_MAP_FILES,
  BENCHMARK_MAP_IDS,
  BENCHMARK_MAP_LABELS,
} from '../../src/sim/bench/ids';
import { parseBenchmarkMap } from '../../src/sim/bench/types';
import { quantileOfSorted, summarise } from '../../src/sim/bench/stats';

/**
 * The four canonical benchmark maps of SPEC2 M22, held to their own registry.
 *
 * Nothing here simulates: the perf suite replays the logs and times them (and
 * `bench/build.ts` refuses a log that no longer applies), so what is left for a
 * unit test is the coupling - ids against files, files against ids, both
 * against both locales, and the one BUNDLE rule the milestone leans on.
 *
 * The registry-in-both-directions shape is D-183's, and the reason it matters
 * here is that a benchmark map has three separate homes: a text log on disk,
 * an entry in `ids.ts` and two captions per locale. A map missing any one of
 * them is a button that does nothing.
 */

const MAPS_DIR = fileURLToPath(new URL('../../src/sim/bench/maps/', import.meta.url));
const UI_DIRS = ['src/ui', 'src/render', 'src/platform'].map((dir) =>
  fileURLToPath(new URL(`../../${dir}/`, import.meta.url)),
);

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort(byText)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts') || name.endsWith('.tsx')) found.push(path);
    }
  };
  walk(root);
  return found;
}

describe('the benchmark map registry', () => {
  it('has a file for every id and an id for every file', () => {
    const onDisk = readdirSync(MAPS_DIR).sort(byText);
    const declared = BENCHMARK_MAP_IDS.map((id) => BENCHMARK_MAP_FILES[id]).sort(byText);
    expect(onDisk).toEqual(declared);
  });

  it('parses every log and finds its own name inside it', () => {
    for (const id of BENCHMARK_MAP_IDS) {
      const raw = JSON.parse(
        readFileSync(join(MAPS_DIR, BENCHMARK_MAP_FILES[id]), 'utf8'),
      ) as unknown;
      const map = parseBenchmarkMap(raw, id);
      expect(map.id).toBe(id);
      expect(map.commands.length).toBeGreaterThan(0);
      expect(map.sampleTicks).toBeGreaterThan(0);
      // Benchmark maps are AUTHORED worlds (D-240): the editor rule is what
      // lets one log lay a network no starting capital could pay for.
      expect(map.editorMode).toBe(true);
    }
  });

  it('is the same list in the catalogue, in order', async () => {
    expect(BENCHMARK_MAPS.map((entry) => entry.id)).toEqual([...BENCHMARK_MAP_IDS]);
    for (const entry of BENCHMARK_MAPS) {
      const loaded = await entry.load();
      expect(loaded.id).toBe(entry.id);
    }
  });

  it('has a caption and a description in both locales', () => {
    const catalogues: Readonly<Record<string, string>>[] = [de, en];
    for (const id of BENCHMARK_MAP_IDS) {
      const labels = BENCHMARK_MAP_LABELS[id];
      for (const catalogue of catalogues) {
        expect(catalogue[labels.nameKey], `${labels.nameKey} is missing`).toBeTypeOf('string');
        expect(catalogue[labels.descriptionKey], `${labels.descriptionKey} is missing`).toBeTypeOf(
          'string',
        );
      }
    }
  });

  it('claims what each map exists to be', () => {
    const claims = new Map(
      BENCHMARK_MAP_IDS.map((id) => [
        id,
        parseBenchmarkMap(
          JSON.parse(readFileSync(join(MAPS_DIR, BENCHMARK_MAP_FILES[id]), 'utf8')) as unknown,
          id,
        ),
      ]),
    );

    // Each map's identity, as SPEC2 names it. These are not perf gates - they
    // are what makes the name on the button true.
    expect(claims.get('megalopolis')!.claims.vehicles).toBe(1_500);
    expect(claims.get('megalopolis')!.mapSize).toBe(1_024);
    expect(claims.get('archipelago')!.mapSize).toBe(2_048);
    expect(claims.get('archipelago')!.claims.landmasses).toBeGreaterThanOrEqual(6);
    expect(claims.get('hundredKEdges')!.claims.railArcs).toBeGreaterThanOrEqual(100_000);
    expect(claims.get('megaJunction')!.claims.railJunctions).toBeGreaterThanOrEqual(500);
    expect(claims.get('megaJunction')!.claims.vehicles).toBeGreaterThan(0);
  });

  it('refuses a log that describes an impossible world', () => {
    const good = JSON.parse(
      readFileSync(join(MAPS_DIR, BENCHMARK_MAP_FILES.megaJunction), 'utf8'),
    ) as Record<string, unknown>;
    expect(() => parseBenchmarkMap({ ...good, mapSize: 96 }, 'planted')).toThrow(/power of two/);
    expect(() => parseBenchmarkMap({ ...good, climate: 9 }, 'planted')).toThrow(/climate/);
    expect(() => parseBenchmarkMap({ ...good, commands: [{ tick: 0 }] }, 'planted')).toThrow();
  });

  /**
   * The bundle rule of D-191, made a red build rather than a note.
   *
   * `bench/catalog.ts` and `bench/build.ts` stand on `save/format.ts`, which
   * pulls the entity codecs and with them the whole `World` into whatever chunk
   * imports them. The benchmark SCREEN needs three strings per map, so it takes
   * `bench/ids.ts` - an import-free leaf. One convenience import of the
   * catalogue from a panel would defeat that silently, exactly the way the
   * +248 kB of D-191 did.
   */
  it('is never reached from the main thread except through the import-free leaf', () => {
    const offenders: string[] = [];
    for (const dir of UI_DIRS) {
      for (const path of sourceFiles(dir)) {
        const text = readFileSync(path, 'utf8');
        for (const module of ['bench/catalog', 'bench/build', 'bench/types', 'bench/measure']) {
          if (text.includes(`sim/${module}`)) offenders.push(`${path} imports ${module}`);
        }
      }
    }
    expect(
      offenders,
      'a main-thread file reached a benchmark module that decodes maps - ' +
        'take the captions from src/sim/bench/ids.ts instead (D-191)',
    ).toEqual([]);
  });
});

describe('the percentile arithmetic both consumers share', () => {
  it('reads the nearest rank the perf suite has always read', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantileOfSorted(sorted, 0.5)).toBe(6);
    expect(quantileOfSorted(sorted, 0.99)).toBe(10);
    // Clamped at both ends rather than reaching past the array.
    expect(quantileOfSorted(sorted, 1)).toBe(10);
    expect(quantileOfSorted([], 0.5)).toBe(0);
  });

  it('summarises without touching the caller its input', () => {
    const samples = Float64Array.from([5, 1, 4, 2, 3]);
    const stats = summarise(samples);
    expect(stats.samples).toBe(5);
    expect(stats.max).toBe(5);
    expect(stats.mean).toBe(3);
    expect(stats.p50).toBe(3);
    // The input array is the caller's; a sort in place would scramble the
    // order the worker recorded ticks in.
    expect([...samples]).toEqual([5, 1, 4, 2, 3]);
  });

  it('answers an empty run with zeroes rather than NaN', () => {
    expect(summarise([])).toEqual({ samples: 0, p50: 0, p99: 0, max: 0, mean: 0 });
  });
});
