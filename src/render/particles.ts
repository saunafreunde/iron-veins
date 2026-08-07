/**
 * The pure half of the M13 particle system (SPEC2 M13: "gedeckelter
 * ParticleContainer (Cap 2000, <= 2 ms Frame-CPU, im Tripwire)"): the capped
 * particle pool, the emitter policies - industry smoke from the marker
 * level, vehicle exhaust from the throttle, breakdown smoke - and the
 * deterministic phase and jitter hashes. No Pixi, no canvas, no map object
 * (the emissive.ts/water.ts split), so the cap, the per-frame loops and the
 * level policy are headless-tested and priced by the perf tripwire, while
 * the one ParticleContainer stays in MapView.
 *
 * Determinism (Fehlerkatalog 25/39): nothing here reads a clock or draws
 * from Math.random, let alone from a sim RNG stream. Spawn cadence keys on
 * the render frame counter (MapView's blink counter - the D-164 water
 * device), jitter comes from integer avalanche hashes over emitter ids, and
 * motion advances by fixed per-frame steps: the same frame sequence
 * reproduces the same smoke. Like the E-05 sub-tick alpha, two screenshots
 * of the same TICK may differ in particle phase - the sim, the hash and
 * every replay know nothing of any of it.
 */

/** Hard cap on live particles - the ONE ParticleContainer's size (SPEC2 M13). */
export const PARTICLE_CAP = 2_000;

/**
 * Peak opacity of a smoke puff. Well under 1: smoke is a veil over the
 * world, not a paint stroke, and overlapping puffs still darken further.
 * [0-1; render-side judgment, M13]
 */
export const PARTICLE_MAX_ALPHA = 0.5;

/**
 * Share of a puff's life spent fading IN. A puff that appears at full
 * opacity pops; one that ramps over the first sixth reads as smoke leaving
 * a stack. The remaining life fades out linearly. [share of life; M13]
 */
const FADE_IN_SHARE = 0.16;

/**
 * Industry smoke cadence: frames between puffs per stack anchor, derived
 * from the marker's production level (percent of base rate, 0 once closed -
 * the M13 level field). SMOKE_PERIOD_SCALE is chosen so the sim's own level
 * band (INDUSTRY_LEVEL_START 100 to INDUSTRY_LEVEL_MAX 200) spans a visibly
 * different plume: at 100 a puff every 16 frames (~5 alive per stack), at
 * 200 every 8 (~11 alive - a dense column). Level 0 - closed, the dormant
 * end - emits nothing at all, which is what makes a sleeping mine and a
 * booming one tell apart in a STILL image (SPEC2 M13 Fertig-wenn).
 */
const SMOKE_PERIOD_SCALE = 1_600; // [frames x level-%]
const SMOKE_PERIOD_MIN = 8; // [frames]
const SMOKE_PERIOD_MAX = 40; // [frames]

/** Frames between puffs for one industry stack; 0 = no smoke (dormant). */
export function smokePeriodForLevel(level: number): number {
  if (level <= 0) return 0;
  const period = Math.round(SMOKE_PERIOD_SCALE / level);
  if (period < SMOKE_PERIOD_MIN) return SMOKE_PERIOD_MIN;
  if (period > SMOKE_PERIOD_MAX) return SMOKE_PERIOD_MAX;
  return period;
}

/**
 * The throttle proxy the audio engine has always used (MapView M9), stated
 * ONCE here since M13 because the exhaust emitter reads the same value
 * (SPEC2 M13: "Fahrzeug-Abgas aus dem vorhandenen Throttle-Wert"): a
 * standing vehicle idles at 0, a moving one works between 0.35 and 0.6,
 * varied by its within-tile progress - the only speed the renderer knows.
 */
export function vehicleThrottle(moving: boolean, progressMilli: number): number {
  return moving ? 0.35 + (progressMilli % 1_000) / 4_000 : 0;
}

/**
 * Exhaust cadence: frames between puffs for a working vehicle. Scaled so a
 * hard-working engine (throttle 0.6) puffs roughly twice as often as an
 * ambling one - 23 versus 40 frames - and an idle vehicle (throttle 0)
 * emits nothing. [frames x throttle]
 */
