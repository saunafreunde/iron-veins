import { describe, expect, it } from 'vitest';
import { PARTICLE_CAP, ParticlePool, spawnPuff } from '../../src/render/particles';
import { snowLineFor, SNOW_LINE_NONE } from '../../src/render/seasonArt';
import {
  Precipitation,
  precipitationFor,
  RAIN_PUFF,
  RAIN_TINT,
  SNOW_ATTEMPT_DIVISOR,
  SNOW_PUFF,
  SNOW_TINT,
  STORM_PUFF,
  WEATHER_CAP_SHARE,
  WEATHER_PARTICLE_CEILING,
  WEATHER_SPAWN_ATTEMPTS,
  weatherPuffFor,
  weatherSpawnCount,
  weatherTintFor,
} from '../../src/render/weatherArt';
import {
  MapClimate,
  MAX_HEIGHT,
  SEA_LEVEL,
  WEATHER_CELL_COUNT,
  WeatherCell,
} from '../../src/sim/constants';

/**
 * The pure half of the weather optics (SPEC2 M18, D-202): what a published
 * weather cell puts in the air over a tile, how much of it, and that the whole
 * layer fits inside the M13 particle cap it shares (D-174).
 *
 * **Which assertions are evidence and which are read-back.** The three puff
 * families and the two tints were CHOSEN, so "a storm drifts harder than
 * rain" is a read-back. What is independent of them: the kind is a function of
 * the cell and the snow line and of nothing else (walked over every cell and
 * every height); the steady-state population of each kind is arithmetic over
 * the exported constants and fits inside `PARTICLE_CAP` with the M13 emitters'
 * room intact; and the pool refuses at the cap, so the weather cannot grow the
 * frame bill however hard it rains.
 */

const CELLS = [
  WeatherCell.Clear,
  WeatherCell.Rain,
  WeatherCell.Storm,
  WeatherCell.Frost,
  WeatherCell.Heat,
];

describe('what falls out of a cell', () => {
  it('covers every cell the field can hold', () => {
    expect(CELLS).toHaveLength(WEATHER_CELL_COUNT);
    for (const cell of CELLS) {
      expect(precipitationFor(cell, 5, SNOW_LINE_NONE)).toBeGreaterThanOrEqual(Precipitation.None);
    }
  });

  it('drops nothing out of a clear or a hot sky, at any height', () => {
    for (const cell of [WeatherCell.Clear, WeatherCell.Heat]) {
      for (let height = 0; height <= MAX_HEIGHT; height++) {
        expect(precipitationFor(cell, height, SEA_LEVEL + 1)).toBe(Precipitation.None);
      }
    }
  });

  it('rains below the snow line and snows at or above it - the same front', () => {
    const line = 9;
    for (const cell of [WeatherCell.Rain, WeatherCell.Storm]) {
      for (let height = 0; height <= MAX_HEIGHT; height++) {
        expect(precipitationFor(cell, height, line), `cell ${cell} height ${height}`).toBe(
          height >= line ? Precipitation.Snow : Precipitation.Rain,
        );
      }
    }
  });

  it('rains everywhere when nothing wears snow', () => {
    for (let height = 0; height <= MAX_HEIGHT; height++) {
      expect(precipitationFor(WeatherCell.Rain, height, SNOW_LINE_NONE)).toBe(Precipitation.Rain);
    }
  });

  it('makes a frost snow at any height - the one sky that is winter itself', () => {
    for (let height = 0; height <= MAX_HEIGHT; height++) {
      expect(precipitationFor(WeatherCell.Frost, height, SNOW_LINE_NONE)).toBe(Precipitation.Snow);
    }
  });

  it('joins the season: a temperate January rains in the valley and snows on the ridge', () => {
    // Not a re-statement of the two rules above: the LINE here comes from the
    // season module, so this is the two halves of the milestone's optics
    // agreeing about one map.
    const line = snowLineFor(0, MapClimate.Temperate);
    expect(line).toBeGreaterThan(SEA_LEVEL + 1);
    expect(line).toBeLessThanOrEqual(MAX_HEIGHT);
    expect(precipitationFor(WeatherCell.Rain, SEA_LEVEL + 1, line)).toBe(Precipitation.Rain);
    expect(precipitationFor(WeatherCell.Rain, MAX_HEIGHT, line)).toBe(Precipitation.Snow);
  });
});

