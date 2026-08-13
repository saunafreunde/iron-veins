import { UNDO_MAX_PATCH_CELLS, UNDO_RING_DEPTH } from '../constants';
import { TICKS_PER_MONTH } from '../constants';
import { ACCOUNT_COUNT } from '../economy/ledger';
import { computeLandmasses, markOcean } from '../mapgen/hydrology';
import { Terrain } from '../map/terrain';
import type { TileMap } from '../map/TileMap';
import type { CompanyState } from '../types';
import type { World } from '../World';
import { ACCEPTED, CommandKind, RejectReason, type CommandOutcome } from './types';
import type { ApplyPatchCommand, Command } from './types';

/**
 * Undo and redo (SPEC2 M25, E-12) - the deferred half of D-114.
 *
 * The shape is the one E-12 settled and every alternative it vetoed is worth
 * naming, because each looks simpler from a distance:
 *
 *  - **The inverse is a PATCH, not a demolition.** E-12's sentence reads "Bau:
 *    Abriss + exakt der historisch verbuchte Betrag", and taking that literally
 *    fails the milestone's own acceptance: a demolition is not the inverse of a
 *    build. `BuildRoad` over a tile that already carried road only ADDS bits,
 *    and `demolishRoad` would clear the tile; `buildTrack` may pull a signal
 *    down on the way (a spur through a signalled tile), and no demolition puts
 *    it back. So the inverse is the BYTES the command moved, measured by
 *    diffing the map across its execution, plus the exact money it booked -
 *    which is D-092's rule and the only way "undone == never-done" can be a
 *    hash assertion rather than a hope.
 *  - **The patch travels IN the command.** A payload-free `Undo` that popped a
 *    ring inside the simulation would make a saved-then-loaded world answer the
 *    same command differently, because the ring is session-only: law #3 broken
 *    in exactly the silence Z4 was written about, and a replay re-simulated
 *    from a checkpoint would report a desync of its own making (D-244's
 *    `replayGenesis` finding, one instrument along). With the patch in the
 *    payload the outcome is a pure function of (world, command), the ring is
 *    ISSUER memory like the player's mouse, and no save byte is needed - which
 *    is why this milestone spends no `SAVE_VERSION` bump (verified, not
 *    assumed: `undoRing.spec.ts` plays a world with recording on and off and
 *    hashes both).
 *  - **The interface may not author one.** The patch carries the money it
 *    reverses, so a panel that built its own would be a panel that can print
 *    cash. `SimWorker` - the issuer that owns the ring - builds it from what
 *    the simulation recorded, which is why `ApplyPatch` is the one kind on
 *    `commandCoupling.spec.ts`'s `NO_UI_ISSUER` list.
 *  - **All or refused** (Fehlerkatalog 30). Every cell is checked against the
 *    value the recording left there BEFORE one byte is written, so a world that
 *    moved underneath an entry gets a refusal with a sentence rather than a
 *    half-applied edit.
 */

/**
 * The map layers an undoable command can write, and the whole list.
 *
 * Indices are the wire format of a patch, so the table is APPENDED to and never
 * reordered - the same discipline the `Account` list carries. Every layer here
 * is a byte-per-tile (or byte-per-corner) array that `hashWorld` covers; the
 * derived pair `oceanMask`/`landmassId` is deliberately absent and is
 * RECOMPUTED from the restored bytes instead ({@link ApplyPatchCommand.shoreline},
 * the `restoreGround` pattern of D-244).
 */
export const UNDO_LAYERS: readonly string[] = [
  'cornerHeight',
  'terrain',
  'roadBits',
  'trackBits',
  'railType',
  'signal',
  'structure',
  'structureHeight',
  'owner',
  'waypoint',
];

/** The layer array itself, or null for an index no build has ever written. */
function layerArray(map: TileMap, layer: number): Uint8Array | null {
  switch (layer) {
    case 0:
      return map.cornerHeight;
    case 1:
      return map.terrain;
    case 2:
      return map.roadBits;
    case 3:
      return map.trackBits;
    case 4:
      return map.railType;
    case 5:
      return map.signal;
    case 6:
      return map.structure;
    case 7:
      return map.structureHeight;
    case 8:
      return map.owner;
    case 9:
      return map.waypoint;
    default:
      return null;
  }
}

