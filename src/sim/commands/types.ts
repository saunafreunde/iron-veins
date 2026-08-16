/**
 * Every state change of the simulation goes through a command (architecture
 * law #6). Commands are plain serialisable objects: that is what makes replays,
 * save verification, undo and - later - multiplayer possible without touching
 * the simulation itself.
 */

export const CommandKind = {
  SetCompanyName: 1,
  SetCompanyColor: 2,
  TakeLoan: 3,
  RepayLoan: 4,
  RaiseLand: 5,
  LowerLand: 6,
  LevelLand: 7,
  BuildRoad: 8,
  DemolishRoad: 9,
  BuildRoadStop: 10,
  BuyRoadVehicle: 11,
  SellVehicle: 12,
  SetVehicleOrders: 13,
  SetVehicleRunning: 14,
  BuildTrack: 15,
  DemolishTrack: 16,
  BuildRailStop: 17,
  BuyTrain: 18,
  BuildSignal: 19,
  DemolishSignal: 20,
  RefitVehicle: 21,
  BuildStationModule: 22,
  SetAutoRenew: 23,
  BuildWaterStop: 24,
  BuyShip: 25,
  BuildAirport: 26,
  BuyAircraft: 27,
  BuyExclusiveRights: 28,
  ApplyTownMeasure: 29,
  DemolishBuilding: 30,
  AcceptContract: 31,
  BuildWaypoint: 32,
  DemolishWaypoint: 33,
  CreateLine: 34,
  DeleteLine: 35,
  SetLineOrders: 36,
  AssignVehicleToLine: 37,
  ReleaseVehicleFromLine: 38,
  SetLineTakt: 39,
  SetTransferNode: 40,
  /** Divert a vehicle to its home shed and park it there (SPEC2 M14). */
  SendVehicleToDepot: 41,
  /** Take on one of the standing supply orders of SPEC2 M21. */
  AcceptSupplyContract: 42,
  /** Raise or lower a whole square of corners at once (SPEC2 M22). */
  TerraformBrushRegion: 43,
  /** Found a town where the author points (SPEC2 M22). */
  PlaceTownSeed: 44,
  /** Site one industry of a chosen type (SPEC2 M22). */
  PlaceIndustryAt: 45,
  /** Plant wood over a square region (SPEC2 M22). */
  PaintForest: 46,
  /** Cut a watercourse down to the sea (SPEC2 M22). */
  PaintRiver: 47,
  /** Take a build, a demolition or a terraform back, or put it in again (M25). */
  ApplyPatch: 48,
} as const;
export type CommandKind = (typeof CommandKind)[keyof typeof CommandKind];

export interface SetCompanyNameCommand {
  readonly kind: typeof CommandKind.SetCompanyName;
  readonly name: string;
}

export interface SetCompanyColorCommand {
  readonly kind: typeof CommandKind.SetCompanyColor;
  readonly colorIndex: number;
}

export interface TakeLoanCommand {
  readonly kind: typeof CommandKind.TakeLoan;
  /** Desired amount; rounded down to a whole loan step on execution. [cent] */
  readonly amountCt: number;
}

export interface RepayLoanCommand {
  readonly kind: typeof CommandKind.RepayLoan;
  /** Desired amount; rounded down to a whole loan step on execution. [cent] */
  readonly amountCt: number;
}

/** Raise or lower one map corner by one height level. */
export interface RaiseLandCommand {
  readonly kind: typeof CommandKind.RaiseLand;
  readonly x: number;
  readonly y: number;
}

export interface LowerLandCommand {
  readonly kind: typeof CommandKind.LowerLand;
  readonly x: number;
  readonly y: number;
}

/** Flatten one tile down to its lowest corner. */
export interface LevelLandCommand {
  readonly kind: typeof CommandKind.LevelLand;
  readonly x: number;
  readonly y: number;
}

