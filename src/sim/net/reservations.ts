/**
 * Who owns which piece of track, right now (section 9).
 *
 * One entry per map tile holding the id of the vehicle that has claimed it, or
 * -1. That is the entire data structure: no block graph, no flood fill, no
 * node numbering. Keying by TILE INDEX rather than by anything derived is what
 * makes it survive a `map.revision` bump, a pathfinder reindex and a save/load
 * round trip without a single line of maintenance.
 *
 * The table is DERIVED - it is a pure function of each train's two reservation
 * indices and its saved route - so it is neither serialised nor hashed, and it
 * is rebuilt on load beside the land masses and the ocean mask.
 */
export class ReservationTable {
  /**
   * Owning vehicle id per tile, -1 for free.
   *
   * Int16 is deliberate: MAX_VEHICLES is 4_000 and fits with room to spare.
   * Raising that constant past 32_767 has to widen this array.
   */
  private readonly owner: Int16Array;

  constructor(tileCount: number) {
    this.owner = new Int16Array(tileCount).fill(-1);
  }

  ownerOf(tile: number): number {
    return this.owner[tile]!;
  }

  /** True when the tile is free or already this vehicle's. */
  freeFor(tile: number, vehicleId: number): boolean {
    const owner = this.owner[tile]!;
    return owner === -1 || owner === vehicleId;
  }

  set(tile: number, vehicleId: number): void {
    this.owner[tile] = vehicleId;
  }

  /** Release a tile, but only if this vehicle is the one holding it. */
  clearIfOwnedBy(tile: number, vehicleId: number): void {
    if (this.owner[tile] === vehicleId) this.owner[tile] = -1;
  }

  /** Drop every claim. Used when a world is rebuilt from a save. */
  reset(): void {
    this.owner.fill(-1);
  }
}