/**
 * The company figures a build or a demolition can move, in one vector.
 *
 * Read as a whole before the command and again after it, so the patch carries
 * DELTAS that were measured rather than a list of bookings somebody remembered
 * to instrument. The first seven are the scalars `bookExpense`, `refundBuild`
 * and the build commands themselves touch; the rest is the ledger row, because
 * "the amount historically booked" (D-092) is an amount in an ACCOUNT and not
 * only a movement of cash.
 */
const MONEY_SCALARS = 7;
const MONEY_LENGTH = MONEY_SCALARS + ACCOUNT_COUNT;

function readMoney(company: CompanyState, out: number[]): void {
  out[0] = company.cashCt;
  out[1] = company.profitThisYearCt;
  out[2] = company.expensesThisMonthCt;
  out[3] = company.revenueThisMonthCt;
  out[4] = company.fixedAssetsCt;
  out[5] = company.vehicleUpkeepPerYearCt;
  out[6] = company.infrastructureUpkeepPerYearCt;
  for (let i = 0; i < ACCOUNT_COUNT; i++) out[MONEY_SCALARS + i] = company.accounts[i] ?? 0;
}

/** Apply a money vector as a signed delta. `sign` is +1 for redo, -1 for undo. */
function applyMoney(company: CompanyState, delta: readonly number[], sign: number): void {
  company.cashCt += sign * (delta[0] ?? 0);
  company.profitThisYearCt += sign * (delta[1] ?? 0);
  company.expensesThisMonthCt += sign * (delta[2] ?? 0);
  company.revenueThisMonthCt += sign * (delta[3] ?? 0);
  company.fixedAssetsCt += sign * (delta[4] ?? 0);
  company.vehicleUpkeepPerYearCt += sign * (delta[5] ?? 0);
  company.infrastructureUpkeepPerYearCt += sign * (delta[6] ?? 0);
  for (let i = 0; i < ACCOUNT_COUNT; i++) {
    company.accounts[i] = (company.accounts[i] ?? 0) + sign * (delta[MONEY_SCALARS + i] ?? 0);
  }
}

/**
 * Does this vector move anything the calendar resets?
 *
 * `expensesThisMonthCt`, `revenueThisMonthCt` and the ledger row are the
 * month's own figures, and `profitThisYearCt` is the year's. Reversing them
 * after the month rolled over would subtract a January bill from a February
 * row - a world that is not the world where the build never happened, which is
 * the one thing this feature promises. So a patch that touched them is refused
 * once its month has closed, and one that touched none of them (a workshop
 * edit, which books nothing at all) is not.
 */
function movesDatedMoney(delta: readonly number[]): boolean {
  if ((delta[1] ?? 0) !== 0 || (delta[2] ?? 0) !== 0 || (delta[3] ?? 0) !== 0) return true;
  for (let i = 0; i < ACCOUNT_COUNT; i++) {
    if ((delta[MONEY_SCALARS + i] ?? 0) !== 0) return true;
  }
  return false;
}

/** The accounting month a tick falls in - the row `book()` writes into. */
export function accountingMonth(tick: number): number {
  return Math.floor(tick / TICKS_PER_MONTH);
}

/**
 * The command kinds an undo may take back, and the whole list (E-12: "nur
 * Bau/Abriss/Terraform").
 *
 * What unites them is not that they are cheap: it is that everything they
 * change lives in the map layers of {@link UNDO_LAYERS} and in the acting
 * company's books, so a recorded byte diff plus a recorded money delta IS the
 * inverse. {@link NOT_UNDOABLE} carries every other kind with the reason, and
 * `undoRing.spec.ts` holds the two lists against the real `CommandKind` table
 * in both directions - the D-133/D-183 shape, so a kind added later cannot
 * quietly become un-undoable or, worse, quietly become undoable.
 */
export const UNDOABLE_KINDS: readonly number[] = [
  CommandKind.RaiseLand,
  CommandKind.LowerLand,
  CommandKind.LevelLand,
  CommandKind.TerraformBrushRegion,
  CommandKind.BuildRoad,
  CommandKind.DemolishRoad,
  CommandKind.BuildTrack,
  CommandKind.DemolishTrack,
  CommandKind.BuildSignal,
  CommandKind.DemolishSignal,
  CommandKind.BuildWaypoint,
  CommandKind.DemolishWaypoint,
];

/** Is this kind one the ring records? */
export function isUndoable(kind: number): boolean {
  return UNDOABLE_KINDS.includes(kind);
}

