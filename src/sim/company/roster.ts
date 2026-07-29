import { COMPANY_COLOR_COUNT, MAX_AI_COMPANIES, type Difficulty } from '../constants';
import { createCompany } from '../economy/company';
import type { Rng } from '../rng';
import type { CompanyState } from '../types';

/**
 * The competitors of section 15, as far as being a company goes. What they DO
 * is the decision cycle; what they ARE is here.
 *
 * The names are invented outright. Nothing in this game may carry a real
 * operator, manufacturer or series name, and a haulier is exactly the kind of
 * thing that would otherwise get one by accident.
 */
const AI_COMPANY_NAMES: readonly string[] = [
  'Nordwind Verkehr',
  'Talgrund Logistik',
  'Kupferstein Transport',
  'Hochmoor Bahn AG',
  'Seeblick Spedition',
  'Rautenberg Fracht',
  'Weissfels Kontor',
  'Ostmark Güterzug',
  'Silberau Verkehr',
  'Dornbach Logistik',
];

/**
 * Create the AI companies for a new game.
 *
 * Names and colours are drawn from the RNG, so the same seed produces the same
 * opponents - a competitor whose identity changed between two runs of the same
 * seed would break the determinism suite the moment one of them was named in a
 * news entry.
 *
 * Colours avoid the player's, because two companies the same colour on one map
 * is unreadable, and it costs one modulo to prevent.
 */
export function createAiCompanies(
  count: number,
  playerColorIndex: number,
  difficulty: Difficulty,
  rng: Rng,
): CompanyState[] {
  const wanted = Math.max(0, Math.min(MAX_AI_COMPANIES, Math.trunc(count)));
  const companies: CompanyState[] = [];

  // Draw without replacement, so two competitors are never called the same
  // thing. The pool is a copy: the constant stays the constant.
  const pool = [...AI_COMPANY_NAMES];

  for (let index = 0; index < wanted; index++) {
    const pick = rng.nextInt(pool.length);
    const name = pool[pick] ?? AI_COMPANY_NAMES[index]!;
    pool.splice(pick, 1);

    // One colour apart, starting past the player's, so no two companies share
    // one and the assignment does not depend on how many there are.
    const colorIndex = (playerColorIndex + 1 + index) % COMPANY_COLOR_COUNT;
    companies.push(createCompany(index + 1, name, colorIndex, difficulty));
  }
  return companies;
}