const EXHAUST_PERIOD_SCALE = 14;
const EXHAUST_PERIOD_MIN = 20; // [frames]
const EXHAUST_PERIOD_MAX = 48; // [frames]

/** Frames between exhaust puffs; 0 = engine idle, no exhaust. */
export function exhaustPeriodForThrottle(throttle: number): number {
  if (throttle <= 0) return 0;
  const period = Math.round(EXHAUST_PERIOD_SCALE / throttle);
  if (period < EXHAUST_PERIOD_MIN) return EXHAUST_PERIOD_MIN;
  if (period > EXHAUST_PERIOD_MAX) return EXHAUST_PERIOD_MAX;
  return period;
}

/**
 * Breakdown smoke cadence: a broken-down vehicle (the State field in the
 * stride) smokes DENSELY - every 5 frames, darker and longer-lived than
 * exhaust - so a failure is visible from across the map. [frames; M13]
 */
export const BREAKDOWN_SMOKE_PERIOD = 5;

/**
 * Deterministic 32-bit avalanche over an emitter id - the variantIndex
 * construction of vehicleArt.ts (D-170), reused so every emitter's phase
 * and jitter are pure functions of the id: same machine or not, same frame
 * counter in, same smoke out.
 */
function avalanche(seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic [0, 1) jitter for an emitter id. */
export function emitterUnit(seed: number): number {
  return avalanche(seed) / 4_294_967_296;
}

/**
 * Deterministic phase offset for an emitter id, added to the frame counter
 * before the period modulo - so a street of chimneys puffs out of step
 * instead of in a single synchronised belch.
 */
export function emitterPhase(seed: number): number {
  return avalanche(seed) % 8_192;
}

/**
 * The motion recipe of one puff family. Velocities are world pixels per
 * render frame - fixed steps on the frame counter, never wall-clock scaled
 * (Fehlerkatalog 39): smoke that rose by the clock would move differently
 * in two recordings of the same frames.
 */
export interface PuffSpec {
  /** Mean lifetime. [frames] */
  readonly lifeFrames: number;
  /** Full jitter span around the mean lifetime. [frames] */
  readonly lifeJitterFrames: number;
  /** Diameter at birth. [world px] */
  readonly sizePx: number;
  /** Diameter growth per frame - smoke expands as it thins. [world px] */
  readonly growPx: number;
  /** Rise per frame (applied as negative screen y). [world px] */
  readonly riseVy: number;
  /** Constant sideways drift - a light easterly, shared by all smoke. [world px] */
  readonly driftVx: number;
  /** Full jitter span around the drift. [world px] */
  readonly jitterVx: number;
  /** Horizontal scatter of the spawn point around the anchor. [world px] */
  readonly scatterPx: number;
}

/** Industry chimney/dust puffs: big, slow, long-lived - a standing plume. */
export const INDUSTRY_PUFF: PuffSpec = {
  lifeFrames: 90,
  lifeJitterFrames: 30,
  sizePx: 7,
  growPx: 0.1,
  riseVy: 0.55,
  driftVx: 0.16,
  jitterVx: 0.12,
  scatterPx: 4,
};

/** Vehicle exhaust: a small short-lived wisp at the tailpipe. */
export const EXHAUST_PUFF: PuffSpec = {
  lifeFrames: 36,
  lifeJitterFrames: 12,
  sizePx: 3.5,
  growPx: 0.06,
  riseVy: 0.35,
  driftVx: 0.05,
  jitterVx: 0.1,
  scatterPx: 2,
};

/** Breakdown smoke: dark, dense, tall - a failure visible from afar. */
export const BREAKDOWN_PUFF: PuffSpec = {
  lifeFrames: 80,
  lifeJitterFrames: 20,
  sizePx: 6,
  growPx: 0.14,
  riseVy: 0.5,
  driftVx: 0.1,
  jitterVx: 0.14,
  scatterPx: 3,
};

/** Exhaust grey - light enough to read over dark asphalt. [0xRRGGBB] */
export const EXHAUST_TINT = 0x9a9aa0;

/** Breakdown smoke - near-black, unmistakably not steam. [0xRRGGBB] */
export const BREAKDOWN_TINT = 0x33343a;

/**
 * Spawn one puff of a family at an anchor. `salt` decorrelates the jitter -
 * the caller mixes the emitter id with the frame counter, so consecutive
 * puffs of one stack differ deterministically instead of forming a rigid
 * bead chain. Returns the pool's own cap answer.
 */
export function spawnPuff(
  pool: ParticlePool,
  spec: PuffSpec,
  x: number,
  y: number,
  salt: number,
  tint: number,
): boolean {
  const a = emitterUnit(salt);
  const b = emitterUnit(salt ^ 0x9e3779b9);
  const c = emitterUnit(salt ^ 0x3c6ef372);
  return pool.spawn(
    x + (a - 0.5) * spec.scatterPx,
    y,
    spec.driftVx + (b - 0.5) * spec.jitterVx,
    -spec.riseVy,
    Math.max(2, spec.lifeFrames + Math.round((c - 0.5) * spec.lifeJitterFrames)),
    spec.sizePx,
    spec.growPx,
    tint,
  );
}

/**
 * The capped particle pool: fixed preallocated storage for PARTICLE_CAP
 * puffs, advanced one fixed step per render frame. `spawn` refuses past the
 * cap - under emitter overload the oldest puffs live out their lives and
 * new ones are dropped, which is the budget guarantee the SPEC2 cap names
 * (tested in tests/unit/particles.spec.ts, priced in tests/perf). Removal
 * is swap-with-last, so `step` stays a single dense loop.
 */
export class ParticlePool {
  readonly x = new Float64Array(PARTICLE_CAP);
  readonly y = new Float64Array(PARTICLE_CAP);
  private readonly vx = new Float64Array(PARTICLE_CAP);
  private readonly vy = new Float64Array(PARTICLE_CAP);
  private readonly age = new Int32Array(PARTICLE_CAP);
  private readonly life = new Int32Array(PARTICLE_CAP);
  /** Current puff diameter, grown per frame. [world px] */
  readonly size = new Float64Array(PARTICLE_CAP);
  private readonly grow = new Float64Array(PARTICLE_CAP);
  readonly tint = new Int32Array(PARTICLE_CAP);
  /** Live particles; rows 0..count-1 are valid. */
  count = 0;

  /** Add one puff. False - and no state change - once the cap is reached. */
  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    lifeFrames: number,
    sizePx: number,
    growPx: number,
    tint: number,
  ): boolean {
    if (this.count >= PARTICLE_CAP) return false;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = lifeFrames;
    this.size[i] = sizePx;
    this.grow[i] = growPx;
    this.tint[i] = tint;
    return true;
  }

  /** Advance every puff one render frame; expired rows are swap-removed. */
  step(): void {
    for (let i = 0; i < this.count; i++) {
      const age = this.age[i]! + 1;
      if (age >= this.life[i]!) {
        const last = --this.count;
        this.x[i] = this.x[last]!;
        this.y[i] = this.y[last]!;
        this.vx[i] = this.vx[last]!;
        this.vy[i] = this.vy[last]!;
        this.age[i] = this.age[last]!;
        this.life[i] = this.life[last]!;
        this.size[i] = this.size[last]!;
        this.grow[i] = this.grow[last]!;
        this.tint[i] = this.tint[last]!;
        i--;
        continue;
      }
      this.age[i] = age;
      this.x[i] = this.x[i]! + this.vx[i]!;
      this.y[i] = this.y[i]! + this.vy[i]!;
      this.size[i] = this.size[i]! + this.grow[i]!;
    }
  }

  /** Opacity of row `i`: a fast fade-in, then a linear fade-out. [0-1] */
  alphaOf(i: number): number {
    const t = this.age[i]! / this.life[i]!;
    if (t < FADE_IN_SHARE) return (PARTICLE_MAX_ALPHA * t) / FADE_IN_SHARE;
    return (PARTICLE_MAX_ALPHA * (1 - t)) / (1 - FADE_IN_SHARE);
  }

  /** Drop every particle - the zoom-to-overview transition does this once. */
  clear(): void {
    this.count = 0;
  }
}
