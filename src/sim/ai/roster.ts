import { AI_DECISION_INTERVAL_TICKS } from '../constants';
import type { Rng } from '../rng';
import { PERSONALITY_COUNT, type AiState } from './types';

/**
 * Assigning the competitors of section 15 their personalities and their slot
 * in the decision cycle.
 *
 * Personalities are drawn WITHOUT replacement while there are any left, so a
 * three-company game gets three different opponents rather than three that
 * happen to play the same way - which is the entire reason personalities exist.
 *
 * Decision ticks are spread evenly across the cycle so that no two competitors
 * ever compute in the same tick. That is what section 15 asks for, and it is
 * also what keeps the worst tick of a five-company game from costing five times
 * what a one-company game costs.
 */
export function createAiStates(companyCount: number, rng: Rng): AiState[] {
  const states: AiState[] = [];
  const aiCount = companyCount - 1;
  if (aiCount <= 0) return states;

  const pool: number[] = [];
  for (let index = 0; index < PERSONALITY_COUNT; index++) pool.push(index);

  const stagger = Math.max(1, Math.floor(AI_DECISION_INTERVAL_TICKS / aiCount));

  for (let index = 0; index < aiCount; index++) {
    if (pool.length === 0) {
      for (let p = 0; p < PERSONALITY_COUNT; p++) pool.push(p);
    }
    const pick = rng.nextInt(pool.length);
    const personality = pool[pick]!;
    pool.splice(pick, 1);

    states.push({
      companyId: index + 1,
      personality,
      // Offset by one so nobody thinks on tick zero, when the world has not
      // finished being built yet.
      nextDecisionTick: 1 + index * stagger,
      reviews: [],
      project: null,
      lastBuildTick: -AI_DECISION_INTERVAL_TICKS,
    });
  }
  return states;
}
