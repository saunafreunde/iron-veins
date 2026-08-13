/**
 * The one-shot cues of section 18, in an import-free leaf.
 *
 * This file exists for the reason `src/sim/save/version.ts` exists (D-192):
 * `audioBridge.ts` needs the five NUMBERS to decide which command deserves
 * which noise, and it must be able to do that without the engine in its
 * import graph - otherwise the whole WebAudio identity is dragged into the
 * entry chunk to fetch an enum, and the dynamic import that keeps it out is
 * silently defeated. Measured: the engine and its soundscape are 8,359 B of
 * the main chunk when they arrive that way.
 *
 * Nothing may be added here that imports anything.
 */
export const Cue = {
  Build: 0,
  Demolish: 1,
  Money: 2,
  Warning: 3,
  Click: 4,
} as const;
export type Cue = (typeof Cue)[keyof typeof Cue];
