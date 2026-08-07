/**
 * Pure chart arithmetic for the M14 statistics centre (SPEC2 M14): axis
 * scaling and point placement for the company-value graph and the cash-flow
 * axis labels. No rendering here - the FinancePanel draws SVG on the main
 * thread from these numbers, so there is exactly one render path (the
 * div-bar precedent, upgraded), and the scaling itself is testable without a
 * DOM.
 */

/** An axis: rounded bounds and the ticks between them, ascending. */
export interface AxisScale {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly ticks: readonly number[];
}

/**
 * The classic "nice numbers" axis: expand [lo, hi] to multiples of a step
 * from the 1/2/5 decade series, chosen so at most `maxTicks` ticks result.
 * Degenerate input is made drawable rather than rejected: a flat series gets
 * a symmetric band around its value, so a chart of a constant is a line in
 * the middle of a plot instead of a division by zero.
 */
export function niceScale(lo: number, hi: number, maxTicks = 5): AxisScale {
  let low = Math.min(lo, hi);
  let high = Math.max(lo, hi);
  if (low === high) {
    // A tenth of the magnitude on either side; 1 for an all-zero series.
    const pad = low === 0 ? 1 : Math.abs(low) * 0.1;
    low -= pad;
    high += pad;
  }

  const step = niceStep((high - low) / Math.max(1, maxTicks));
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;

  const ticks: number[] = [];
  // Multiply out from the integer index rather than accumulating floats, so
  // the last tick lands exactly on `max`.
  const count = Math.round((max - min) / step);
  for (let i = 0; i <= count; i++) ticks.push(min + i * step);
  return { min, max, step, ticks };
}

/** Smallest 1/2/5-series number that is >= the raw step. */
function niceStep(raw: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Place a series into a width x height plot under an axis scale: index maps
 * linearly to x (a single point sits at the right edge - "now"), value maps
 * to y with the axis minimum at the bottom. Pure and total: an empty series
 * yields no points.
 */
export function seriesPoints(
  values: readonly number[],
  width: number,
  height: number,
  scale: AxisScale,
): ChartPoint[] {
  const span = scale.max - scale.min;
  return values.map((value, index) => ({
    x: values.length === 1 ? width : (index / (values.length - 1)) * width,
    y: height - ((value - scale.min) / span) * height,
  }));
}

/** Y pixel of one value under a scale, for gridlines and the zero line. */
export function valueToY(value: number, height: number, scale: AxisScale): number {
  return height - ((value - scale.min) / (scale.max - scale.min)) * height;
}
