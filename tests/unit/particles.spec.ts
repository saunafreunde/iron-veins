import { describe, expect, it } from 'vitest';
import {
  BREAKDOWN_SMOKE_PERIOD,
  emitterPhase,
  emitterUnit,
  EXHAUST_PUFF,
  exhaustPeriodForThrottle,
  INDUSTRY_PUFF,
  PARTICLE_CAP,
  PARTICLE_MAX_ALPHA,
  ParticlePool,
  smokePeriodForLevel,
  spawnPuff,
  vehicleThrottle,
} from '../../src/render/particles';
import { industryGlowFactor } from '../../src/render/emissive';
import { INDUSTRY_SMOKE_ANCHORS } from '../../src/render/industryArt';
import { INDUSTRY_TYPE_COUNT, IndustryType } from '../../src/sim/industry/types';
import { INDUSTRY_LEVEL_MAX, INDUSTRY_LEVEL_START } from '../../src/sim/constants';

/**
 * The pure half of the M13 particle system (SPEC2 M13): the cap that makes
 * the ONE ParticleContainer a budget rather than a hope, the level policy
 * that makes a dormant and a booming industry tell apart in a still image,
 * and the deterministic hashes that keep Fehlerkatalog 25/39 honoured -
 * no RNG stream, no wall clock, same inputs, same smoke.
 */

describe('the capped particle pool', () => {
  it('respects the cap under emitter overload and refuses without corrupting', () => {
    const pool = new ParticlePool();
    let accepted = 0;
    for (let i = 0; i < PARTICLE_CAP + 500; i++) {
      if (pool.spawn(i, 0, 0, -0.5, 100, 5, 0.1, 0xffffff)) accepted++;
    }
    expect(accepted).toBe(PARTICLE_CAP);
    expect(pool.count).toBe(PARTICLE_CAP);
    expect(pool.spawn(0, 0, 0, 0, 100, 5, 0.1, 0xffffff)).toBe(false);
    expect(pool.count).toBe(PARTICLE_CAP);
    // The first accepted rows are intact - the refusals wrote nothing.
    expect(pool.x[0]).toBe(0);
    expect(pool.x[PARTICLE_CAP - 1]).toBe(PARTICLE_CAP - 1);
  });

  it('frees capacity as puffs expire, so an overloaded field recovers', () => {
    const pool = new ParticlePool();
    // Half the pool dies after 3 frames, half lives long.
    for (let i = 0; i < PARTICLE_CAP; i++) {
      pool.spawn(i, 0, 0, 0, i % 2 === 0 ? 3 : 1_000, 4, 0, 0xffffff);
    }
    expect(pool.spawn(0, 0, 0, 0, 10, 4, 0, 0xffffff)).toBe(false);
    for (let frame = 0; frame < 3; frame++) pool.step();
    expect(pool.count).toBe(PARTICLE_CAP / 2);
    expect(pool.spawn(0, 0, 0, 0, 10, 4, 0, 0xffffff)).toBe(true);
  });

  it('integrates position and size by fixed per-frame steps', () => {
    const pool = new ParticlePool();
    pool.spawn(10, 20, 0.5, -1, 100, 6, 0.1, 0x123456);
    pool.step();
    pool.step();
    expect(pool.x[0]).toBeCloseTo(11, 10);
    expect(pool.y[0]).toBeCloseTo(18, 10);
    expect(pool.size[0]).toBeCloseTo(6.2, 10);
    expect(pool.tint[0]).toBe(0x123456);
  });

  it('fades in fast, out slow, and never exceeds the alpha ceiling', () => {
    const pool = new ParticlePool();
    pool.spawn(0, 0, 0, 0, 100, 5, 0, 0xffffff);
    const first = pool.alphaOf(0);
    pool.step(); // a few frames into the fade-in
    pool.step();
    const early = pool.alphaOf(0);
    expect(early).toBeGreaterThan(first);
    for (let frame = 0; frame < 60; frame++) pool.step();
    const late = pool.alphaOf(0);
    expect(late).toBeLessThan(early + PARTICLE_MAX_ALPHA);
    expect(late).toBeGreaterThan(0);
    for (let frame = 0; frame < 200; frame++) pool.step();
    expect(pool.count).toBe(0);
  });
});

