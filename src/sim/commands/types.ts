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

export type Command =
  | SetCompanyNameCommand
  | SetCompanyColorCommand
  | TakeLoanCommand
  | RepayLoanCommand
  | RaiseLandCommand
  | LowerLandCommand
  | LevelLandCommand;

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
} as const;
export type RejectReason = (typeof RejectReason)[keyof typeof RejectReason];