/**
 * Every kind that is NOT undoable, each with the reason - the closed half of
 * the pair above.
 *
 * Three reasons appear, and none of them is "we ran out of time":
 *
 *  - **not a build** - money, orders, lines, contracts, vehicles. E-12 draws
 *    the line at Bau/Abriss/Terraform and a takeable-back loan is a different
 *    feature with a different argument.
 *  - **creates an entity** - the five station-module builds hand out a station
 *    id, join a neighbouring station, derive a catchment and a zone mix, and
 *    can be referenced by an order the moment they exist. Their inverse is not
 *    a byte diff, and a competitor building in between makes the array
 *    position the id rests on somebody else's. Named as the next bundle's work
 *    rather than half-delivered.
 *  - **writes state no layer holds** - `DemolishBuilding` books a demolition
 *    into the town council's own decaying memory (D-102), and the workshop's
 *    town, industry and river commands create towns, works and shorelines out
 *    of a named RNG stream. Both are inverses this mechanism cannot express,
 *    and claiming otherwise is exactly the partial undo Fehlerkatalog 30 vetoes.
 */
export const NOT_UNDOABLE: Readonly<Record<string, string>> = {
  SetCompanyName: 'not a build',
  SetCompanyColor: 'not a build',
  TakeLoan: 'not a build',
  RepayLoan: 'not a build',
  BuildRoadStop: 'creates a station entity',
  BuyRoadVehicle: 'not a build',
  SellVehicle: 'not a build',
  SetVehicleOrders: 'not a build',
  SetVehicleRunning: 'not a build',
  SendVehicleToDepot: 'not a build',
  BuildRailStop: 'creates a station entity',
  BuyTrain: 'not a build',
  RefitVehicle: 'not a build',
  BuildStationModule: 'creates a station entity',
  SetAutoRenew: 'not a build',
  BuildWaterStop: 'creates a station entity',
  BuyShip: 'not a build',
  BuildAirport: 'creates a station entity',
  BuyAircraft: 'not a build',
  BuyExclusiveRights: 'not a build',
  ApplyTownMeasure: 'not a build',
  DemolishBuilding: 'writes the council memory of 13.3',
  AcceptContract: 'not a build',
  AcceptSupplyContract: 'not a build',
  CreateLine: 'not a build',
  DeleteLine: 'not a build',
  SetLineOrders: 'not a build',
  AssignVehicleToLine: 'not a build',
  ReleaseVehicleFromLine: 'not a build',
  SetLineTakt: 'not a build',
  SetTransferNode: 'not a build',
  PlaceTownSeed: 'creates a town out of the editor RNG stream',
  PlaceIndustryAt: 'creates a works and rewires every station catchment',
  PaintForest: 'writes terrain the tree density is a pure function of',
  PaintRiver: 'moves the shoreline by digging, and creates water',
  ApplyPatch: 'is the undo itself',
};

/**
 * The context of everything a patch touched: every layer of every tile it
 * names, and the corner heights around those tiles, minus the cells it moved.
 *
 * This is what makes "the world moved underneath it" a question about the
 * GROUND rather than about the bytes the command happened to write. Without it
 * a road patch would notice a second road crossing its tiles (the road bits
 * moved) and would NOT notice a waypoint planted on one of them - and would
 * then pull the road out from under the marker, leaving a state no command of
 * this game can produce. Corner heights are guarded for the mirror case: a
 * demolition taken back onto ground that has been dug since.
 *
 * Returns false when the guard would push the patch over
 * {@link UNDO_MAX_PATCH_CELLS}; the caller then records nothing at all.
 */
