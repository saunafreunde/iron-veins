import type { NewGameOptions } from '../shared/protocol';
import type { NewGameParams } from './types';

/**
 * The one translation from what a screen CHOSE into what a world is CREATED
 * with (SPEC2 M17).
 *
 * It existed as a literal inside `SimWorker.restart` until the scenario browser
 * needed the same mapping: a shipped scenario is a set of new-game options, and
 * the determinism suite has to build exactly the world the browser starts, not
 * a world assembled from the same fields by a second hand. A field added to
 * `NewGameOptions` and forgotten here would give the player a rule the fixture
 * never ran with - and the fixture would still be green, because it would be
 * hashing its own mistake twice.
 *
 * Nothing is defaulted here on purpose. `World`'s own constructor is where
 * "absent means off" lives for the two 8.4 rules (D-185) and "absent means
 * none" for the goals (D-193); repeating those decisions in a mapping function
 * would give the game two places to change them.
 */
export function worldParamsFor(options: NewGameOptions): NewGameParams {
  return {
    seed: options.seed,
    difficulty: options.difficulty,
    climate: options.climate,
    mapSize: options.mapSize,
    companyName: options.companyName,
    companyColorIndex: options.companyColorIndex,
    inflation: options.inflation,
    emissions: options.emissions,
    occupancyPenalty: options.occupancyPenalty,
    signalPenalty: options.signalPenalty,
    roadCongestion: options.roadCongestion,
    weather: options.weather,
    aiCompanies: options.aiCompanies,
    goals: options.goals,
  };
}
