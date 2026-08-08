import { MAP_SIZE_MAX, MAP_SIZE_MIN } from '../constants';

/**
 * The ONE rule about how big a map may be (D-197).
 *
 * It used to be two: `World.create` accepted whatever `NewGameParams` carried,
 * and `parseWorldState` accepted powers of two between 64 and 2048. The two
 * disagreed, and a disagreement in that direction is the expensive one - a
 * world of, say, 96 tiles could be CREATED and played and then could never be
 * saved, replayed, checkpointed or crash-bundled, because every one of those
 * doors goes through the parser. The failure arrives long after the mistake and
 * says nothing about where it came from.
 *
 * So the predicate lives here and both ends import it. The message lives here
 * too: a refusal that reads the same whether it came from a new game or from a
 * file is a refusal somebody can search for.
 *
 * The bounds are deliberately wider than `MAP_SIZES`. That list is what the
 * new-game screen OFFERS; this is what a world may be, and the 64- and
 * 128-tile fixtures the balancing suite builds by hand are inside it on
 * purpose - they are worlds the game can also save.
 */
export function isLegalMapSize(size: number): boolean {
  return (
    Number.isInteger(size) &&
    size >= MAP_SIZE_MIN &&
    size <= MAP_SIZE_MAX &&
    (size & (size - 1)) === 0
  );
}

/** The one sentence both ends print when {@link isLegalMapSize} says no. */
export function mapSizeRefusal(size: number): string {
  return `${size} is not a power of two between ${MAP_SIZE_MIN} and ${MAP_SIZE_MAX}`;
}