function collectGuards(
  map: TileMap,
  maxCells: number,
  layers: readonly number[],
  indices: readonly number[],
  outLayers: number[],
  outIndices: number[],
  outValues: number[],
): boolean {
  const size = map.size;
  const stride = size + 1;
  const tileCount = size * size;
  const changed = new Set<number>();
  for (let i = 0; i < layers.length; i++) changed.add(layers[i]! * 0x1000000 + indices[i]!);

  // Which tiles the patch is about. A corner belongs to the four tiles around
  // it; every other layer is indexed by tile already.
  const tiles = new Set<number>();
  for (let i = 0; i < layers.length; i++) {
    const index = indices[i]!;
    if (layers[i] !== 0) {
      tiles.add(index);
      continue;
    }
    const cx = index % stride;
    const cy = (index / stride) | 0;
    for (let dy = -1; dy <= 0; dy++) {
      for (let dx = -1; dx <= 0; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
        tiles.add(ty * size + tx);
      }
    }
  }

  // Ascending tile order and ascending layer order: a total order no two
  // entries tie on, so the same edit records the same guard list every time
  // (law #3 - the payload travels in the command log).
  const ordered = [...tiles].sort((a, b) => a - b);
  const budget = maxCells - layers.length;
  const guardedCorners = new Set<number>();
  for (const tile of ordered) {
    if (tile < 0 || tile >= tileCount) continue;
    const tx = tile % size;
    const ty = (tile / size) | 0;
    for (let layer = 1; layer < UNDO_LAYERS.length; layer++) {
      if (changed.has(layer * 0x1000000 + tile)) continue;
      const live = layerArray(map, layer);
      if (live === null) continue;
      if (outLayers.length >= budget) return false;
      outLayers.push(layer);
      outIndices.push(tile);
      outValues.push(live[tile]!);
    }
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const corner = (ty + dy) * stride + (tx + dx);
        // Neighbouring tiles share corners; guarding one twice would only make
        // the payload longer.
        if (changed.has(corner) || guardedCorners.has(corner)) continue;
        guardedCorners.add(corner);
        if (outLayers.length >= budget) return false;
        outLayers.push(0);
        outIndices.push(corner);
        outValues.push(map.cornerHeight[corner]!);
      }
    }
  }
  return true;
}

/** One recorded change, ready to be turned into a command in either direction. */
export interface RecordedPatch {
  /** The `CommandKind` this was recorded from. Reported, never re-executed. */
  readonly sourceKind: number;
  /** Accounting month the money was booked in. */
  readonly monthIndex: number;
  readonly layers: number[];
  readonly indices: number[];
  readonly before: number[];
  readonly after: number[];
  /** Cells the command did not change, on the ground it touched. */
  readonly guardLayers: number[];
  readonly guardIndices: number[];
  readonly guardValues: number[];
  /** After minus before, over {@link readMoney}'s vector. */
  readonly money: number[];
  /** Whether land and water changed places, so the derived layers must move. */
  readonly shoreline: boolean;
}

/**
 * The session ring (SPEC2 M25, depth {@link UNDO_RING_DEPTH}).
 *
 * It hangs off the `World` because that is where the command execution it
 * measures happens, and it is NOT world state: never saved, never hashed, and
 * never read by a simulation decision. That is not the Z4 exemption being
 * stretched - the exemption is for reading overlays - it is that the ring
 * influences nothing at all inside the simulation. What an `ApplyPatch` does is
 * decided by its own payload; the ring only decides which command the ISSUER
 * offers to build, exactly as the player's own hand decides which tile to
 * click. `undoRing.spec.ts` proves the world half by running the same commands
 * with recording on and off and comparing `hashWorld`.
 *
 * Recording is OPT-IN and off by default. A quarter-century AI game issues
 * thousands of builds nobody will ever undo, and a diff over ten map layers per
 * command would be a cost every balance run pays for a feature only an
 * interactive session uses.
 */
export class UndoRecorder {
  /** Off unless a live session turned it on (`SimWorker.adoptWorld`). */
  enabled = false;

  /**
   * Largest patch this ring will hold, {@link UNDO_MAX_PATCH_CELLS} by
   * default.
   *
   * A field rather than the constant read directly, for one reason: no command
   * this game HAS can produce a diff that big (the worst case is a maximum
   * brush, measured in `undoRing.spec.ts`), so the overflow branch would be
   * unreachable code that nobody had ever seen run. A test lowers it and
   * watches the ring clear - the injected-AudioContext pattern of M9.
   */
  maxCells = UNDO_MAX_PATCH_CELLS;

  /** Newest last. Longer than {@link UNDO_RING_DEPTH} never happens. */
  readonly undoStack: RecordedPatch[] = [];
  /** Newest last; cleared the moment a new undoable command is recorded. */
  readonly redoStack: RecordedPatch[] = [];

  private scratch: (Uint8Array | null)[] = [];
  private readonly moneyBefore: number[] = new Array<number>(MONEY_LENGTH).fill(0);
  private readonly moneyAfter: number[] = new Array<number>(MONEY_LENGTH).fill(0);
  private recording = false;

