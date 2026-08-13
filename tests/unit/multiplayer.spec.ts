import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/sim/commands/queue';
import { CommandKind, type Command, type CommandEnvelope } from '../../src/sim/commands/types';
import {
  Difficulty,
  MapClimate,
  NET_INPUT_DELAY_TICKS,
  NET_TICK_DIGEST_RING_CAPACITY,
} from '../../src/sim/constants';
import { arrivesInTime, executionTickFor } from '../../src/sim/multiplayer/inputDelay';
import { envelopeChecksum, envelopeChecksumMatches } from '../../src/sim/multiplayer/envelope';
import {
  TickDigestRing,
  firstDisagreement,
  hashWorldTick,
} from '../../src/sim/multiplayer/tickDigest';
import { decodeSave, encodeSave } from '../../src/sim/save/serialize';
import { hashWorld, hashWorldLive, World } from '../../src/sim/World';
import { PROTOCOL_VERSION } from '../../src/shared/netProtocol';

/**
 * The multiplayer groundwork of SPEC2 E-16 - and the four properties that make
 * it groundwork rather than the beginning of a netcode nobody asked for.
 *
 * E-16 is explicit: "Kein Transport, keine Sessions, kein Netcode". So the
 * first thing asserted here is the ABSENCE - that nothing in the repository
 * opens a socket, and that the two reserved envelope fields are written by
 * nothing, which is what keeps every pin, every corpus fixture and the soak
 * recording byte-identical across this bundle.
 *
 * The rest is the three artefacts themselves: a per-tick digest that is the
 * determinism suite's own walk one branch shorter, an envelope checksum with
 * one definition, and an input-delay rule that refuses a late command instead
 * of running it out of order.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SIZE = 128;
const SEED = 20_260_813;

/** Any version string; the container demands one and this test is not about it. */
const GAME_VERSION = '0.0.0-test';

function createWorld(): World {
  return World.create({
    seed: SEED,
    difficulty: Difficulty.Normal,
    climate: MapClimate.Temperate,
    mapSize: SIZE,
    companyName: 'Fernverbindung AG',
    companyColorIndex: 2,
  });
}

function repoPath(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, '/');
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) stack.push(path);
      else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(path);
    }
  }
  return out;
}

// --------------------------------------------- what E-16 forbids, asserted

