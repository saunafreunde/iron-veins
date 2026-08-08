/**
 * The identity of the save container: its version number and its two file
 * extensions. Nothing else, and - this is the whole point - NO imports.
 *
 * Three things on the main thread need to know what a save file is CALLED and
 * which format this build writes: the file dialogs, the crash reporter's
 * metadata and the replay browser's "this build cannot judge that recording"
 * hint. None of them decodes anything. Taken from `format.ts` those three
 * values arrive with the parser, the entity codecs and everything under them
 * attached, and a static import of that chain from `src/ui` puts the
 * simulation in the main bundle - the +248 kB defect of D-191 in a smaller
 * shape (measured here at +32 kB).
 *
 * So the identity is a leaf and everything that DECODES stands above it.
 * `format.ts` re-exports all three, which keeps the simulation's own call
 * sites pointed at the one door they always used.
 */

/**
 * Current save format version.
 *
 * Rule (section 19.1, failure #11): every change to the shape of the simulation
 * state bumps this number AND adds a migration under ./migrations. Skipping the
 * migration once makes every older save unloadable forever.
 *
 * Version 2 (M1) added the map, the towns and the industries. No migration from
 * version 1 is registered: a version 1 world had no map at all, so a migration
 * could only invent one, and handing the player a world that is not the one
 * they saved is worse than refusing to load it. Version 1 existed for a single
 * milestone and was never distributed.
 *
 * From version 2 on every step has a real migration: 3 added stations and
 * vehicles, 4 the two rail tile layers, 5 the train composition and the running
 * distance-to-go, 6 the bridge and tunnel layers, 7 signals and the two
 * reservation indices a train carries, 8 industry production and the town
 * delivery counters, 9 the block claim and the deadlock clock, 10 the cargo
 * destinations and the measured connection table of section 7.4, 11 industry
 * closure and the three support modules of section 10, 12 the bankruptcy
 * countdown of section 14.2, 13 the accounts of section 14.1, 14 the traction
 * work each vehicle has done since its last energy bill, 15 the inflation
 * setting of section 14.2 and the auto-renewal switch of 11.3, 16 the runway
 * occupancy of section 8.4, 17 the news log of section 17.1, 18 the several
 * companies of section 15 with the tile ownership and the command authorship
 * that come with them, 19 the town councils of section 13.3, 20 the carbon
 * account of section 14.3, 21 the tenders of section 14.4, 22 the AI
 * competitors of section 15, 23 the world digest of M10 - a container-only
 * change: the hashed state itself is untouched, which the migration test
 * proves by hash identity - 24 the M11 line backbone: the full order
 * grammar of section 12.1 (waypoints, refit, dwell, conditional jumps), the
 * waypoint tile layer, and - Stage B of the same bump - the line entities of
 * section 12.2 with the per-vehicle assignment, the per-line auto-renewal
 * that replaces the company-wide flag, and the AI's line adoption (E-06);
 * M11's ONE bump (SPEC2 Z5): the later stages of the milestone extend the
 * same v24 migration rather than adding numbers. 25 is M14's one bump: the
 * per-station cargo-history ring of the station x-ray (twelve months of
 * collected/delivered/expired per cargo, plus the month in progress). A
 * pre-M14 world recorded no history, so the migration hands every station a
 * zeroed ring - which is exactly what that world knew. 26 is M15's one bump:
 * the two route-cost world rules of SPEC.md 8.4 - `occupancyPenalty` and
 * `signalPenalty` - which decide what `railPath` charges for an occupied
 * section and for a signal, plus - extending the SAME v26 migration in place
 * (SPEC2 Z5) - the road half of 8.4: the world rule `roadCongestion` and the
 * saved Uint8 congestion layer it records into. A world that predates them was
 * driven without them, so the migration enters all three rules as OFF and the
 * layer as zeros, which is exactly what those worlds did and knew. 27 is M16's
 * one bump and, like 23, a CONTAINER-only one: the checkpoint ring, the tick
 * the retained command log starts from, and the claim a `.ironreplay` makes
 * about where the recording ends - extended IN PLACE by M16's correction
 * bundle (Z5, D-191) with one schedule digest per mark, so a command MOVED
 * inside a bracket is detectable instead of silently renaming the divergent
 * tick. Not one byte of the hashed world state moves, which the migration test
 * proves by hash identity. 28 is M17's one bump and the first one since 26 to
 * move hashed world state: the goal machine - what a world asks of the player
 * and what the simulation has decided about it - plus the per-company lifetime
 * tonnage a cargo goal reads. A world that predates M17 asked nothing, so the
 * migration gives it no goals and a zeroed tally, which is exactly what it
 * knew. The scenario bundle of the SAME milestone extends that one migration in
 * place (Z5) with the `.ironscenario` metadata block - a CONTAINER field like
 * the checkpoint ring, so it moves no hashed byte and the pins do not move
 * again. 29 is M18's one bump and it moves hashed state again: the weather
 * world rule of SPEC2 E-01 (off/mild/harsh) and the 16x16 region field it
 * drives, both saved and hashed because weather is simulation reality rather
 * than render candy. A world that predates M18 had no weather, so the
 * migration enters the rule as off and the field as all-clear - which is
 * exactly what a world with the rule off holds for ever.
 */
export const SAVE_VERSION = 29;

/** File extension used for manual and automatic saves. */
export const SAVE_EXTENSION = '.ironsave';

/**
 * File extension of a replay (SPEC2 M16).
 *
 * A replay is not a second format: it is the save container holding the world
 * at the tick its retained log starts from, `commandsExecuted = 0`, and a
 * claim naming where the recording ends. One container, one parser, one
 * migration chain - a second format would be a second parser, and a second
 * parser falls silently behind the command set (D-133).
 */
export const REPLAY_EXTENSION = '.ironreplay';

/**
 * File extension of a scenario (SPEC2 M17).
 *
 * Not a second format either, and for the same reason: a scenario is the save
 * container plus one UNHASHED metadata block (`save/scenarioMeta.ts`) - SPEC2's
 * own "Ein Serializer: Szenario-Kompatibilitaet IST Save-Kompatibilitaet". One
 * container, one parser, one migration chain.
 *
 * It stands in this import-free leaf beside the other two because the browser
 * and the file dialogs of the scenario UI only NAME files; taking the string
 * from `format.ts` would pull the parser and the entity codecs into the main
 * bundle, which is the +32 kB half of D-191 measured above.
 */
export const SCENARIO_EXTENSION = '.ironscenario';
