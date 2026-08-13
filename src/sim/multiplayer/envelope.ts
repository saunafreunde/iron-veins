import { Fnv1a64 } from '../hash';
import type { CommandEnvelope } from '../commands/types';

/**
 * The envelope checksum of SPEC2 E-16 - groundwork, not netcode.
 *
 * There is no transport in this game and there will be none in this programme
 * (E-16 forbids it by name). What this file is for is that the day there IS
 * one, the checksum a sender writes and the checksum a receiver recomputes are
 * the same arithmetic, in one place, with the reason for its shape written
 * down - rather than two implementations that agree until the first edit.
 *
 * WHAT IT COVERS, AND WHY IT STOPS THERE. Tick, sequence number, company and
 * the command's KIND: the envelope header. Not the payload. That is not
 * laziness, it is D-191's split applied one instrument down:
 *
 *  - a checkpoint in the replay chain commits to the SCHEDULE of its segment -
 *    the `(tick, seq)` pairs - and deliberately not to what the commands did,
 *    because a moved, dropped or duplicated envelope is exactly what a schedule
 *    commitment catches;
 *  - and a bent payload is exactly what a STATE digest catches, which is why
 *    the other half of this milestone's groundwork is a per-tick digest
 *    (`tickDigest.ts`) and not a longer checksum.
 *
 * Covering the payload here would need a canonical encoding of every command
 * variant - a second serializer beside `save/format.ts`, which is the D-133
 * defect (a second parser falls silently behind the command set). The kind is
 * in, because a checksum that could not tell a `BuildRoad` from a `SellVehicle`
 * would let the commonest transport accident of all - a message read at the
 * wrong offset - through.
 *
 * DETERMINISM. Integer arithmetic through the project's own FNV-1a, so two
 * peers on two engines reach the same 32-bit word from the same envelope
 * (architecture law #3; `Math.imul` inside the hash is exact by definition).
 */

/**
 * Checksum of an envelope's header, as a 32-bit unsigned word.
 *
 * The upper half of the 64-bit FNV digest, because the field is a `number` on
 * the wire and 32 bits is what a `number` carries exactly through every
 * integer path this project has. Collisions at 2^-32 per envelope are the
 * price of an integrity FIELD rather than a signature, and the per-tick digest
 * is what stands behind it.
 */
export function envelopeChecksum(envelope: CommandEnvelope): number {
  const h = new Fnv1a64();
  h.u32(envelope.tick);
  h.u32(envelope.seq);
  h.u32(envelope.companyId);
  h.u32(envelope.command.kind);
  return Number.parseInt(h.digest().slice(0, 8), 16) >>> 0;
}

/**
 * Whether an envelope's carried checksum agrees with its header.
 *
 * An envelope with NO checksum answers `true`: absence is what every envelope
 * this build writes looks like, and treating "not claimed" as "claimed wrongly"
 * would make the reserved field a trap for the offline game it does not
 * concern. A receiver that requires the field checks for its presence itself -
 * that is a session policy, and E-16 leaves sessions out of this programme.
 */
export function envelopeChecksumMatches(envelope: CommandEnvelope): boolean {
  if (envelope.checksum === undefined) return true;
  return envelope.checksum === envelopeChecksum(envelope);
}
