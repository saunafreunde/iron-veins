/**
 * The pure half of crash safety (SPEC2 M10, D-132): a rolling tail of the
 * command log and the assembly of a bug-report bundle from parts the MAIN
 * thread already holds.
 *
 * Nothing in here touches a worker, the DOM beyond TextEncoder, or a disk.
 * That is the point: when the simulation worker dies it cannot be trusted to
 * encode anything (D-111), so everything a crash report needs must already be
 * on this side of the boundary, in plain data a unit test can hold in its
 * hands.
 */

/**
 * Byte budget of the rolling command-log tail. [byte]
 * SPEC2 M10: "rollierender Command-Log-Schwanz (~1 MB)". Enough for tens of
 * thousands of commands - hours of play - without ever growing unbounded.
 */
export const COMMAND_LOG_BYTE_BUDGET = 1_048_576;

/** Version of the bundle's own JSON shape, so tooling can tell them apart. */
export const CRASH_BUNDLE_SCHEMA_VERSION = 1;

/** UTF-8 size of a string, without allocating the encoded bytes. */
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.codePointAt(index);
    if (code === undefined) break;
    // An astral code point occupies two UTF-16 units; skip the low surrogate.
    if (code > 0xffff) index++;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Longest prefix of `text` that fits into `budget` UTF-8 bytes. */
function truncateToBytes(text: string, budget: number): string {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.codePointAt(index);
    if (code === undefined) return text.slice(0, index);
    const width = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes + width > budget) return text.slice(0, index);
    bytes += width;
    if (code > 0xffff) index++;
  }
  return text;
}

/**
 * A ring buffer of log lines with a byte budget instead of an entry count.
 *
 * Commands vary hugely in size - a colour change is forty bytes, a planned
 * railway is kilobytes of tile lists - so counting entries would make the
 * window's reach depend on what the player was doing. Counting bytes keeps
 * the memory bound honest, which is the property the main thread actually
 * needs from something it retains for a whole session.
 *
 * Eviction is oldest-first: a crash report wants the commands LEADING UP to
 * the crash, and the oldest lines are the ones that stopped mattering.
 */
export class CommandLogTail {
  private entries: string[] = [];
  /** Index of the oldest live entry; everything before it is evicted. */
  private head = 0;
  private totalBytes = 0;

  constructor(private readonly byteBudget: number) {}

  /** Bytes currently held, always at or below the budget. */
  get byteSize(): number {
    return this.totalBytes;
  }

  push(line: string): void {
    // A single line larger than the whole budget cannot be kept whole; a
    // truncated head of a command is still worth more in a bug report than a
    // silent gap where the biggest command should be.
    const kept =
      utf8ByteLength(line) > this.byteBudget ? truncateToBytes(line, this.byteBudget) : line;

    this.entries.push(kept);
    this.totalBytes += utf8ByteLength(kept);

    while (this.totalBytes > this.byteBudget && this.head < this.entries.length - 1) {
      const evicted = this.entries[this.head];
      if (evicted === undefined) break;
      this.totalBytes -= utf8ByteLength(evicted);
      this.head++;
    }

    // Compact once the dead prefix dominates, so the array does not grow for
    // the whole session while pretending to be a ring.
    if (this.head > 64 && this.head * 2 > this.entries.length) {
      this.entries = this.entries.slice(this.head);
      this.head = 0;
    }
  }

  /** The live lines, oldest first. */
  lines(): readonly string[] {
    return this.head === 0 ? this.entries : this.entries.slice(this.head);
  }

  clear(): void {
    this.entries = [];
    this.head = 0;
    this.totalBytes = 0;
  }
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Plain RFC 4648 base64, written out rather than borrowed from the host.
 * `btoa` chokes on large arrays via String.fromCharCode spreading, and Buffer
 * exists only under node; twenty lines beat two platform special cases.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const word = (bytes[index]! << 16) | (bytes[index + 1]! << 8) | bytes[index + 2]!;
    out +=
      BASE64_ALPHABET[(word >> 18) & 63]! +
      BASE64_ALPHABET[(word >> 12) & 63]! +
      BASE64_ALPHABET[(word >> 6) & 63]! +
      BASE64_ALPHABET[word & 63]!;
  }
  const rest = bytes.length - index;
  if (rest === 1) {
    const word = bytes[index]! << 16;
    out += BASE64_ALPHABET[(word >> 18) & 63]! + BASE64_ALPHABET[(word >> 12) & 63]! + '==';
  } else if (rest === 2) {
    const word = (bytes[index]! << 16) | (bytes[index + 1]! << 8);
    out +=
      BASE64_ALPHABET[(word >> 18) & 63]! +
      BASE64_ALPHABET[(word >> 12) & 63]! +
      BASE64_ALPHABET[(word >> 6) & 63]! +
      '=';
  }
  return out;
}

/** What the worker managed to say before it died, or null for a healthy game. */
export interface CrashErrorInput {
  readonly message: string;
  readonly stack: string;
  /** Simulation tick at the moment of death, or -1 when no world existed. */
  readonly tick: number;
}

/** World facts the main thread knows without asking the (possibly dead) worker. */
export interface CrashContextInput {
  readonly seed: number;
  readonly mapSize: number;
  /** Tick of the last published snapshot. */
  readonly tick: number;
  readonly stateHash: string;
  readonly isDesktop: boolean;
}

export interface CrashBundleInput {
  readonly appVersion: string;
  readonly saveVersion: number;
  /** Wall-clock time of assembly as ISO text; the CALLER reads the clock. */
  readonly writtenAt: string;
  readonly error: CrashErrorInput | null;
  readonly context: CrashContextInput;
  /** The rolling command-log tail, oldest first, as pushed. */
  readonly commandLog: readonly string[];
  /** The last autosave as the shelf holds it, or null when none exists yet. */
  readonly autosave: { readonly name: string; readonly bytes: Uint8Array } | null;
}

/**
 * Assemble the bug-report bundle: one JSON document carrying the version
 * triple (app version / save format / bundle schema), the error text, the
 * command-log tail and a copy of the last autosave.
 *
 * JSON with the save in base64 rather than a binary container, because the
 * consumer of this file is a developer with a text editor, not the game.
 */
export function assembleCrashBundle(input: CrashBundleInput): Uint8Array {
  const document = {
    kind: 'iron-veins-bug-report',
    schemaVersion: CRASH_BUNDLE_SCHEMA_VERSION,
    appVersion: input.appVersion,
    saveVersion: input.saveVersion,
    writtenAt: input.writtenAt,
    error: input.error,
    context: input.context,
    commandLog: input.commandLog,
    autosave:
      input.autosave === null
        ? null
        : { name: input.autosave.name, base64: bytesToBase64(input.autosave.bytes) },
  };
  return new TextEncoder().encode(JSON.stringify(document, null, 2));
}

/**
 * File name for a bundle, derived from the assembly timestamp. Colons and
 * dots are not welcome in Windows file names, so the stamp is flattened.
 */
export function bugReportFileName(writtenAt: string): string {
  return `bug-report-${writtenAt.replace(/[:.]/g, '-')}.json`;
}
