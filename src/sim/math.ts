import { FIXED_POINT_ONE, TRIG_TABLE_SIZE } from './constants';

/**
 * Deterministic maths for the simulation core.
 *
 * Architecture law #4: only + - * / and Math.sqrt are specified to be
 * bit-exact by IEEE-754/ECMA-262. Math.sin and friends are implementation
 * defined and differ between V8, JavaScriptCore and SpiderMonkey, which would
 * desync saves and replays. Every trigonometric value therefore comes out of
 * the table built below.
 *
 * The table itself must not be built with Math.sin either - it is evaluated
 * with a Taylor series that uses nothing but the four basic operations, so the
 * table contents are identical on every engine and never need to be checked in
 * as generated data.
 */

const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;
const QUARTER_PI = 0.7853981633974483;

/**
 * sin(x) for x in [0, PI/4] via its Taylor series up to x^13.
 * The first neglected term is x^15/15! < 2.1e-14 on that interval, roughly
 * nine orders of magnitude below the Q16.16 quantisation step of 1/65536.
 */
function sinSeries(x: number): number {
  const x2 = x * x;
  let p = 1 / 6227020800; // 1/13!
  p = -1 / 39916800 + x2 * p; // -1/11!
  p = 1 / 362880 + x2 * p; //  1/9!
  p = -1 / 5040 + x2 * p; // -1/7!
  p = 1 / 120 + x2 * p; //  1/5!
  p = -1 / 6 + x2 * p; // -1/3!
  p = 1 + x2 * p;
  return x * p;
}

/** cos(x) for x in [0, PI/4] via its Taylor series up to x^12. */
function cosSeries(x: number): number {
  const x2 = x * x;
  let p = 1 / 479001600; //  1/12!
  p = -1 / 3628800 + x2 * p; // -1/10!
  p = 1 / 40320 + x2 * p; //  1/8!
  p = -1 / 720 + x2 * p; // -1/6!
  p = 1 / 24 + x2 * p; //  1/4!
  p = -1 / 2 + x2 * p; // -1/2!
  return 1 + x2 * p;
}

/** sin(x) for x in [0, PI/2], folded onto the well converging half interval. */
function sinQuadrant(x: number): number {
  return x <= QUARTER_PI ? sinSeries(x) : cosSeries(HALF_PI - x);
}

/** cos(x) for x in [0, PI/2], folded onto the well converging half interval. */
function cosQuadrant(x: number): number {
  return x <= QUARTER_PI ? cosSeries(x) : sinSeries(HALF_PI - x);
}

function buildSineTable(): Int32Array {
  const table = new Int32Array(TRIG_TABLE_SIZE);
  const quadrantEntries = TRIG_TABLE_SIZE >> 2;
  const step = (2 * PI) / TRIG_TABLE_SIZE;

  for (let i = 0; i < TRIG_TABLE_SIZE; i++) {
    const quadrant = (i / quadrantEntries) | 0;
    const x = (i - quadrant * quadrantEntries) * step; // [0, PI/2)
    let value: number;
    switch (quadrant) {
      case 0:
        value = sinQuadrant(x);
        break;
      case 1:
        value = cosQuadrant(x);
        break;
      case 2:
        value = -sinQuadrant(x);
        break;
      default:
        value = -cosQuadrant(x);
        break;
    }
    table[i] = Math.round(value * FIXED_POINT_ONE);
  }
  return table;
}

/** sin() over one full turn in Q16.16, indexed by TRIG_TABLE_SIZE steps per turn. */
export const SINE_TABLE: Int32Array = buildSineTable();

const TRIG_INDEX_MASK = TRIG_TABLE_SIZE - 1;
const QUARTER_TURN_INDEX = TRIG_TABLE_SIZE >> 2;

/** sin of `index / TRIG_TABLE_SIZE` turns, in Q16.16. Index wraps. */
export function sinFx(index: number): number {
  return SINE_TABLE[index & TRIG_INDEX_MASK]!;
}

/** cos of `index / TRIG_TABLE_SIZE` turns, in Q16.16. Index wraps. */
export function cosFx(index: number): number {
  return SINE_TABLE[(index + QUARTER_TURN_INDEX) & TRIG_INDEX_MASK]!;
}

/** sin of `turns` full turns as a float. Handles negative and >1 inputs. */
export function sinTurns(turns: number): number {
  return sinFx(Math.floor(turns * TRIG_TABLE_SIZE)) / FIXED_POINT_ONE;
}

/** cos of `turns` full turns as a float. Handles negative and >1 inputs. */
export function cosTurns(turns: number): number {
  return cosFx(Math.floor(turns * TRIG_TABLE_SIZE)) / FIXED_POINT_ONE;
}

// --------------------------------------------------------------- fixed point

/** Convert a float to Q16.16. */
export function toFx(value: number): number {
  return Math.round(value * FIXED_POINT_ONE);
}

/** Convert Q16.16 back to a float. */
export function fromFx(value: number): number {
  return value / FIXED_POINT_ONE;
}

/**
 * Multiply two Q16.16 values, truncating towards zero.
 * Valid while |a * b| < 2^53, i.e. both operands below roughly +-2^26 raw.
 */
export function mulFx(a: number, b: number): number {
  return ((a * b) / FIXED_POINT_ONE) | 0;
}

/** Divide two Q16.16 values, truncating towards zero. `b` must not be 0. */
export function divFx(a: number, b: number): number {
  return ((a * FIXED_POINT_ONE) / b) | 0;
}

// ------------------------------------------------------------------- helpers

/** Clamp `value` into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Clamp and truncate to an integer. */
export function clampInt(value: number, min: number, max: number): number {
  return clamp(value, min, max) | 0;
}
