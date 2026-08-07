import { describe, expect, it } from 'vitest';
import {
  EMISSIVE_MAX_ALPHA,
  EMISSIVE_WINDOW_HEX,
  HEADLIGHT_LENGTH_TILES,
  HEADLIGHT_SPREAD_RAD,
  headlightGroundPoints,
  headlightsOn,
  LAMP_VERGE_OFFSET,
  lampOffsetForRoadTile,
} from '../../src/render/emissive';
import { VEHICLE_FACING_DELTAS } from '../../src/render/vehicleArt';
import { RoadBit } from '../../src/sim/town/types';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';

/**
 * The pure half of the M13 emissive layer: street-lamp placement from road
 * tiles and the headlight geometry - the two policies SPEC2 M13 names as
 * test subjects ("Tests fuer die puren Teile: ... Lampen-Platzierung aus
 * Road-Tiles"). Everything here is a function of plain numbers; MapView only
 * rasterises and composites what these decide.
 */

describe('street lamp placement (M13)', () => {
  const straightEW = RoadBit.East | RoadBit.West;
  const straightNS = RoadBit.North | RoadBit.South;

  it('places no lamp off the road', () => {
    expect(lampOffsetForRoadTile(4, 4, 0)).toBeNull();
  });

  it('lights every second tile along a straight street - the parity rule', () => {
    // Along an east-west street y is fixed and x varies: the parity
    // alternates, so lamps sit on alternating tiles. Same along north-south
    // and along a diagonal avenue.
    let lamps = 0;
    for (let x = 10; x < 20; x++) {
      if (lampOffsetForRoadTile(x, 6, straightEW) !== null) lamps++;
    }
    expect(lamps).toBe(5);
    lamps = 0;
    for (let y = 3; y < 13; y++) {
      if (lampOffsetForRoadTile(7, y, straightNS) !== null) lamps++;
    }
    expect(lamps).toBe(5);
  });

  it('stands the lamp on the verge, one fixed side per direction', () => {
    // An east-west street is lit down its northern side, a north-south
    // street down its western side - fixed, like a real street, so the
    // pools of light form a line instead of a zigzag.
    expect(lampOffsetForRoadTile(2, 2, straightEW)).toEqual([0, -LAMP_VERGE_OFFSET]);
    expect(lampOffsetForRoadTile(2, 2, RoadBit.East)).toEqual([0, -LAMP_VERGE_OFFSET]);
    expect(lampOffsetForRoadTile(2, 2, straightNS)).toEqual([-LAMP_VERGE_OFFSET, 0]);
    expect(lampOffsetForRoadTile(2, 2, RoadBit.South)).toEqual([-LAMP_VERGE_OFFSET, 0]);
  });

  it('puts a junction lamp on the centre island', () => {
    expect(lampOffsetForRoadTile(2, 2, straightEW | RoadBit.North)).toEqual([0, 0]);
    expect(lampOffsetForRoadTile(2, 2, straightEW | straightNS)).toEqual([0, 0]);
    // An L-corner mixes the two axes and takes the centre too.
    expect(lampOffsetForRoadTile(2, 2, RoadBit.East | RoadBit.North)).toEqual([0, 0]);
  });

  it('is a pure function of tile and bits - same input, same lamp', () => {
    for (let bits = 0; bits < 16; bits++) {
      expect(lampOffsetForRoadTile(8, 4, bits)).toEqual(lampOffsetForRoadTile(8, 4, bits));
    }
  });
});

describe('headlight geometry (M13)', () => {
  it('opens the cone symmetrically around every facing direction', () => {
    for (let facing = 0; facing < 8; facing++) {
      const [du, dv] = VEHICLE_FACING_DELTAS[facing]!;
      const length = Math.sqrt(du * du + dv * dv);
      const [originU, originV, leftU, leftV, rightU, rightV] = headlightGroundPoints(facing);
      expect(originU).toBe(0);
      expect(originV).toBe(0);
      // The midpoint of the far edge lies exactly HEADLIGHT_LENGTH_TILES
      // down the travel direction.
      const midU = (leftU! + rightU!) / 2;
      const midV = (leftV! + rightV!) / 2;
      expect(midU).toBeCloseTo((du / length) * HEADLIGHT_LENGTH_TILES, 12);
      expect(midV).toBeCloseTo((dv / length) * HEADLIGHT_LENGTH_TILES, 12);
      // Both edges reach equally far from the axis - the cone is symmetric.
      const spread = Math.tan(HEADLIGHT_SPREAD_RAD) * HEADLIGHT_LENGTH_TILES;
      const leftOff = Math.hypot(leftU! - midU, leftV! - midV);
      const rightOff = Math.hypot(rightU! - midU, rightV! - midV);
      expect(leftOff).toBeCloseTo(spread, 12);
      expect(rightOff).toBeCloseTo(spread, 12);
    }
  });

  it('rotates facings onto each other - opposite facings mirror exactly', () => {
    for (let facing = 0; facing < 4; facing++) {
      const cone = headlightGroundPoints(facing);
      const opposite = headlightGroundPoints(facing + 4);
      // 180 degrees: the far edge midpoint flips sign on both axes.
      expect((cone[2]! + cone[4]!) / 2).toBeCloseTo(-(opposite[2]! + opposite[4]!) / 2, 12);
      expect((cone[3]! + cone[5]!) / 2).toBeCloseTo(-(opposite[3]! + opposite[5]!) / 2, 12);
    }
  });

  it('lights up underway and only underway, pinned against VehicleState', () => {
    expect(headlightsOn(VehicleState.Driving)).toBe(true);
    expect(headlightsOn(VehicleState.Braking)).toBe(true);
    expect(headlightsOn(VehicleState.Stopped)).toBe(false);
    expect(headlightsOn(VehicleState.Loading)).toBe(false);
    expect(headlightsOn(VehicleState.WaitingForCargo)).toBe(false);
    expect(headlightsOn(VehicleState.BrokenDown)).toBe(false);
    expect(headlightsOn(VehicleState.InDepot)).toBe(false);
    expect(headlightsOn(VehicleState.NoRoute)).toBe(false);
    expect(headlightsOn(VehicleState.WaitingForPath)).toBe(false);
    expect(headlightsOn(VehicleState.WaitingForSlot)).toBe(false);
    expect(headlightsOn(VehicleState.WaitingForConnection)).toBe(false);
  });
});

describe('the shared emissive constants', () => {
  it('keeps the additive alpha under one - full addition clips warm to white', () => {
    expect(EMISSIVE_MAX_ALPHA).toBeGreaterThan(0);
    expect(EMISSIVE_MAX_ALPHA).toBeLessThan(1);
  });

  it('glows warm: the lit-window hex has red above green above blue', () => {
    const value = Number.parseInt(EMISSIVE_WINDOW_HEX.slice(1), 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
});