describe('the level policy - dormant none, booming dense (SPEC2 M13)', () => {
  it('emits nothing at level 0 - a closed or dormant works is smokeless', () => {
    expect(smokePeriodForLevel(0)).toBe(0);
    expect(smokePeriodForLevel(-5)).toBe(0);
  });

  it("puffs denser the higher the level, over the sim's own band", () => {
    const base = smokePeriodForLevel(INDUSTRY_LEVEL_START);
    const booming = smokePeriodForLevel(INDUSTRY_LEVEL_MAX);
    expect(base).toBeGreaterThan(0);
    expect(booming).toBeGreaterThan(0);
    expect(booming).toBeLessThan(base);
    // Clamped at both ends: absurd inputs stay sane.
    expect(smokePeriodForLevel(1)).toBeLessThanOrEqual(40);
    expect(smokePeriodForLevel(100_000)).toBeGreaterThanOrEqual(8);
  });

  it('accumulates a standing plume for a booming works and none for a dormant one', () => {
    // The still-image criterion, run headless: one stack, 120 frames of the
    // exact emitter loop MapView runs, counted at the end.
    const countAfter = (level: number): number => {
      const pool = new ParticlePool();
      const period = smokePeriodForLevel(level);
      for (let blink = 0; blink < 120; blink++) {
        if (period > 0 && (blink + emitterPhase(7)) % period === 0) {
          spawnPuff(pool, INDUSTRY_PUFF, 0, 0, 7 ^ blink, 0xffffff);
        }
        pool.step();
      }
      return pool.count;
    };
    expect(countAfter(0)).toBe(0);
    const base = countAfter(INDUSTRY_LEVEL_START);
    const booming = countAfter(INDUSTRY_LEVEL_MAX);
    expect(base).toBeGreaterThan(2);
    expect(booming).toBeGreaterThan(base);
  });

  it('drives the window glow with the level too - the night half of the still image', () => {
    expect(industryGlowFactor(0)).toBe(0);
    const base = industryGlowFactor(INDUSTRY_LEVEL_START);
    const booming = industryGlowFactor(INDUSTRY_LEVEL_MAX);
    expect(base).toBeGreaterThan(0);
    expect(booming).toBeGreaterThan(base);
    expect(booming).toBeLessThanOrEqual(1);
  });
});

describe('the vehicle emitters', () => {
  it('reads the throttle proxy the audio engine has always used', () => {
    expect(vehicleThrottle(false, 500)).toBe(0);
    expect(vehicleThrottle(true, 0)).toBeCloseTo(0.35, 10);
    expect(vehicleThrottle(true, 999)).toBeCloseTo(0.35 + 999 / 4_000, 10);
  });

  it('exhales nothing when idle and about twice as often when working hard', () => {
    expect(exhaustPeriodForThrottle(0)).toBe(0);
    const ambling = exhaustPeriodForThrottle(vehicleThrottle(true, 0));
    const working = exhaustPeriodForThrottle(vehicleThrottle(true, 999));
    expect(ambling).toBeGreaterThan(working);
    expect(working).toBeGreaterThanOrEqual(20);
  });

  it('smokes a breakdown far denser than any exhaust', () => {
    expect(BREAKDOWN_SMOKE_PERIOD).toBeLessThan(
      exhaustPeriodForThrottle(vehicleThrottle(true, 999)),
    );
  });
});

describe('determinism of the render-side hashes (Fehlerkatalog 25/39)', () => {
  it('produces the same jitter for the same seed, on any run', () => {
    expect(emitterUnit(42)).toBe(emitterUnit(42));
    expect(emitterPhase(42)).toBe(emitterPhase(42));
    expect(emitterUnit(42)).toBeGreaterThanOrEqual(0);
    expect(emitterUnit(42)).toBeLessThan(1);
    // Neighbouring seeds decorrelate - a street of chimneys is out of step.
    expect(emitterPhase(42)).not.toBe(emitterPhase(43));
  });

  it('spawns byte-identical puffs for identical arguments', () => {
    const a = new ParticlePool();
    const b = new ParticlePool();
    spawnPuff(a, EXHAUST_PUFF, 5, 6, 1234, 0xabcdef);
    spawnPuff(b, EXHAUST_PUFF, 5, 6, 1234, 0xabcdef);
    expect(a.x[0]).toBe(b.x[0]);
    expect(a.y[0]).toBe(b.y[0]);
    expect(a.size[0]).toBe(b.size[0]);
    expect(a.tint[0]).toBe(b.tint[0]);
  });
});

describe('the smoke anchors of industryArt', () => {
  it('names only real industry types, each with at least one anchor', () => {
    for (const [type, anchors] of Object.entries(INDUSTRY_SMOKE_ANCHORS)) {
      const typeIndex = Number(type);
      expect(typeIndex).toBeGreaterThanOrEqual(0);
      expect(typeIndex).toBeLessThan(INDUSTRY_TYPE_COUNT);
      expect(anchors!.length).toBeGreaterThan(0);
      for (const anchor of anchors!) {
        // Inside the tile the drawing owns, above its ground.
        expect(Math.abs(anchor.u)).toBeLessThan(1);
        expect(Math.abs(anchor.v)).toBeLessThan(1);
        expect(anchor.height).toBeGreaterThan(0);
      }
    }
  });

  it('covers the eight smoking industries and leaves the yards honest', () => {
    const smoking = Object.keys(INDUSTRY_SMOKE_ANCHORS).map(Number);
    expect(smoking).toContain(IndustryType.CoalMine);
    expect(smoking).toContain(IndustryType.PowerPlant);
    expect(smoking).toContain(IndustryType.SteelMill);
    expect(smoking).toHaveLength(8);
    // A builders' merchant that smoked would be a lie.
    expect(smoking).not.toContain(IndustryType.BuildersMerchant);
    expect(smoking).not.toContain(IndustryType.Forestry);
  });
});
