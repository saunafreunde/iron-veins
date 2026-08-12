/**
 * Percentiles over a set of tick durations (SPEC2 M22).
 *
 * **This file reads no clock and it is the reason the benchmark mode is legal
 * at all.** Architecture law #3 bans `performance` under `src/sim`, and the
 * milestone's own sentence repeats it: "Zeitmessung nur im Worker-Scheduler,
 * nie in der Sim". So the split is arithmetic here, measurement there - the
 * caller hands over an array of numbers it took, and nothing in this module can
 * tell whether they are milliseconds, cargo units or anything else.
 *
 * Both consumers use it: `SimWorker.ts`, which times the in-game run, and
 * `tests/perf/benchmarkMaps.perf.spec.ts`, which times the suite's. Two
 * percentile implementations would be two different p99s for one world, and
 * the ledger of section 6.1.1 is a table of exactly those numbers.
 */

/** What one benchmark run measured. Every figure is in the samples' own unit. */
export interface BenchmarkStats {
  readonly samples: number;
  readonly p50: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
}

/**
 * The value at `quantile` of an ASCENDING array, by the nearest-rank rule.
 *
 * The same index arithmetic the perf suite has used since M10
 * (`sorted[floor(n * q)]`, clamped), extracted rather than restated: the
 * accepted M10 baseline of 1.45 / 3.26 ms was read off that expression, and a
 * different rounding rule would move every ledger row by a sample.
 */
export function quantileOfSorted(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  let index = Math.floor(sorted.length * quantile);
  if (index >= sorted.length) index = sorted.length - 1;
  if (index < 0) index = 0;
  return sorted[index]!;
}

/** Summarise raw samples. The input is not modified. */
export function summarise(samples: ArrayLike<number>): BenchmarkStats {
  const values: number[] = [];
  for (let i = 0; i < samples.length; i++) values.push(samples[i]!);
  if (values.length === 0) return { samples: 0, p50: 0, p99: 0, max: 0, mean: 0 };

  let total = 0;
  for (let i = 0; i < values.length; i++) total += values[i]!;
  values.sort((a, b) => a - b);

  return {
    samples: values.length,
    p50: quantileOfSorted(values, 0.5),
    p99: quantileOfSorted(values, 0.99),
    max: values[values.length - 1]!,
    mean: total / values.length,
  };
}