describe('E-16 ships groundwork and nothing else', () => {
  it('opens no transport anywhere in the application', () => {
    // The whole clause in one assertion. `fetch` is deliberately in the list
    // although the game is offline for other reasons too: E-13's service
    // worker re-issues a fetch the browser was already making, and it is a
    // plain `.js` file in public/, so nothing under src/ may name one.
    const banned = /\b(WebSocket|RTCPeerConnection|EventSource|XMLHttpRequest)\b|\bfetch\s*\(/;
    const offenders: string[] = [];
    for (const file of sourceFiles(join(REPO_ROOT, 'src'))) {
      if (banned.test(readFileSync(file, 'utf8'))) offenders.push(repoPath(file));
    }
    expect(offenders).toEqual([]);
  });

  it('writes neither reserved envelope field, so no save byte moves', () => {
    // The reservation is only free while it stays a reservation: an envelope
    // that carried a checksum would enter every command log, every corpus
    // fixture and the soak recording. Held over the SOURCE rather than over
    // one code path, because a field can be written from anywhere that builds
    // an envelope - so every file that KNOWS about `CommandEnvelope` is asked,
    // and the three that legitimately name the fields are listed with why.
    const writes = /\b(checksum|sessionId)\s*:/;
    const allowed = new Set([
      // The parser that carries them through when a foreign log has them.
      'src/sim/save/format.ts',
      // The record that describes the pair for a future transport.
      'src/shared/netProtocol.ts',
    ]);
    // `CommandEnvelope`'s own declaration is deliberately NOT on that list and
    // does not need to be: it writes `checksum?:`, the optional-property form,
    // which is not an assignment and which the pattern therefore never matches.
    expect(writes.test(readFileSync(join(REPO_ROOT, 'src/sim/commands/types.ts'), 'utf8'))).toBe(
      false,
    );
    const offenders: string[] = [];
    for (const file of sourceFiles(join(REPO_ROOT, 'src'))) {
      const path = repoPath(file);
      if (allowed.has(path)) continue;
      const text = readFileSync(file, 'utf8');
      if (!text.includes('CommandEnvelope')) continue;
      if (writes.test(text)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
    // The allowlist is not allowed to go stale either: each entry must really
    // name a field, or it is excusing nothing (repoAssets.spec's device).
    for (const path of allowed) {
      expect(writes.test(readFileSync(join(REPO_ROOT, path), 'utf8')), path).toBe(true);
    }
  });

  it('leaves an ordinary save byte-identical to one written without the fields', () => {
    // The claim above, measured rather than argued: a real world, a real
    // command, encoded - and the log that comes back out carries neither key
    // at all, which is what makes the bytes the bytes they always were.
    const world = createWorld();
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'Fernverbindung AG' }, 0, 0);
    world.drainCommands(queue, null);

    const bytes = encodeSave(world, queue, GAME_VERSION);
    const decoded = decodeSave(bytes);
    expect(decoded.queue.log.length).toBe(1);
    const entry = decoded.queue.log[0]!;
    expect(Object.prototype.hasOwnProperty.call(entry, 'checksum')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(entry, 'sessionId')).toBe(false);
  });

  it('carries the reserved fields THROUGH the whole round trip when a log has them', () => {
    // Forward compatibility is the other half of a reservation: a log that
    // arrives with the fields set - from a peer, from a later build - has to
    // come out the way it went in, or a recording stops being evidence about
    // the envelopes it really contained. Driven through the real encoder and
    // the real parser rather than through a hand-written payload, because a
    // second description of the format is the D-133 defect.
    const world = createWorld();
    const queue = new CommandQueue();
    queue.loadLog(
      [
        {
          tick: 0,
          seq: 0,
          companyId: 0,
          command: { kind: CommandKind.SetCompanyName, name: 'Fernverbindung AG' },
          checksum: 123_456,
          sessionId: 7,
        },
      ],
      1,
    );
    const decoded = decodeSave(encodeSave(world, queue, GAME_VERSION));
    expect(decoded.queue.log[0]!.checksum).toBe(123_456);
    expect(decoded.queue.log[0]!.sessionId).toBe(7);
  });
});

// ------------------------------------------------------ the per-tick digest

describe('the per-tick desync digest', () => {
  it('is the live digest one branch shorter, and both are real fingerprints', () => {
    const world = createWorld();
    const before = hashWorldTick(world);
    expect(hashWorldTick(world)).toBe(before);
    // A digest that never changed would be a detector that never fires.
    world.step(new CommandQueue(), null);
    expect(hashWorldTick(world)).not.toBe(before);
    // And it is not the same walk as either of the other two, or there would
    // be no reason for it to exist.
    expect(hashWorldTick(world)).not.toBe(hashWorld(world));
  });

  it('sees a divergence the full digest sees', () => {
    // The property that makes it usable: anything that moves the authority's
    // fingerprint inside a tick moves this one. A cash change is the cheapest
    // such thing that is NOT in a ledger array - the arrays are exactly what
    // the cheap walk drops, and the money itself is not one of them.
    const world = createWorld();
    const before = hashWorldTick(world);
    world.playerCompany.cashCt += 1;
    expect(hashWorldTick(world)).not.toBe(before);
    expect(hashWorldLive(world)).not.toBe(hashWorldLive(createWorld()));
  });

  it('is blind to exactly the ledger arrays it says it drops', () => {
    // The other side of the same claim, and the one that could rot silently:
    // a monthly-cadence array moves the authority and not the cheap digest.
    // If this ever fails, the walk stopped skipping what its comment says.
    const world = createWorld();
    const cheap = hashWorldTick(world);
    const full = hashWorldLive(world);
    world.playerCompany.monthHistory[0] = (world.playerCompany.monthHistory[0] ?? 0) + 1000;
    expect(hashWorldTick(world)).toBe(cheap);
    expect(hashWorldLive(world)).not.toBe(full);
  });

  it('remembers its window and forgets what falls out of it', () => {
    const world = createWorld();
    const ring = new TickDigestRing();
    expect(ring.length).toBe(0);
    for (let i = 0; i < 5; i++) {
      world.step(new CommandQueue(), null);
      ring.record(world);
    }
    const entries = ring.entries();
    expect(entries.length).toBe(5);
    expect(entries.map((entry) => entry.tick)).toEqual([1, 2, 3, 4, 5]);
    expect(entries[4]!.digest).toBe(hashWorldTick(world));

    // Past capacity the oldest goes, the newest stays, and the sequence stays
    // contiguous - a ring with a hole in it would name the wrong tick.
    const wrapped = new TickDigestRing();
    for (let i = 0; i < NET_TICK_DIGEST_RING_CAPACITY + 3; i++) {
      world.step(new CommandQueue(), null);
      wrapped.record(world);
    }
    const held = wrapped.entries();
    expect(held.length).toBe(NET_TICK_DIGEST_RING_CAPACITY);
    for (let i = 1; i < held.length; i++) {
      expect(held[i]!.tick).toBe(held[i - 1]!.tick + 1);
    }
    expect(held[held.length - 1]!.tick).toBe(world.tick);

    wrapped.clear();
    expect(wrapped.entries()).toEqual([]);
  });

  it('names the TICK two histories parted on, and nothing when they agree', () => {
    const mine = [
      { tick: 10, digest: 'aaaa' },
      { tick: 11, digest: 'bbbb' },
      { tick: 12, digest: 'cccc' },
    ];
    expect(firstDisagreement(mine, mine)).toBe(-1);
    expect(
      firstDisagreement(mine, [
        { tick: 10, digest: 'aaaa' },
        { tick: 11, digest: 'ffff' },
        { tick: 12, digest: 'dddd' },
      ]),
    ).toBe(11);
    // Ticks only one side holds are not evidence: a peer that started
    // recording later simply has less history.
    expect(firstDisagreement(mine, [{ tick: 12, digest: 'cccc' }])).toBe(-1);
    expect(firstDisagreement(mine, [])).toBe(-1);
  });

  it('is read by nothing under src/sim outside its own file', () => {
    // The D-186 posture for `TileMap.throughput`: the counters may draw the
    // picture but never write the log. A digest that steered a simulation
    // decision would be an unsaved input to a saved one - Z4 in silence.
    const offenders: string[] = [];
    for (const file of sourceFiles(join(REPO_ROOT, 'src', 'sim'))) {
      const path = repoPath(file);
      if (path === 'src/sim/multiplayer/tickDigest.ts') continue;
      const text = readFileSync(file, 'utf8');
      if (/hashWorldTick|TickDigestRing|firstDisagreement/.test(text)) {
        // The scheduler is allowed to WRITE it - that is where the flag lives -
        // and it is the one file under src/sim that may read a wall clock.
        if (path === 'src/sim/SimWorker.ts') continue;
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ------------------------------------------------------ the envelope checksum

describe('the envelope checksum', () => {
  const base: CommandEnvelope = {
    tick: 41,
    seq: 7,
    companyId: 2,
    command: { kind: CommandKind.SetCompanyName, name: 'x' } as Command,
  };

  it('is a pure function of the header and changes with every field of it', () => {
    const value = envelopeChecksum(base);
    expect(envelopeChecksum(base)).toBe(value);
    expect(envelopeChecksum({ ...base, tick: 42 })).not.toBe(value);
    expect(envelopeChecksum({ ...base, seq: 8 })).not.toBe(value);
    expect(envelopeChecksum({ ...base, companyId: 3 })).not.toBe(value);
    expect(
      envelopeChecksum({
        ...base,
        command: { kind: CommandKind.TakeLoan, amountCt: 1000 } as Command,
      }),
    ).not.toBe(value);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });

  it('deliberately does not cover the payload, and the reason is written down', () => {
    // D-191's split, one instrument down: a moved or duplicated envelope is
    // what a header commitment catches, a bent payload is what a STATE digest
    // catches. Asserted so the day somebody widens it, they read the entry.
    const renamed: CommandEnvelope = {
      ...base,
      command: { kind: CommandKind.SetCompanyName, name: 'a different name' } as Command,
    };
    expect(envelopeChecksum(renamed)).toBe(envelopeChecksum(base));
  });

  it('accepts an envelope that claims nothing and rejects one that claims wrongly', () => {
    expect(envelopeChecksumMatches(base)).toBe(true);
    expect(envelopeChecksumMatches({ ...base, checksum: envelopeChecksum(base) })).toBe(true);
    expect(envelopeChecksumMatches({ ...base, checksum: envelopeChecksum(base) + 1 })).toBe(false);
  });
});

// ----------------------------------------------------------- the input delay

describe('the input-delay rule', () => {
  it('schedules a command a fixed number of ticks ahead', () => {
    expect(executionTickFor(100)).toBe(100 + NET_INPUT_DELAY_TICKS);
    expect(executionTickFor(100, 12)).toBe(112);
    // 200 ms at 20 Hz - the number the design note is written around.
    expect(NET_INPUT_DELAY_TICKS * 50).toBe(200);
  });

  it('refuses a command whose tick the simulation has already passed', () => {
    expect(arrivesInTime(executionTickFor(100), 100)).toBe(true);
    expect(arrivesInTime(104, 104)).toBe(true);
    expect(arrivesInTime(104, 105)).toBe(false);
  });

  it('agrees with the queue, which throws rather than reordering', () => {
    // The refusal is not a nicety: executing a late command anyway would put
    // it AFTER commands issued after it, which is a different command order
    // and therefore a different world. The queue already makes that a crash;
    // the rule above is what stops a session reaching it.
    const queue = new CommandQueue();
    queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'a' }, 20, 0);
    expect(() => queue.enqueue({ kind: CommandKind.SetCompanyName, name: 'b' }, 19, 0)).toThrow();
  });
});

// --------------------------------------------------------- the protocol bump

describe('the protocol version', () => {
  it('is the bump this bundle books, and it is not a save version', () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  it('is sent by the worker and compared on the main thread', () => {
    const worker = readFileSync(join(REPO_ROOT, 'src/sim/SimWorker.ts'), 'utf8');
    const client = readFileSync(join(REPO_ROOT, 'src/ui/SimClient.ts'), 'utf8');
    expect(worker).toMatch(/protocolVersion: PROTOCOL_VERSION/);
    expect(client).toMatch(/message\.protocolVersion !== PROTOCOL_VERSION/);
  });
});
