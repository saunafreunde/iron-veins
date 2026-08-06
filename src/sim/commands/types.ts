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
 */
export interface SetAutoRenewCommand {
  readonly kind: typeof CommandKind.SetAutoRenew;
  readonly enabled: boolean;
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

export type Command =
  | AcceptContractCommand
  | BuildWaypointCommand
  | DemolishWaypointCommand
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
  | SetVehicleRunningCommand;

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
  TooSteep: 'cmd.reject.tooSteep',
  NothingToDo: 'cmd.reject.nothingToDo',
  NeedsRoad: 'cmd.reject.needsRoad',
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
} as const;
export type RejectReason = (typeof RejectReason)[keyof typeof RejectReason];
