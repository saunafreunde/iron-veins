import { WeatherCell } from '../sim/constants';
import { PARTICLE_CAP, type PuffSpec } from './particles';

/**
 * The pure half of the weather optics (SPEC2 M18: "Regen-/Schneepartikel aus
 * dem Snapshot-Wetterfeld (Render-RNG)") - what a published weather cell puts
 * in the air over a tile, and how much of it.
 *
 * **The field is read from the snapshot and from nowhere else** (E-01, D-200).
 * The simulation drew the sky once for the day out of its own named stream and
 * published 256 numbers; this file turns those numbers into particles and
 * never asks a second question. There is no render-side weather model, no
 * second draw, and nothing here that a replay could disagree with.
 *
 * **Nothing here draws randomness from anything that matters.** Placement and
 * jitter key on the render frame counter through `particles.ts`'s avalanche
 * hashes - the D-174 device (Fehlerkatalog 25/39): no RNG stream is touched,
 * no wall clock is read, and the same frame sequence over the same published
 * field reproduces the same rain.
 *
 * **The new particles SHARE the M13 cap** (D-174). They are spawned into the
 * one `ParticlePool` of `PARTICLE_CAP` rows, LAST in the frame, so at overload
 * it is rain that is refused and never a plume: a chimney's smoke is
 * simulation truth made visible (the marker level), and rain is a sky the tint
 * and the tile panel already tell the player about.
 */

/** What falls out of a cell over one tile. */
export const Precipitation = {
  None: 0,
  Rain: 1,
  Snow: 2,
} as const;
export type Precipitation = (typeof Precipitation)[keyof typeof Precipitation];

/**
 * What falls over one tile: the published cell, decided against the height
 * and the season's snow line.
 *
 * The snow line is the tie between the two halves of the milestone's optics:
 * the same threshold that whitens the ground turns the rain over it into snow,
 * so a front crossing a mountain range rains in the valley and snows on the
 * ridge in the same frame. A frost cell is snow at any height - it is the
 * winter sky itself, and a frost that produced nothing visible would be the
 * one weather state the player could not see.
 */
export function precipitationFor(cell: number, height: number, snowLine: number): Precipitation {
  if (cell === WeatherCell.Frost) return Precipitation.Snow;
  if (cell !== WeatherCell.Rain && cell !== WeatherCell.Storm) return Precipitation.None;
  return height >= snowLine ? Precipitation.Snow : Precipitation.Rain;
}

/**
 * How many particles one spawn attempt places.
 *
 * The attempt budget per frame is fixed (see {@link WEATHER_SPAWN_ATTEMPTS}),
 * so this is where the steady-state population of each kind is decided: a
 * snowflake lives four times as long as a raindrop, so it is spawned at a
 * quarter of the attempts and the two reach the same number in the air. A
 * storm doubles whatever the attempt would have placed.
 *
 * The divisor reads the ATTEMPT INDEX rather than a draw, which is what keeps
 * the whole system free of randomness that could differ between two runs of
 * the same frames.
 */
export function weatherSpawnCount(kind: Precipitation, cell: number, attemptIndex: number): number {
  if (kind === Precipitation.None) return 0;
  const storm = cell === WeatherCell.Storm ? 2 : 1;
  if (kind === Precipitation.Snow) {
    return attemptIndex % SNOW_ATTEMPT_DIVISOR === 0 ? storm : 0;
  }
  return storm;
}

/**
 * How many attempts one frame makes across the visible tile range. [attempts]
 *
 * Sized against the pool, not against the screen: a raindrop lives
 * `RAIN_PUFF.lifeFrames` frames, so a fully rained-on viewport holds about
 * `WEATHER_SPAWN_ATTEMPTS * lifeFrames` drops - 416 of the 2,000-row cap, a
 * fifth of it, leaving the M13 emitters the room they were measured with. An
 * attempt that lands outside the drawn rectangle or on a dry region places
 * nothing, so a clear sky costs sixteen hashes a frame and no particles at all.
 */
export const WEATHER_SPAWN_ATTEMPTS = 16;

