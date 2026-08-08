import type { Command, CommandEnvelope } from './types';

/**
 * Ordered command buffer and replay log in one.
 *
 * Entries are appended and `head` only advances, so the backing array is
 * simultaneously the command log that a save game or a replay stores. Ticks
 * must be enqueued monotonically, which holds by construction: the worker always
 * stamps an incoming command with the next tick it is going to execute.
 *
 * The one operation that REMOVES entries is {@link trimBefore}, the log
 * compaction of SPEC2 M16: a log that reaches back to a checkpoint is a log
 * whose earlier half is replayable from that checkpoint instead. `baseTick`
 * records where the retained log starts, because "complete since the start of
 * the game" and "complete since year seven" are different claims and a file
 * that cannot tell them apart cannot be replayed honestly.
 */
export class CommandQueue {
  private readonly entries: CommandEnvelope[] = [];
  private head = 0;
  private nextSeq = 0;
  private base = 0;

  /** Schedule `command` for the start of `tick`. */
  enqueue(command: Command, tick: number, companyId = 0): CommandEnvelope {
    const last = this.entries[this.entries.length - 1];
    if (last !== undefined && tick < last.tick) {
      throw new Error(
        `CommandQueue: tick ${tick} is older than the last queued tick ${last.tick}; ` +
          'the deterministic order would be lost.',
      );
    }
    const envelope: CommandEnvelope = { tick, seq: this.nextSeq++, companyId, command };
    this.entries.push(envelope);
    return envelope;
  }

  /**
   * Next envelope due at or before `tick`, or null. Advancing an index instead
   * of shifting the array keeps this allocation free and O(1).
   */
  shiftDue(tick: number): CommandEnvelope | null {
    const next = this.entries[this.head];
    if (next === undefined || next.tick > tick) return null;
    this.head++;
    return next;
  }

  /** Number of commands still waiting to be executed. */
  get pendingCount(): number {
    return this.entries.length - this.head;
  }

  /** Number of commands executed so far - the cursor into the RETAINED log. */
  get executedCount(): number {
    return this.head;
  }

  /** Full, ordered command log; complete from {@link baseTick} on. */
  get log(): readonly CommandEnvelope[] {
    return this.entries;
  }

  /**
   * The tick from which this log is complete. Zero means "since the start of
   * the game", which is every log that was never compacted.
   */
  get baseTick(): number {
    return this.base;
  }

  /** Replace the queue contents, e.g. when loading a save or a replay. */
  loadLog(log: readonly CommandEnvelope[], executedCount: number, baseTick = 0): void {
    this.entries.length = 0;
    for (let i = 0; i < log.length; i++) {
      this.entries.push(log[i]!);
    }
    this.head = executedCount;
    this.base = baseTick;
    const last = this.entries[this.entries.length - 1];
    this.nextSeq = last === undefined ? 0 : last.seq + 1;
  }

  /**
   * Move the execution cursor to the first command of `tick`.
   *
   * This is what pairs a queue with a restored checkpoint: a checkpoint taken
   * at tick T holds the world BEFORE T's commands ran (`step` drains the tick
   * it is entering), so replaying from it must start at the first envelope
   * stamped T, not after it.
   */
  seekToTick(tick: number): void {
    let index = 0;
    while (index < this.entries.length && this.entries[index]!.tick < tick) index++;
    this.head = index;
  }

  /**
   * Drop every command older than `tick` and record `tick` as the new base.
   *
   * The log compaction of SPEC2 M16, and the only operation that ever shortens
   * the log. `nextSeq` is deliberately NOT reset: sequence numbers identify
   * commands inside one recording, and re-issuing a number a trimmed entry
   * already used would make two envelopes of the same game indistinguishable.
   *
   * Returns how many entries were dropped.
   */
  trimBefore(tick: number): number {
    let dropped = 0;
    while (dropped < this.entries.length && this.entries[dropped]!.tick < tick) dropped++;
    if (dropped > 0) this.entries.splice(0, dropped);
    this.head = Math.max(0, this.head - dropped);
    this.base = tick;
    return dropped;
  }
}
