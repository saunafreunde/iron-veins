import type { Command, CommandEnvelope } from './types';

/**
 * Ordered command buffer and replay log in one.
 *
 * Entries are never removed - `head` only advances - so the backing array is
 * simultaneously the command log that a save game or a replay stores. Ticks
 * must be enqueued monotonically, which holds by construction: the worker always
 * stamps an incoming command with the next tick it is going to execute.
 */
export class CommandQueue {
  private readonly entries: CommandEnvelope[] = [];
  private head = 0;
  private nextSeq = 0;

  /** Schedule `command` for the start of `tick`. */
  enqueue(command: Command, tick: number): CommandEnvelope {
    const last = this.entries[this.entries.length - 1];
    if (last !== undefined && tick < last.tick) {
      throw new Error(
        `CommandQueue: tick ${tick} is older than the last queued tick ${last.tick}; ` +
          'the deterministic order would be lost.',
      );
    }
    const envelope: CommandEnvelope = { tick, seq: this.nextSeq++, command };
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

  /** Number of commands executed so far. */
  get executedCount(): number {
    return this.head;
  }

  /** Full, ordered command log since the start of the game. */
  get log(): readonly CommandEnvelope[] {
    return this.entries;
  }

  /** Replace the queue contents, e.g. when loading a replay. */
  loadLog(log: readonly CommandEnvelope[], executedCount: number): void {
    this.entries.length = 0;
    for (let i = 0; i < log.length; i++) {
      this.entries.push(log[i]!);
    }
    this.head = executedCount;
    const last = this.entries[this.entries.length - 1];
    this.nextSeq = last === undefined ? 0 : last.seq + 1;
  }
}
