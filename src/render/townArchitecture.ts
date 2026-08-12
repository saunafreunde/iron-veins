import { MapClimate } from '../sim/constants';

/**
 * What a town is BUILT of, per climate (SPEC2 M23, D-246).
 *
 * The fourth face of the four climates, beside the industry set, the vehicle
 * mask and the place names: a temperate town is rendered brick under a red
 * pitched roof, an arctic one is timber under a steep dark roof, a tropical
 * one is pale render under a shallow one, and a desert one is adobe under a
 * roof that is barely a roof at all.
 *
 * **Pure render, and pure in the strict Z1 sense.** This is a function of the
 * climate - a snapshot-announced world constant - and of nothing else. No
 * money and no physics is anywhere near it: the same tile carries the same
 * building, the same zone and the same expansion stage in every climate, and
 * only the paint and the pitch of the roof differ. Nothing in `src/sim`
 * imports this file, and nothing may.
 *
 * **It books ZERO atlas cells**, which is the same decision D-245 took for the
 * sixty era vehicles and for the same two reasons. The six town cells are
 * PROCEDURAL cells on the base page, so a climate variant is a repaint of
 * cells that already exist - exactly the seam M18's seasonal repaint opened
 * (D-202) - and the whole of M23 has ~150 cells booked in SPEC2 6.1 against a
 * detail page that has been full since D-173 (Fehlerkatalog 40).
 *
 * **What that leaves undone, stated plainly:** where the Kenney bake is
 * present, `staticArt.ts` draws `building:<zone>:<stage>` and those baked
 * cells are climate-blind, so on a machine with a filled asset cache the town
 * architecture varies only where the procedural cell is drawn. Giving the bake
 * a climate axis is four times the building cells and belongs to the M23 art
 * bundle that owns the booking; this bundle does not spend it silently.
 */
export interface TownArchitecture {
  /** Wall of a house. [CSS hex] */
  readonly houseWall: string;
  /** Roof of a house. [CSS hex] */
  readonly houseRoof: string;
  /**
   * How steep a house roof is, as a factor on the base rise. [1]
   *
   * A pitched roof sheds snow and a flat one keeps the sun out, which is the
   * whole of the reasoning: the arctic roof is the steepest in the table and
   * the desert one the shallowest.
   */
  readonly roofPitch: number;
  /** Wall of the commercial block. [CSS hex] */
  readonly blockWall: string;
  /** Rooftop plant on the commercial block. [CSS hex] */
  readonly blockRoof: string;
  /** Wall of the industrial shed. [CSS hex] */
  readonly shedWall: string;
  /** Sawtooth roof of the industrial shed. [CSS hex] */
  readonly shedRoof: string;
}

/**
 * The four looks, indexed by {@link MapClimate}.
 *
 * The temperate row holds EXACTLY the colours and the pitch the atlas drew
 * before this bundle, so a temperate world is pixel-identical to the one M22
 * shipped. Everything the other three rows change is a colour or a factor -
 * no shape, no anchor, no cell size, so nothing here can move a sprite or
 * overrun the reserved headroom of D-206.
 */
export const TOWN_ARCHITECTURE: readonly TownArchitecture[] = [
  {
    // Temperate: brick and red tile - the pre-M23 town, unchanged.
    houseWall: '#c9b79c',
    houseRoof: '#8d4b3c',
    roofPitch: 1,
    blockWall: '#cfd4d8',
    blockRoof: '#9aa1a8',
    shedWall: '#9b968c',
    shedRoof: '#5c6068',
  },
  {
    // Arctic: dark stained timber under a steep roof.
    houseWall: '#9a8f84',
    houseRoof: '#4a5560',
    roofPitch: 1.35,
    blockWall: '#b9c2c9',
    blockRoof: '#7e8790',
    shedWall: '#8d949a',
    shedRoof: '#414a55',
  },
  {
    // Tropical: pale render, shallow roof, green-grey metal.
    houseWall: '#e2ddc6',
    houseRoof: '#6b7f5a',
    roofPitch: 0.8,
    blockWall: '#dde3e0',
    blockRoof: '#8fa08c',
    shedWall: '#b0b3a4',
    shedRoof: '#4d5a4a',
  },
  {
    // Desert: adobe, and a roof that is nearly a terrace.
    houseWall: '#d8b98c',
    houseRoof: '#a8794f',
    roofPitch: 0.6,
    blockWall: '#e0d3bb',
    blockRoof: '#b09a76',
    shedWall: '#bcae8f',
    shedRoof: '#6d604a',
  },
];

/** How a town of this climate is built. */
export function architectureFor(climate: MapClimate): TownArchitecture {
  return TOWN_ARCHITECTURE[climate] ?? TOWN_ARCHITECTURE[MapClimate.Temperate]!;
}