/**
 * One in this many attempts places snow; see {@link weatherSpawnCount}.
 * Exported because the steady-state population the budget rests on is
 * `attempts / divisor * lifeFrames`, and `weatherArt.spec.ts` computes that
 * against `PARTICLE_CAP` rather than believing a comment.
 */
export const SNOW_ATTEMPT_DIVISOR = 4;

/**
 * Rain: a short, fast, stretched streak. `stretchY` is what makes it read as
 * rain rather than as grey dots - the pool carries one aspect ratio per
 * particle for exactly this (D-174's storage, one column wider).
 *
 * A drop falls THROUGH the ground rather than splashing on it: the pool has no
 * collision, and a splash would need one. It is the same honest floor D-174
 * stated for smoke drifting over a hill that stands in front of it.
 */
export const RAIN_PUFF: PuffSpec = {
  lifeFrames: 26,
  lifeJitterFrames: 8,
  sizePx: 1.7,
  growPx: 0,
  riseVy: -6,
  driftVx: 0.9,
  jitterVx: 0.5,
  scatterPx: 0,
  stretchY: 3.6,
};

/** Storm rain: the same drop, driven much harder sideways. */
export const STORM_PUFF: PuffSpec = {
  lifeFrames: 24,
  lifeJitterFrames: 8,
  sizePx: 1.8,
  growPx: 0,
  riseVy: -7,
  driftVx: 2.4,
  jitterVx: 1.1,
  scatterPx: 0,
  stretchY: 4.2,
};

/** Snow: slow, round, and swaying - the jitter is most of its character. */
export const SNOW_PUFF: PuffSpec = {
  lifeFrames: 104,
  lifeJitterFrames: 34,
  sizePx: 2.3,
  growPx: 0,
  riseVy: -0.95,
  driftVx: 0.3,
  jitterVx: 1,
  scatterPx: 0,
  stretchY: 1,
};

/** The pale blue-grey of rain over any terrain. [0xRRGGBB] */
export const RAIN_TINT = 0x8fa8bd;

/** Snow is white; the day/night tint over the layer does the rest. [0xRRGGBB] */
export const SNOW_TINT = 0xffffff;

/** Which puff family a kind spawns; a storm asks for the harder rain. */
export function weatherPuffFor(kind: Precipitation, cell: number): PuffSpec {
  if (kind === Precipitation.Snow) return SNOW_PUFF;
  return cell === WeatherCell.Storm ? STORM_PUFF : RAIN_PUFF;
}

/** The tint a kind is drawn in. */
export function weatherTintFor(kind: Precipitation): number {
  return kind === Precipitation.Snow ? SNOW_TINT : RAIN_TINT;
}

/**
 * How far above the tile a drop is born. [world px]
 *
 * Roughly half of what a raindrop falls in its life, so the streak crosses the
 * ground it belongs to instead of appearing on it or dying above it.
 */
export const WEATHER_SPAWN_LIFT_PX = 80;

/**
 * The whole system's ceiling: a viewport entirely under storm, drawn as
 * whichever of the three families holds the most particles in the air at once.
 * [particles]
 *
 * Per attempt slot a family holds `spawnsPerAttempt * lifeFrames` rows, so the
 * densest is not the one with the shortest drops but the one whose product is
 * largest - snow, at a quarter of the attempts and four times the life,
 * matches rain almost exactly, which is the sizing this file was written to.
 * A storm doubles all of it.
 *
 * It is a share of `PARTICLE_CAP` and the share is the point - the weather may
 * not eat the pool the M13 emitters were measured in. The test holds the
 * comparison; `PARTICLE_CAP` is imported here so the ceiling cannot be read
 * without the number it has to fit inside.
 */
export const WEATHER_PARTICLE_CEILING = Math.ceil(
  WEATHER_SPAWN_ATTEMPTS *
    2 *
    Math.max(
      RAIN_PUFF.lifeFrames,
      STORM_PUFF.lifeFrames,
      SNOW_PUFF.lifeFrames / SNOW_ATTEMPT_DIVISOR,
    ),
);

/** What share of the M13 cap the ceiling above spends. [0-1] */
export const WEATHER_CAP_SHARE = WEATHER_PARTICLE_CEILING / PARTICLE_CAP;