describe('how much of it', () => {
  it('places nothing at all for a dry kind', () => {
    for (let attempt = 0; attempt < 16; attempt++) {
      expect(weatherSpawnCount(Precipitation.None, WeatherCell.Clear, attempt)).toBe(0);
    }
  });

  it('doubles a storm against plain rain', () => {
    for (let attempt = 0; attempt < 16; attempt++) {
      expect(weatherSpawnCount(Precipitation.Rain, WeatherCell.Storm, attempt)).toBe(
        2 * weatherSpawnCount(Precipitation.Rain, WeatherCell.Rain, attempt),
      );
    }
  });

  it('spawns snow on one attempt in four, because a flake lives four times as long', () => {
    let snowSpawns = 0;
    for (let attempt = 0; attempt < WEATHER_SPAWN_ATTEMPTS; attempt++) {
      snowSpawns += weatherSpawnCount(Precipitation.Snow, WeatherCell.Rain, attempt);
    }
    expect(snowSpawns).toBe(WEATHER_SPAWN_ATTEMPTS / SNOW_ATTEMPT_DIVISOR);
    // Which is the whole point: the two kinds reach the same number in the
    // air although one falls fast and the other drifts.
    const rainAlive = WEATHER_SPAWN_ATTEMPTS * RAIN_PUFF.lifeFrames;
    const snowAlive = snowSpawns * SNOW_PUFF.lifeFrames;
    expect(Math.abs(rainAlive - snowAlive) / rainAlive).toBeLessThan(0.05);
  });
});

describe('the shared cap (D-174)', () => {
  it('leaves the M13 emitters most of the pool even in a full storm', () => {
    // The ceiling is the DENSEST family, not an assumed one: whichever of the
    // three holds most rows at once, doubled for a storm.
    const perSlot = Math.max(
      RAIN_PUFF.lifeFrames,
      STORM_PUFF.lifeFrames,
      SNOW_PUFF.lifeFrames / SNOW_ATTEMPT_DIVISOR,
    );
    expect(WEATHER_PARTICLE_CEILING).toBe(Math.ceil(WEATHER_SPAWN_ATTEMPTS * 2 * perSlot));
    expect(WEATHER_PARTICLE_CEILING).toBeLessThan(PARTICLE_CAP);
    expect(WEATHER_CAP_SHARE).toBeLessThan(0.45);
  });

  it('is refused at the cap rather than growing the pool', () => {
    const pool = new ParticlePool();
    for (let i = 0; i < PARTICLE_CAP; i++) pool.spawn(i, 0, 0, 1, 1_000, 2, 0, 0xffffff);
    expect(pool.count).toBe(PARTICLE_CAP);
    expect(spawnPuff(pool, RAIN_PUFF, 0, 0, 1, RAIN_TINT)).toBe(false);
    expect(pool.count).toBe(PARTICLE_CAP);
  });

  it('carries the streak through the pool as a stretch, and smoke as a round puff', () => {
    const pool = new ParticlePool();
    expect(spawnPuff(pool, RAIN_PUFF, 0, 0, 1, RAIN_TINT)).toBe(true);
    expect(pool.stretch[0]).toBe(RAIN_PUFF.stretchY);
    expect(pool.stretch[0]).toBeGreaterThan(1);
    expect(spawnPuff(pool, SNOW_PUFF, 0, 0, 2, SNOW_TINT)).toBe(true);
    expect(pool.stretch[1]).toBe(1);
  });

  it('keeps the stretch attached to its row through a swap-remove', () => {
    const pool = new ParticlePool();
    // A short-lived streak in front of a long-lived flake: the streak dies
    // first and the flake is swapped down into its row.
    pool.spawn(0, 0, 0, 1, 2, 2, 0, RAIN_TINT, 4);
    pool.spawn(1, 0, 0, 1, 1_000, 2, 0, SNOW_TINT, 1);
    pool.step();
    pool.step();
    expect(pool.count).toBe(1);
    expect(pool.tint[0]).toBe(SNOW_TINT);
    expect(pool.stretch[0]).toBe(1);
  });
});

describe('the drawing choices', () => {
  it('falls downwards - the sign the pool applies to riseVy', () => {
    const pool = new ParticlePool();
    spawnPuff(pool, RAIN_PUFF, 0, 0, 1, RAIN_TINT);
    const before = pool.y[0]!;
    pool.step();
    expect(pool.y[0]!).toBeGreaterThan(before);
  });

  it('gives a storm the harder rain and a snowflake its own family', () => {
    expect(weatherPuffFor(Precipitation.Rain, WeatherCell.Storm)).toBe(STORM_PUFF);
    expect(weatherPuffFor(Precipitation.Rain, WeatherCell.Rain)).toBe(RAIN_PUFF);
    expect(weatherPuffFor(Precipitation.Snow, WeatherCell.Storm)).toBe(SNOW_PUFF);
    expect(STORM_PUFF.driftVx).toBeGreaterThan(RAIN_PUFF.driftVx);
  });

  it('tints rain and snow apart', () => {
    expect(weatherTintFor(Precipitation.Rain)).toBe(RAIN_TINT);
    expect(weatherTintFor(Precipitation.Snow)).toBe(SNOW_TINT);
    expect(RAIN_TINT).not.toBe(SNOW_TINT);
  });
});