  /** Forget everything - a new world, a load, or a replay being entered. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  /**
   * Copy every patchable layer aside before a command runs.
   *
   * The copies are the ONLY way the diff can be honest: a list of "the cells
   * this kind touches" written by hand is a list that is wrong the first time a
   * command grows a case (the spur of D-210, the signal a track build pulls
   * down), and a wrong list is a wrong undo nobody would notice until a hash
   * moved. The scratch is allocated once per world and reused.
   */
  begin(world: World): void {
    if (!this.enabled) return;
    const map = world.map;
    for (let layer = 0; layer < UNDO_LAYERS.length; layer++) {
      const live = layerArray(map, layer);
      if (live === null) continue;
      let copy = this.scratch[layer] ?? null;
      if (copy === null || copy.length !== live.length) {
        copy = new Uint8Array(live.length);
        this.scratch[layer] = copy;
      }
      copy.set(live);
    }
    readMoney(world.company, this.moneyBefore);
    this.recording = true;
  }

  /**
   * Diff what the command changed and push it onto the ring.
   *
   * A refused command changed nothing by construction (`editorAtomicity.spec.ts`
   * holds that for the workshop kinds and the same is true of every build), so
   * a refusal records nothing and leaves the ring exactly as it was.
   */
  finish(world: World, sourceKind: number, accepted: boolean): void {
    if (!this.recording) return;
    this.recording = false;
    if (!accepted) return;

    const map = world.map;
    const layers: number[] = [];
    const indices: number[] = [];
    const before: number[] = [];
    const after: number[] = [];
    let shoreline = false;
    let overflowed = false;

    for (let layer = 0; layer < UNDO_LAYERS.length && !overflowed; layer++) {
      const live = layerArray(map, layer);
      const copy = this.scratch[layer] ?? null;
      if (live === null || copy === null) continue;
      for (let index = 0; index < live.length; index++) {
        const now = live[index]!;
        const then = copy[index]!;
        if (now === then) continue;
        if (layers.length >= this.maxCells) {
          overflowed = true;
          break;
        }
        layers.push(layer);
        indices.push(index);
        before.push(then);
        after.push(now);
        // Corner heights decide what is submerged, and a terrain cell that was
        // or became water IS the shoreline moving. Either means the derived
        // ocean mask and land masses have to be recomputed from the restored
        // bytes rather than trusted (`restoreGround`'s rule, D-244).
        if (layer === 0) shoreline = true;
        else if (layer === 1 && (now === Terrain.Water || then === Terrain.Water)) shoreline = true;
      }
    }

    const guardLayers: number[] = [];
    const guardIndices: number[] = [];
    const guardValues: number[] = [];
    if (!overflowed) {
      overflowed = !collectGuards(
        map,
        this.maxCells,
        layers,
        indices,
        guardLayers,
        guardIndices,
        guardValues,
      );
    }

    readMoney(world.company, this.moneyAfter);
    const money: number[] = new Array<number>(MONEY_LENGTH);
    let movedMoney = false;
    for (let i = 0; i < MONEY_LENGTH; i++) {
      money[i] = (this.moneyAfter[i] ?? 0) - (this.moneyBefore[i] ?? 0);
      if (money[i] !== 0) movedMoney = true;
    }

    // An edit too large to express takes the ring with it: undo is
    // last-in-first-out, and an entry that cannot be recorded would otherwise
    // leave the one underneath it as the next thing Ctrl+Z takes back - the
    // wrong edit, silently. Same for a command that changed nothing at all in
    // the layers AND nothing in the books: there is nothing to take back.
    if (overflowed) {
      this.clear();
      return;
    }
    if (layers.length === 0 && !movedMoney) return;

    // A new authored change makes every redo unreachable: the branch it would
    // have replayed no longer starts where it did.
    this.redoStack.length = 0;
    this.undoStack.push({
      sourceKind,
      monthIndex: accountingMonth(world.tick),
      layers,
      indices,
      before,
      after,
      guardLayers,
      guardIndices,
      guardValues,
      money,
      shoreline,
    });
    if (this.undoStack.length > UNDO_RING_DEPTH) this.undoStack.shift();
  }
}

/**
 * Turn a recorded patch into the command that applies it.
 *
 * `direction` is -1 to take the change back and +1 to put it in again; the
 * cells carry both sides, so redo is the same payload read the other way round
 * rather than a second recording.
 */
export function patchCommand(patch: RecordedPatch, direction: number): ApplyPatchCommand {
  return {
    kind: CommandKind.ApplyPatch,
    direction,
    sourceKind: patch.sourceKind,
    monthIndex: patch.monthIndex,
    layers: patch.layers,
    indices: patch.indices,
    before: patch.before,
    after: patch.after,
    guardLayers: patch.guardLayers,
    guardIndices: patch.guardIndices,
    guardValues: patch.guardValues,
    money: patch.money,
    shoreline: patch.shoreline,
  };
}