export interface BuildRoadCommand {
  readonly kind: typeof CommandKind.BuildRoad;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface DemolishRoadCommand {
  readonly kind: typeof CommandKind.DemolishRoad;
  readonly x: number;
  readonly y: number;
}

export interface BuildRoadStopCommand {
  readonly kind: typeof CommandKind.BuildRoadStop;
  readonly x: number;
  readonly y: number;
  /** A value of ModuleKind. */
  readonly moduleKind: number;
}

export interface BuyRoadVehicleCommand {
  readonly kind: typeof CommandKind.BuyRoadVehicle;
  /** Tile of the depot module the vehicle appears at. */
  readonly x: number;
  readonly y: number;
  readonly specId: number;
}

export interface SellVehicleCommand {
  readonly kind: typeof CommandKind.SellVehicle;
  readonly vehicleId: number;
}

/**
 * One entry of a vehicle's cyclic order list - the wire form of the full 12.1
 * grammar. The fields beyond the M5 four are optional so that every recorded
 * log and every existing issuer stays valid; the parser and the executor fill
 * the documented defaults (-1 / 0 / no condition), and the sim-side `Order`
 * record always carries all ten fields.
 */
export interface OrderSpec {
  /** A value of OrderTarget. */
  readonly target: number;
  /** Station id, or the tile index of a depot or waypoint. */
  readonly targetId: number;
  /** A value of OrderLoad. */
  readonly load: number;
  /** A value of OrderUnload. */
  readonly unload: number;
  /** Cargo to refit to at this stop; -1 or absent for none. */
  readonly refitTo?: number;
  /** Minimum dwell at this stop; 0 or absent for none. [ticks] */
  readonly waitTicks?: number;
  /** A value of OrderConditionKind; -1 or absent for no condition. */
  readonly condKind?: number;
  /** A value of OrderComparator; only read when condKind is set. */
  readonly condComparator?: number;
  /** Right-hand side of the comparison; only read when condKind is set. */
  readonly condValue?: number;
  /** Order index the jump lands on; only read when condKind is set. */
  readonly condJumpTo?: number;
}

export interface SetVehicleOrdersCommand {
  readonly kind: typeof CommandKind.SetVehicleOrders;
  readonly vehicleId: number;
  readonly orders: readonly OrderSpec[];
}

/**
 * The "send to depot" button of the M14 vehicle detail: a one-shot diversion
 * to the vehicle's home shed. The schedule is untouched - see
 * `vehicles/update.ts` `divertToDepot` for what the flag does.
 */
export interface SendVehicleToDepotCommand {
  readonly kind: typeof CommandKind.SendVehicleToDepot;
  readonly vehicleId: number;
}

export interface SetVehicleRunningCommand {
  readonly kind: typeof CommandKind.SetVehicleRunning;
  readonly vehicleId: number;
  readonly running: boolean;
}

/** Lay track from one tile to another, optionally via the route assistant. */
export interface BuildTrackCommand {
  readonly kind: typeof CommandKind.BuildTrack;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** A value of RailType. */
  readonly railType: number;
  /** False lays exactly the line the player drew (the manual mode of 8.2). */
  readonly assistant: boolean;
  /**
   * Spacing of automatic signalling, in tiles, or 0 for none (section 9.4).
   *
   * Carried by the command rather than read from a constant because the spec
   * calls the spacing selectable: a replay has to lay the same signals the
   * player did, and that is only true if the number they chose travels with
   * the command.
   */
  readonly signalSpacing: number;
}

export interface DemolishTrackCommand {
  readonly kind: typeof CommandKind.DemolishTrack;
  readonly x: number;
  readonly y: number;
}

/** Place a platform tile or a rail depot on an existing piece of track. */
export interface BuildRailStopCommand {
  readonly kind: typeof CommandKind.BuildRailStop;
  readonly x: number;
  readonly y: number;
  /** A value of ModuleKind: RailPlatform or RailDepot. */
  readonly moduleKind: number;
}

/**
 * Assemble a train in a rail depot. The units are catalogue ids in the order
 * they run, locomotive first (section 11.2).
 */
export interface BuyTrainCommand {
  readonly kind: typeof CommandKind.BuyTrain;
  readonly x: number;
  readonly y: number;
  readonly specIds: readonly number[];
}

/**
 * Take on one of the open tenders of section 14.4.
 *
 * Free, and optional. The bet is entirely at the far end: deliver and the bonus
 * is paid, miss the deadline and the penalty and the rating malus are.
 */
export interface AcceptContractCommand {
  readonly kind: typeof CommandKind.AcceptContract;
  readonly contractId: number;
}

/**
 * Promise a consuming works its monthly quota (SPEC2 M21).
 *
 * Free to take on, like a tender, and binding in the same way: every month the
 * company is judged on its share of the quota and paid or charged for it.
 * Several companies may hold the same order - a works does not care whose coal
 * it is - and each is then judged on an equal share of it.
 */
export interface AcceptSupplyContractCommand {
  readonly kind: typeof CommandKind.AcceptSupplyContract;
  readonly contractId: number;
}

/** Buy twelve months of exclusive building rights in a town (section 13.3). */
export interface BuyExclusiveRightsCommand {
  readonly kind: typeof CommandKind.BuyExclusiveRights;
  readonly townId: number;
}

/** Pay for one of the council measures of section 13.3. */
export interface ApplyTownMeasureCommand {
  readonly kind: typeof CommandKind.ApplyTownMeasure;
  readonly townId: number;
  /** A value of TownMeasure. */
  readonly measure: number;
}

/**
 * Clear a town building out of the way.
 *
 * The one thing in the game that costs a company standing with a council
 * rather than only money - which is what makes "abgerissene Gebaeude" in
 * section 13.3 a real term rather than one that is always zero.
 */
export interface DemolishBuildingCommand {
  readonly kind: typeof CommandKind.DemolishBuilding;
  readonly x: number;
  readonly y: number;
}

/** Build an airport, in one of the three sizes of section 10. */
export interface BuildAirportCommand {
  readonly kind: typeof CommandKind.BuildAirport;
  readonly x: number;
  readonly y: number;
  /** A value of ModuleKind; one of the three airport kinds. */
  readonly moduleKind: number;
}

/** Buy an aircraft at an airport. */
export interface BuyAircraftCommand {
  readonly kind: typeof CommandKind.BuyAircraft;
  readonly x: number;
  readonly y: number;
  readonly specId: number;
}

/** Place a quay or a ship shed on a water tile that touches the shore. */
export interface BuildWaterStopCommand {
  readonly kind: typeof CommandKind.BuildWaterStop;
  readonly x: number;
  readonly y: number;
  /** A value of ModuleKind; only Quay and ShipDepot are accepted. */
  readonly moduleKind: number;
}

/** Buy a ship at a ship shed. */
export interface BuyShipCommand {
  readonly kind: typeof CommandKind.BuyShip;
  readonly x: number;
  readonly y: number;
  readonly specId: number;
}

/**
 * Turn automatic vehicle renewal on or off (section 11.3).
 *
 * A command rather than a UI preference, because it spends money and changes
 * the fleet - and everything that changes state goes through a command, which
 * is what buys the replay (law #6).
 *
 * Per LINE since M11, where the spec always attached it (the company-wide
 * switch was the D-093 stopgap). `lineId` -1 - which is also what a pre-M11
 * log's entry parses to - addresses every line the acting company owns, so an
 * old command stays parseable and keeps a meaning instead of becoming a
 * refusal.
 */
export interface SetAutoRenewCommand {
  readonly kind: typeof CommandKind.SetAutoRenew;
  /** A line id, or -1 for every line the acting company owns. */
  readonly lineId: number;
  readonly enabled: boolean;
}

/**
 * Open a new, empty line (section 12.2) owned by the acting company.
 *
 * Deliberately parameterless: the id the store hands out is observed, never
 * predicted - the player's panel and the AI's project machinery both find the
 * new line by looking (the D-108 discipline), because a command cannot carry
 * an id that does not exist yet.
 */
export interface CreateLineCommand {
  readonly kind: typeof CommandKind.CreateLine;
}

/** Dissolve a line. Its vehicles are released and keep a private copy. */
export interface DeleteLineCommand {
  readonly kind: typeof CommandKind.DeleteLine;
  readonly lineId: number;
}

/**
 * Replace a line's shared order list. Every vehicle assigned to the line
 * switches to the new list in this very tick and re-anchors to its nearest
 * stop (the rule in lines/LineStore.ts).
 */
export interface SetLineOrdersCommand {
  readonly kind: typeof CommandKind.SetLineOrders;
  readonly lineId: number;
  readonly orders: readonly OrderSpec[];
}

/** Put a vehicle on a line; from then on it runs the line's list, live. */
export interface AssignVehicleToLineCommand {
  readonly kind: typeof CommandKind.AssignVehicleToLine;
  readonly vehicleId: number;
  readonly lineId: number;
}

/** Take a vehicle off its line, leaving it a private copy of the list. */
export interface ReleaseVehicleFromLineCommand {
  readonly kind: typeof CommandKind.ReleaseVehicleFromLine;
  readonly vehicleId: number;
}

/**
 * Set a line's timetable (section 12.3): the takt and the start offset of
 * its departure grid, both in ticks. A takt of 0 - with offset 0 - switches
 * the timetable off. Pure line data set by an ordinary command, exactly like
 * the order list; no world rule and no randomness anywhere near it (E-07).
 */
export interface SetLineTaktCommand {
  readonly kind: typeof CommandKind.SetLineTakt;
  readonly lineId: number;
  /** 0, or TAKT_MIN_TICKS..TAKT_MAX_TICKS. [ticks] */
  readonly taktTicks: number;
  /** 0 <= offset < taktTicks; 0 when the takt is off. [ticks] */
  readonly offsetTicks: number;
}

/**
 * Mark a station as an "Umsteigeknoten" of section 12.3, or unmark it. Per
 * STATION - the section marks stations, not line stops - and only the
 * station's owner may flip it.
 */
export interface SetTransferNodeCommand {
  readonly kind: typeof CommandKind.SetTransferNode;
  readonly stationId: number;
  readonly transferNode: boolean;
}

/**
 * Place a support module - crane, canopy or cold store - on clear ground beside
 * a station that already exists (section 10).
 */
export interface BuildStationModuleCommand {
  readonly kind: typeof CommandKind.BuildStationModule;
  readonly x: number;
  readonly y: number;
  /** A value of ModuleKind; only the three support kinds are accepted. */
  readonly moduleKind: number;
}

/** Place a signal on a piece of plain line. */
export interface BuildSignalCommand {
  readonly kind: typeof CommandKind.BuildSignal;
  readonly x: number;
  readonly y: number;
  /** A value of SignalKind. */
  readonly signalKind: number;
  /** A value of TrackDir; only read for the one-way kinds. */
  readonly direction: number;
}

export interface DemolishSignalCommand {
  readonly kind: typeof CommandKind.DemolishSignal;
  readonly x: number;
  readonly y: number;
}

/**
 * Place a waypoint marker (section 12.1). What it becomes is what the tile
 * carries: a marker post on track, a buoy on water, a roadside sign on a road.
 */
export interface BuildWaypointCommand {
  readonly kind: typeof CommandKind.BuildWaypoint;
  readonly x: number;
  readonly y: number;
}

export interface DemolishWaypointCommand {
  readonly kind: typeof CommandKind.DemolishWaypoint;
  readonly x: number;
  readonly y: number;
}

/**
 * Convert a vehicle to carry another cargo. Only in a depot, only to something
 * it can be converted to, and only while it is empty.
 */
export interface RefitVehicleCommand {
  readonly kind: typeof CommandKind.RefitVehicle;
  readonly vehicleId: number;
  /** A value of Cargo. */
  readonly cargo: number;
}

/**
 * Raise or lower every corner of a square region by one level (SPEC2 M22).
 *
 * The region is the square of half width `radius` on the CORNER grid around
 * (x, y), so a radius of 0 is exactly `RaiseLand`/`LowerLand` and a radius of
 * `EDITOR_BRUSH_MAX_RADIUS` is the largest edit one command may name. The cap
 * is a property of the COMMAND rather than of the tool that issues it: a
 * recorded log has to be replayable by a build whose palette offers different
 * brush sizes, and an uncapped bulk edit is an unbounded amount of work behind
 * one entry (SPEC2 M22's "Regionsdeckel pro Command").
 *
 * Every corner runs the ordinary terraform cascade, and the whole region is
 * swept by `enforceSlopeInvariant` afterwards.
 */
export interface TerraformBrushRegionCommand {
  readonly kind: typeof CommandKind.TerraformBrushRegion;
  /** Centre corner of the brush. */
  readonly x: number;
  readonly y: number;
  /** Half width of the square, 0..EDITOR_BRUSH_MAX_RADIUS. [corners] */
  readonly radius: number;
  /** A value of TerraformDirection: 1 raises, -1 lowers. */
  readonly direction: number;
}

/**
 * Found a town at a chosen tile (SPEC2 M22).
 *
 * The generator's own placement - claim the ground, lay the streets, put the
 * houses up, prune what serves nothing, pave last - run at ONE spot the author
 * names instead of at a dart the generator threw. What it does NOT do is
 * choose the spot: `isValidCentre` and the Poisson spacing of `TOWN_MIN_DISTANCE`
 * are asked here exactly as the generator asks them, so a town the workshop
 * places is a town the generator could have placed.
 */
export interface PlaceTownSeedCommand {
  readonly kind: typeof CommandKind.PlaceTownSeed;
  readonly x: number;
  readonly y: number;
  /** A value of TownSize: which of the three starting populations. */
  readonly sizeClass: number;
}

/**
 * Site one industry of a chosen type at a chosen tile (SPEC2 M22).
 *
 * The placement RULES of section 6.6 are asked at the named spot - footprint,
 * terrain, height, the required near-terrain, the near-town distance and the
 * minimum distance to the next works - because an industry standing where its
 * own rule forbids is a works the generator would never make and the balance
 * tables have never priced.
 */
export interface PlaceIndustryAtCommand {
  readonly kind: typeof CommandKind.PlaceIndustryAt;
  readonly x: number;
  readonly y: number;
  /** A value of IndustryType. */
  readonly industryType: number;
}

/** Plant wood over a square region of tiles (SPEC2 M22). */
export interface PaintForestCommand {
  readonly kind: typeof CommandKind.PaintForest;
  readonly x: number;
  readonly y: number;
  /** Half width of the square, 0..EDITOR_BRUSH_MAX_RADIUS. [tiles] */
  readonly radius: number;
}

/**
 * Cut a watercourse through a square region (SPEC2 M22).
 *
 * It writes NO terrain. SPEC2 M22 asks for "standing water at height X" to be
 * formalised or refused, and it is REFUSED: the game has exactly one water
 * surface - a tile is water when even its highest corner is at or below
 * `SEA_LEVEL` - so this command DIGS each named tile down until the sea is
 * there by the game's own rule, and the ordinary shoreline refresh floods it.
 * Water made that way survives every later terraform, which is precisely what
 * the `applyRivers`/`refreshShoreline` revert quirk does not.
 *
 * The consequence is stated rather than hidden: a region that cannot reach sea
 * level inside one command's earth budget is refused whole, so the workshop
 * cuts rivers near the coast and through low ground, and the author raises the
 * land afterwards rather than painting a river up a mountain.
 */
export interface PaintRiverCommand {
  readonly kind: typeof CommandKind.PaintRiver;
  readonly x: number;
  readonly y: number;
  /** Half width of the square, 0..EDITOR_BRUSH_MAX_RADIUS. [tiles] */
  readonly radius: number;
}

/**
 * Undo or redo one recorded build, demolition or terraform (SPEC2 M25, E-12).
 *
 * The command IS the inverse patch: the cells the recorded command moved, with
 * the value on either side, plus the money it booked to the cent - D-092's
 * "never recomputed" taken literally. That is what lets the outcome be a pure
 * function of (world, command), which in turn is what lets the session ring be
 * session-only: a payload-free "undo the last thing" would answer differently
 * in a world that had been saved and loaded, and a replay re-simulated from a
 * checkpoint would report a desync of its own making.
 *
 * The parallel arrays are all the same length and are the wire form of one list
 * of cells; `commands/undo.ts` owns the layer numbering and the validation, and
 * refuses the WHOLE patch when a single cell has moved underneath it
 * (Fehlerkatalog 30 - a partial undo is worse than none).
 */
export interface ApplyPatchCommand {
  readonly kind: typeof CommandKind.ApplyPatch;
  /** -1 takes the recorded change back, +1 puts it in again. */
  readonly direction: number;
  /** The CommandKind the patch was recorded from. Reported, never re-executed. */
  readonly sourceKind: number;
  /** Accounting month the money was booked in; a closed month is refused. */
  readonly monthIndex: number;
  /** Layer of each cell, indexing `UNDO_LAYERS`. */
  readonly layers: readonly number[];
  /** Index of each cell inside its layer. */
  readonly indices: readonly number[];
  /** Value each cell held before the recorded command ran. */
  readonly before: readonly number[];
  /** Value it held after. */
  readonly after: readonly number[];
  /**
   * Cells the command did NOT change, on the ground it touched - checked and
   * never written.
   *
   * The cells above are only what MOVED, and a guard built out of them alone
   * would miss the case that matters most: a road is laid, a waypoint is put
   * on it, and the undo pulls the road out from under the marker. Every tile a
   * patch names therefore carries its whole context - the nine tile layers and
   * the four corner heights around it - so an undo proceeds only when the
   * ground it is about to rewrite looks exactly as the recording left it.
   * A guard cell has one value rather than two, because a cell the command did
   * not change reads the same before it and after it.
   */
  readonly guardLayers: readonly number[];
  readonly guardIndices: readonly number[];
  readonly guardValues: readonly number[];
  /** The company figures the command moved, after minus before. [cent etc.] */
  readonly money: readonly number[];
  /** True when land and water changed places, so the derived layers move too. */
  readonly shoreline: boolean;
}

export type Command =
  | ApplyPatchCommand
  | TerraformBrushRegionCommand
  | PlaceTownSeedCommand
  | PlaceIndustryAtCommand
  | PaintForestCommand
  | PaintRiverCommand
  | AcceptContractCommand
  | AcceptSupplyContractCommand
  | BuildWaypointCommand
  | DemolishWaypointCommand
  | CreateLineCommand
  | DeleteLineCommand
  | SetLineOrdersCommand
  | AssignVehicleToLineCommand
  | ReleaseVehicleFromLineCommand
  | SetLineTaktCommand
  | SetTransferNodeCommand
  | BuyExclusiveRightsCommand
  | ApplyTownMeasureCommand
  | DemolishBuildingCommand
  | BuildAirportCommand
  | BuyAircraftCommand
  | BuildWaterStopCommand
  | BuyShipCommand
  | SetAutoRenewCommand
  | RefitVehicleCommand
  | BuildStationModuleCommand
  | BuildSignalCommand
  | DemolishSignalCommand
  | BuildTrackCommand
  | DemolishTrackCommand
  | BuildRailStopCommand
  | BuyTrainCommand
  | SetCompanyNameCommand
  | SetCompanyColorCommand
  | TakeLoanCommand
  | RepayLoanCommand
  | RaiseLandCommand
  | LowerLandCommand
  | LevelLandCommand
  | BuildRoadCommand
  | DemolishRoadCommand
  | BuildRoadStopCommand
  | BuyRoadVehicleCommand
  | SellVehicleCommand
  | SetVehicleOrdersCommand
  | SetVehicleRunningCommand
  | SendVehicleToDepotCommand;

/** A command bound to the exact tick at which it is executed. */
export interface CommandEnvelope {
  /** Tick at whose start the command runs. */
  readonly tick: number;
  /** Monotonic counter that makes the order inside one tick unambiguous. */
  readonly seq: number;
  /**
   * Which company issued it. Zero is the player.
   *
   * On the envelope rather than inside the command, because it is not something
   * the issuer gets to choose - a command carrying its own company could claim
   * to be anyone. It also leaves every command type unchanged now that the AI
   * of section 15 uses exactly the ones the player does.
   */
  readonly companyId: number;
  readonly command: Command;
  /**
   * RESERVED for the multiplayer groundwork of SPEC2 E-16, and written by
   * nothing in this build.
   *
   * The checksum covers the envelope HEADER only - tick, seq, company and the
   * command's kind - and `multiplayer/envelope.ts` is the one place that
   * computes it; `EnvelopeIntegrity` in `src/shared/netProtocol.ts` says why
   * the payload is deliberately outside it.
   *
   * WHY OPTIONAL AND WHY HERE. The envelope IS the wire unit: it is what a
   * peer would send, what a log stores and what a replay judges, so a wire
   * integrity field belongs on it and nowhere else. Optional, because a field
   * that were written today would enter every `.ironsave`'s command log and
   * move nothing about the world - the log is history and `hashWorld` does not
   * cover it - but it would still change the bytes of every corpus fixture and
   * the soak recording for a value that means nothing yet. So the local build
   * leaves both absent (a property `tests/unit/multiplayer.spec.ts` asserts by
   * walking the source), the parser preserves them when a file carries them,
   * and `PROTOCOL_VERSION` records that a receiver may now expect them.
   *
   * `SAVE_VERSION` does not move for this: nothing about the WORLD changed, no
   * migration has anything to do, and a save written by this build is
   * byte-identical to one written before the fields existed.
   */
  readonly checksum?: number;
  /** RESERVED, as {@link CommandEnvelope.checksum} - the session it came from. */
  readonly sessionId?: number;
}

/**
 * Result of executing a command. A rejection always names a concrete reason
 * (section 17.3) - never a generic "not possible here".
 */
export type CommandOutcome =
  { readonly ok: true } | { readonly ok: false; readonly reasonKey: string };

export const ACCEPTED: CommandOutcome = { ok: true };

/** Translation keys for every rejection the simulation can produce. */
export const RejectReason = {
  NameEmpty: 'cmd.reject.nameEmpty',
  NameTooLong: 'cmd.reject.nameTooLong',
  InvalidColor: 'cmd.reject.invalidColor',
  CreditLimitReached: 'cmd.reject.creditLimitReached',
  NothingToRepay: 'cmd.reject.nothingToRepay',
  InsufficientFunds: 'cmd.reject.insufficientFunds',
  OutsideMap: 'cmd.reject.outsideMap',
  OnWater: 'cmd.reject.onWater',
  Occupied: 'cmd.reject.occupied',
  /** A runway needs flat ground - the one build that refuses a slope outright. */
  TooSteep: 'cmd.reject.tooSteep',
  /**
   * A slope a ROAD cannot climb.
   *
   * Its own reason since M26, and the reason it needed one is what the player
   * was being told: the road builder returned `TooSteep`, whose sentence is
   * about a runway. Laying a road over a hill is the commonest beginner
   * mistake in the game, and the answer to it named an aircraft the player had
   * never touched.
   */
  RoadTooSteep: 'cmd.reject.roadTooSteep',
  NothingToDo: 'cmd.reject.nothingToDo',
  NeedsRoad: 'cmd.reject.needsRoad',
  /**
   * A bay found road beside it, but every candidate belongs to another
   * company (D-210). Named separately from `NotYours`, which is about the
   * tile the player clicked and would send him looking at the wrong tile.
   */
  RoadNotYours: 'cmd.reject.roadNotYours',
  NeedsTrack: 'cmd.reject.needsTrack',
  NeedsStation: 'cmd.reject.needsStation',
  NeedsWater: 'cmd.reject.needsWater',
  NeedsShore: 'cmd.reject.needsShore',
  GroundNotClear: 'cmd.reject.groundNotClear',
  NotPlainTrack: 'cmd.reject.notPlainTrack',
  SignalOnStructure: 'cmd.reject.signalOnStructure',
  SignalExists: 'cmd.reject.signalExists',
  NoSignalHere: 'cmd.reject.noSignalHere',
  UnknownSignal: 'cmd.reject.unknownSignal',
  SignalNeedsDirection: 'cmd.reject.signalNeedsDirection',
  NeedsDepot: 'cmd.reject.needsDepot',
  NeedsRailDepot: 'cmd.reject.needsRailDepot',
  UnknownModule: 'cmd.reject.unknownModule',
  WrongVehicleKind: 'cmd.reject.wrongVehicleKind',
  NotAvailableYet: 'cmd.reject.notAvailableYet',
  TooManyVehicles: 'cmd.reject.tooManyVehicles',
  NoSuchVehicle: 'cmd.reject.noSuchVehicle',
  NoOrders: 'cmd.reject.noOrders',
  NoSuchStation: 'cmd.reject.noSuchStation',
  NoRouteToStop: 'cmd.reject.noRouteToStop',
  NotInDepot: 'cmd.reject.notInDepot',
  NotEmpty: 'cmd.reject.notEmpty',
  CannotCarry: 'cmd.reject.cannotCarry',
  NotYours: 'cmd.reject.notYours',
  NoSuchTown: 'cmd.reject.noSuchTown',
  NoSuchContract: 'cmd.reject.noSuchContract',
  ContractClosed: 'cmd.reject.contractClosed',
  NoSuchSupplyContract: 'cmd.reject.noSuchSupplyContract',
  SupplyContractClosed: 'cmd.reject.supplyContractClosed',
  AlreadyAccepted: 'cmd.reject.alreadyAccepted',
  UnknownMeasure: 'cmd.reject.unknownMeasure',
  MeasureNotReady: 'cmd.reject.measureNotReady',
  RatingTooLow: 'cmd.reject.ratingTooLow',
  RightsTaken: 'cmd.reject.rightsTaken',
  CouncilRefuses: 'cmd.reject.councilRefuses',
  ExclusiveRights: 'cmd.reject.exclusiveRights',
  NoBuilding: 'cmd.reject.noBuilding',
  WaypointExists: 'cmd.reject.waypointExists',
  WaypointInWay: 'cmd.reject.waypointInWay',
  NeedsWaypointGround: 'cmd.reject.needsWaypointGround',
  NoWaypointHere: 'cmd.reject.noWaypointHere',
  NoSuchWaypoint: 'cmd.reject.noSuchWaypoint',
  InvalidOrder: 'cmd.reject.invalidOrder',
  TooManyOrders: 'cmd.reject.tooManyOrders',
  BadJumpTarget: 'cmd.reject.badJumpTarget',
  NoSuchLine: 'cmd.reject.noSuchLine',
  TooManyLines: 'cmd.reject.tooManyLines',
  InvalidTakt: 'cmd.reject.invalidTakt',
  /** The workshop's per-command region cap (SPEC2 M22). */
  BrushTooLarge: 'cmd.reject.brushTooLarge',
  /** A brush or a placement whose numbers are not a region at all. */
  InvalidRegion: 'cmd.reject.invalidRegion',
  /** Nothing in the painted region was ground the tool may write on. */
  NothingToPaint: 'cmd.reject.nothingToPaint',
  /** A town centre where the generator's own rules refuse one. */
  BadTownSite: 'cmd.reject.badTownSite',
  /** A town centre too close to one that already exists. */
  TownTooClose: 'cmd.reject.townTooClose',
  /** The map already carries as many towns as the generator would make. */
  TooManyTowns: 'cmd.reject.tooManyTowns',
  /** Ground the placement rules of section 6.6 refuse for this works. */
  BadIndustrySite: 'cmd.reject.badIndustrySite',
  /** A works too close to one that already stands. */
  IndustryTooClose: 'cmd.reject.industryTooClose',
  /** A type or size class the game does not have. */
  UnknownType: 'cmd.reject.unknownType',
  /**
   * A river the ground cannot carry: the region does not reach sea level
   * inside one command's earth budget (SPEC2 M22 - standing water at height X
   * is refused, never invented).
   */
  RiverNeedsSeaLevel: 'cmd.reject.riverNeedsSeaLevel',
  /** An inverse patch whose payload is not an edit of this map (SPEC2 M25). */
  InvalidPatch: 'cmd.reject.invalidPatch',
  /**
   * The world moved underneath an undo: at least one cell no longer holds what
   * the recording left there. Refused WHOLE (Fehlerkatalog 30, E-12).
   */
  PatchStale: 'cmd.reject.patchStale',
  /**
   * The money cannot go back where it came from - the month it was booked in
   * has closed and its ledger row with it, so reversing it would leave a world
   * that is not the world where the command never ran (D-092).
   */
  PatchMonthClosed: 'cmd.reject.patchMonthClosed',
  /** Ctrl+Z with an empty ring, and Ctrl+Y with nothing to put back. */
  NothingToUndo: 'cmd.reject.nothingToUndo',
  NothingToRedo: 'cmd.reject.nothingToRedo',
  /**
   * An undo asked for while a command of the same frame is still waiting.
   *
   * The ring is last-in-first-out and its top is decided at ISSUE time, so
   * taking one entry off while an unexecuted build is still queued would take
   * back the edit UNDER the one the player is looking at. Refused rather than
   * guessed; the window is one frame wide.
   */
  UndoBusy: 'cmd.reject.undoBusy',
} as const;
export type RejectReason = (typeof RejectReason)[keyof typeof RejectReason];
