import { describe, expect, it } from 'vitest';
import {
  BADGE_COLORS,
  BADGE_KIND_COUNT,
  BADGE_MIN_ZOOM,
  badgeForState,
  BadgeKind,
  STATE_BROKEN_DOWN,
  STATE_NO_ROUTE,
  STATE_STOPPED,
  STATE_WAITING_FOR_PATH,
  STUCK_BADGE_TICKS,
} from '../../src/render/badges';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';
import { DEADLOCK_WARN_TICKS } from '../../src/sim/constants';

/**
 * The badge policy of SPEC2 M13 ("Status-Badges (stuck/Panne/ohne
 * Auftraege) aus dem State-Feld im Stride"). The render side duplicates the
 * state values to stay free of sim enums; this test pins them against
 * VehicleState - the interpolation.spec.ts device - and holds the selection
 * itself: which state earns which chip, and that "stuck" keeps the game's
 * ONE definition of stuck, the 9.3 deadlock clock.
 */

describe('the badge state pins', () => {
  it('duplicates exactly the VehicleState values it names', () => {
    expect(STATE_STOPPED).toBe(VehicleState.Stopped);
    expect(STATE_BROKEN_DOWN).toBe(VehicleState.BrokenDown);
    expect(STATE_NO_ROUTE).toBe(VehicleState.NoRoute);
    expect(STATE_WAITING_FOR_PATH).toBe(VehicleState.WaitingForPath);
  });

  it('uses the section-9.3 clock for stuck, not a second definition', () => {
    expect(STUCK_BADGE_TICKS).toBe(DEADLOCK_WARN_TICKS);
  });
});

describe('badge selection', () => {
  it('gives a breakdown its own chip immediately', () => {
    expect(badgeForState(VehicleState.BrokenDown, 0)).toBe(BadgeKind.Breakdown);
  });

  it('marks NoRoute stuck at once - the sim already said it cannot move', () => {
    expect(badgeForState(VehicleState.NoRoute, 0)).toBe(BadgeKind.Stuck);
  });

  it('marks a signal wait stuck only past the deadlock clock', () => {
    expect(badgeForState(VehicleState.WaitingForPath, 0)).toBe(-1);
    expect(badgeForState(VehicleState.WaitingForPath, STUCK_BADGE_TICKS - 1)).toBe(-1);
    expect(badgeForState(VehicleState.WaitingForPath, STUCK_BADGE_TICKS)).toBe(BadgeKind.Stuck);
  });

  it('marks a parked vehicle as having nothing to do', () => {
    expect(badgeForState(VehicleState.Stopped, 0)).toBe(BadgeKind.NoOrders);
  });

  it('leaves every working state unbadged, whatever the stuck clock says', () => {
    const unbadged = [
      VehicleState.Driving,
      VehicleState.Braking,
      VehicleState.Loading,
      VehicleState.WaitingForCargo,
      VehicleState.InDepot,
      VehicleState.Holding,
      VehicleState.WaitingForSlot,
      VehicleState.WaitingForConnection,
    ];
    for (const state of unbadged) {
      expect(badgeForState(state, 0), `state ${state}`).toBe(-1);
      expect(badgeForState(state, STUCK_BADGE_TICKS * 2), `state ${state}`).toBe(-1);
    }
  });
});

describe('badge presentation constants', () => {
  it('has one colour per kind, from the 17.4-safe palette', () => {
    expect(BADGE_COLORS).toHaveLength(BADGE_KIND_COUNT);
  });

  it('gates at 1x - the first zoom step where vehicles are readable sprites', () => {
    // MapView's ZOOM_LEVELS are [0.25, 0.5, 1, 2, 4]; importing them here
    // would pull Pixi into the test run (the M9 refusal), so the step is
    // pinned by value.
    expect(BADGE_MIN_ZOOM).toBe(1);
  });
});
