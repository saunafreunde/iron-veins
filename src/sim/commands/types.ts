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

/** One entry of a vehicle's cyclic order list. */
export interface OrderSpec {
  /** A value of OrderTarget. */
  readonly target: number;
  readonly targetId: number;
  /** A value of OrderLoad. */
  readonly load: number;
  /** A value of OrderUnload. */
  readonly unload: number;
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

export type Command =
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
  NeedsDepot: 'cmd.reject.needsDepot',
  WrongVehicleKind: 'cmd.reject.wrongVehicleKind',
  NotAvailableYet: 'cmd.reject.notAvailableYet',
  TooManyVehicles: 'cmd.reject.tooManyVehicles',
  NoSuchVehicle: 'cmd.reject.noSuchVehicle',
  NoOrders: 'cmd.reject.noOrders',
  NoSuchStation: 'cmd.reject.noSuchStation',
} as const;
export type RejectReason = (typeof RejectReason)[keyof typeof RejectReason];