/** The patch a command carries, read back as a ring entry. */
export function patchOf(command: ApplyPatchCommand): RecordedPatch {
  return {
    sourceKind: command.sourceKind,
    monthIndex: command.monthIndex,
    layers: [...command.layers],
    indices: [...command.indices],
    before: [...command.before],
    after: [...command.after],
    guardLayers: [...command.guardLayers],
    guardIndices: [...command.guardIndices],
    guardValues: [...command.guardValues],
    money: [...command.money],
    shoreline: command.shoreline,
  };
}

/**
 * Apply an inverse patch - the whole of it, or none of it.
 *
 * The three refusals are three different things going wrong and each says so
 * (section 17.3):
 *
 *  - `invalidPatch` - the payload does not describe an edit of this map at all
 *    (parallel arrays of different lengths, a layer this build does not have, a
 *    cell outside the map). A recorded patch never looks like this; a hand-made
 *    one might.
 *  - `patchStale` - the world moved underneath the entry. One cell holding
 *    something other than what the recording left there is enough, and the
 *    check runs over EVERY cell before the first byte is written.
 *  - `patchMonthClosed` - the money cannot be put back where it came from,
 *    because the month it was booked in has closed and its ledger row is gone.
 *    Undoing into the current row would leave a world that is not the world
 *    where the build never happened, which is the claim the whole feature rests
 *    on.
 */
export function applyPatch(world: World, command: ApplyPatchCommand): CommandOutcome {
  const direction = command.direction;
  if (direction !== 1 && direction !== -1) {
    return { ok: false, reasonKey: RejectReason.InvalidPatch };
  }
  const count = command.layers.length;
  const guards = command.guardLayers.length;
  if (
    command.indices.length !== count ||
    command.before.length !== count ||
    command.after.length !== count ||
    command.guardIndices.length !== guards ||
    command.guardValues.length !== guards ||
    command.money.length !== MONEY_LENGTH
  ) {
    return { ok: false, reasonKey: RejectReason.InvalidPatch };
  }

  const map = world.map;
  // Undo reads the cells the command LEFT behind and writes back what was
  // there; redo does exactly the opposite. One table, read from either end.
  const expected = direction === -1 ? command.after : command.before;
  const written = direction === -1 ? command.before : command.after;

  for (let i = 0; i < count; i++) {
    const live = layerArray(map, command.layers[i]!);
    if (live === null) return { ok: false, reasonKey: RejectReason.InvalidPatch };
    const index = command.indices[i]!;
    if (!Number.isInteger(index) || index < 0 || index >= live.length) {
      return { ok: false, reasonKey: RejectReason.InvalidPatch };
    }
    const value = written[i]!;
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return { ok: false, reasonKey: RejectReason.InvalidPatch };
    }
    if (live[index] !== expected[i]) return { ok: false, reasonKey: RejectReason.PatchStale };
  }

  // The context: every layer of every tile this patch is about. A guard cell
  // carries one value because the command did not move it, so it reads the
  // same on either side of the edit and the same check serves undo and redo.
  for (let i = 0; i < guards; i++) {
    const live = layerArray(map, command.guardLayers[i]!);
    if (live === null) return { ok: false, reasonKey: RejectReason.InvalidPatch };
    const index = command.guardIndices[i]!;
    if (!Number.isInteger(index) || index < 0 || index >= live.length) {
      return { ok: false, reasonKey: RejectReason.InvalidPatch };
    }
    if (live[index] !== command.guardValues[i]) {
      return { ok: false, reasonKey: RejectReason.PatchStale };
    }
  }

  if (movesDatedMoney(command.money) && accountingMonth(world.tick) !== command.monthIndex) {
    return { ok: false, reasonKey: RejectReason.PatchMonthClosed };
  }

  for (let i = 0; i < count; i++) {
    layerArray(map, command.layers[i]!)![command.indices[i]!] = written[i]!;
  }
  applyMoney(world.company, command.money, direction);

  if (count > 0) {
    // Both counters: a patch may hold track, a signal or a bridge, and the
    // block index and the rail pathfinder key on `trackRevision` (D-232).
    map.noteChange();
    if (command.shoreline) {
      markOcean(map);
      computeLandmasses(map);
    }
  }
  return ACCEPTED;
}

/** Is this command an inverse patch? Used by the issuer, never by a decision. */
export function isPatchCommand(command: Command): command is ApplyPatchCommand {
  return command.kind === CommandKind.ApplyPatch;
}
