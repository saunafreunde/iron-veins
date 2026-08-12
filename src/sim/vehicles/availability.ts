import type { Cargo } from '../cargo/types';
import { MapClimate } from '../constants';
import { climateProducesCargo } from '../industry/climateSets';
import type { VehicleSpec } from './spec';

/**
 * The ONE gate that answers "can this be bought here and now" (SPEC2 M23).
 *
 * Two questions and one answer. The ERA half is the one M23 bundle 1 already
 * had - a spec is on sale between its `introYear` and its `retireYear`, which
 * is how a 1850 world sells steam and a 1990 world does not (D-245). The
 * CLIMATE half is this bundle's, and SPEC2 asks for exactly that: the
 * availability mask shares its mechanism with the era gating rather than
 * standing beside it.
 *
 * Sharing it is not tidiness. Before this bundle the era comparison stood
 * written out in SEVEN places - three buy commands, the consist validator, the
 * renewal successor, and the two shop lists - and a climate rule added to six
 * of them would have been a vehicle the shop offers and the command refuses,
 * or worse, one the command allows and the shop never shows. All seven call
 * this function now, so the shop, the buy command, the composer and the
 * renewal cannot disagree about what exists.
 *
 * **The mask is DERIVED from the climate's industry set, never listed.** A
 * vehicle is refused when nothing it could carry is made anywhere in that
 * world: a tanker in a rainforest that has no oil well, a livestock van in the
 * arctic that has no farm. The alternative - a hand-written list of refused
 * ids per climate - would be a second content table to keep in step with
 * `climateSets.ts`, and it would drift on the first industry moved between two
 * arms. Passengers, mail and containers are produced by towns and ports rather
 * than by industries, so a coach and a container ship exist in every climate.
 *
 * **A refit counts.** The question is asked of the capacity table AND the
 * refit list, because a wagon that can be refitted to something the world
 * makes is a wagon worth owning. That is what keeps the mask honest: it
 * removes the vehicles that would have nothing to do, and not the ones a
 * player would use differently.
 *
 * In a temperate world the mask is the identity - every industry exists, so
 * every cargo is made and nothing is refused - which is why this bundle moved
 * no band, no pin and no temperate scenario (D-246).
 */

/**
 * Does this world make anything this vehicle could carry?
 *
 * A vehicle that carries NOTHING is never refused, and that is the rule that
 * keeps every climate playable: traction has an empty capacity table and an
 * empty refit list, so a locomotive is asked no question here at all - it
 * hauls whatever its wagons hold, and a climate with no engines would be a
 * climate with no railway.
 */
export function climateAllowsSpec(spec: VehicleSpec, climate: MapClimate): boolean {
  if (climate === MapClimate.Temperate) return true;
  const keys = Object.keys(spec.capacity);
  if (keys.length === 0 && spec.refittable.length === 0) return true;
  for (const key of keys) {
    if (climateProducesCargo(climate, Number(key) as Cargo)) return true;
  }
  for (const cargo of spec.refittable) {
    if (climateProducesCargo(climate, cargo)) return true;
  }
  return false;
}

/** Is this spec on sale in `year`, in a world of this climate? */
export function specAvailable(spec: VehicleSpec, year: number, climate: MapClimate): boolean {
  if (year < spec.introYear || year > spec.retireYear) return false;
  return climateAllowsSpec(spec, climate);
}
