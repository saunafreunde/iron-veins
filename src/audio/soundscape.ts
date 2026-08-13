import { MapClimate } from '../sim/constants';
import { PowerCode } from '../sim/vehicles/spec';

/**
 * The sound identity of SPEC.md 18, as pure data and pure functions.
 *
 * Everything here is a DECISION about what a thing should sound like; nothing
 * here touches WebAudio. That split is what lets the whole identity be
 * asserted headless - a departure fanfare is a record of frequencies and an
 * envelope, and the engine beside it is the only file that turns one into
 * nodes. It is the D-183 shape ("the registry is the enumeration") applied to
 * sound: the tables below ARE the answer to "does every traction class have
 * its own signal", and a test reads them rather than counting oscillators.
 *
 * **Why these constants are not in `src/sim/constants.ts`.** That file's own
 * first sentence is "every magic number of the SIMULATION". A whistle
 * frequency touches neither money nor physics, so under Z1 it is on the pixel
 * side of the border, and the precedent is the render modules that already
 * carry their own tables with unit and origin (`particles.ts`'s `PARTICLE_CAP`
 * since D-174, `dayNight.ts`'s curve since D-127). Putting a hertz value in
 * the simulation's constant table would make it look like world state, which
 * is exactly the confusion Z1 exists to prevent. Every constant below still
 * carries its unit and where it comes from.
 */

// --------------------------------------------------------- departure signals

/**
 * How a departure announces itself.
 *
 * The steam row is SPEC.md 18's own sentence - "Dampfpfeife (Sägezahn +
 * Rauschen, Hüllkurve)" - read literally: sawtooth partials, a noise layer
 * beside them and an envelope over both. The other four are the same shape
 * with the noise turned down and the partials moved, because a diesel horn is
 * not a whistle with a different pitch, it is the same machine without the
 * steam in it.
 */
export interface DepartureSignal {
  /**
   * The sawtooth partials sounded together, lowest first. A whistle is a
   * CHORD - one oscillator is a test tone, three are a locomotive. [Hz]
   */
  readonly partials: readonly number[];
  /**
   * How loud the noise layer is against the partials. Origin: SPEC.md 18 names
   * noise only for the steam whistle, so steam is the only row with a real
   * share and the rest carry a trace or nothing. [1]
   */
  readonly noiseShare: number;
  /** Centre of the band the noise layer is pushed through. [Hz] */
  readonly noiseHz: number;
  /** Rise to full. A whistle blows open, a horn is switched on. [s] */
  readonly attackSeconds: number;
  /** Time at full before the release starts. [s] */
  readonly holdSeconds: number;
  /** Fall to silence. [s] */
  readonly releaseSeconds: number;
  /** Peak of the envelope, before the mixer channel. [1] */
  readonly peak: number;
  /**
   * A second blast, this far after the first, or 0 for a single one. Origin:
   * a road horn is two taps and a steam whistle is one long note; that is the
   * cheapest way to tell them apart with the eyes shut. [s]
   */
  readonly repeatAfterSeconds: number;
}

/**
 * One row per traction class of `PowerCode`, and the acceptance clause of
 * SPEC2 M25 is that they are five different sounds rather than five names for
 * one. The fundamentals below are pairwise distinct and
 * `tests/unit/audio.spec.ts` asserts it, so a copied row is a red build.
 *
 * Origin of the pitches: the real instruments. A steam whistle is a chime
 * chord around a' (D-117's argument - shape, not tint: what tells them apart
 * is the interval, not the volume), a diesel horn sits an octave and a half
 * lower in a minor third, an electric locomotive's horn is the bright two-tone
 * of a modern multiple unit, hydrogen is the same instrument a whole tone
 * down, and a battery vehicle - which has no engine to be heard over - answers
 * with a single soft chime.
 */
export const DEPARTURE_SIGNALS: Readonly<Record<PowerCode, DepartureSignal>> = {
  [PowerCode.Steam]: {
    partials: [466, 587, 698],
    noiseShare: 0.55,
    noiseHz: 1_900,
    attackSeconds: 0.07,
    holdSeconds: 0.55,
    releaseSeconds: 0.45,
    peak: 0.5,
    repeatAfterSeconds: 0,
  },
  [PowerCode.Diesel]: {
    partials: [175, 208],
    noiseShare: 0.08,
    noiseHz: 700,
    attackSeconds: 0.02,
    holdSeconds: 0.28,
    releaseSeconds: 0.18,
    peak: 0.45,
    repeatAfterSeconds: 0.42,
  },
  [PowerCode.Electric]: {
    partials: [392, 523],
    noiseShare: 0.04,
    noiseHz: 1_200,
    attackSeconds: 0.015,
    holdSeconds: 0.24,
    releaseSeconds: 0.16,
    peak: 0.4,
    repeatAfterSeconds: 0.34,
  },
  [PowerCode.Hydrogen]: {
    partials: [349, 466],
    noiseShare: 0.06,
    noiseHz: 1_050,
    attackSeconds: 0.02,
    holdSeconds: 0.26,
    releaseSeconds: 0.2,
    peak: 0.4,
    repeatAfterSeconds: 0.36,
  },
  [PowerCode.Battery]: {
    partials: [880],
    noiseShare: 0,
    noiseHz: 0,
    attackSeconds: 0.008,
    holdSeconds: 0.1,
    releaseSeconds: 0.3,
    peak: 0.3,
    repeatAfterSeconds: 0,
  },
};

/**
 * The level crossing bell of section 8.4's road/rail seam.
 *
 * Two strikes of a struck bell rather than a continuous ring: a crossing in
 * this game shuts on the claim a train already holds (D-185), so the bell is
 * an ANNOUNCEMENT of an arrival and not a state the ear has to live with for
 * as long as the barrier is down.
 */
export const CROSSING_BELL: DepartureSignal = {
  partials: [1_046, 1_568],
  noiseShare: 0.05,
  noiseHz: 2_600,
  attackSeconds: 0.004,
  holdSeconds: 0.05,
  releaseSeconds: 0.32,
  peak: 0.28,
  repeatAfterSeconds: 0.26,
};

// ---------------------------------------------------------- station ambience

/** What a station's surroundings sound like. */
export const AmbienceZone = {
  /** Houses: the quietest bed, birds and distance. */
  Residential: 0,
  /** Shops and offices: voices, more of them by day. */
  Commercial: 1,
  /** Works and yards: a low hum that does not care what time it is. */
  Industrial: 2,
  /** A quay: water and gulls. */
  Harbour: 3,
  /** An airfield: wind over concrete. */
  Airfield: 4,
  /** Open country - the fallback, and the commonest one. */
  Rural: 5,
} as const;
export type AmbienceZone = (typeof AmbienceZone)[keyof typeof AmbienceZone];

/** How many zones there are. [1] Origin: the six entries above. */
export const AMBIENCE_ZONE_COUNT = 6;

/**
 * What one zone's bed is made of. Every bed is filtered noise: a soundscape
 * is a spectrum, and a station is not a musical instrument.
 */
export interface AmbienceBed {
  /** Centre of the band the noise is pushed through. [Hz] */
  readonly filterHz: number;
  /** Sharpness of that band. Low is a wash, high is a whistle. [1] */
  readonly q: number;
  /** Loudness before the mixer channel and the day curve. [1] */
  readonly gain: number;
  /** How fast the bed breathes, so it is not a dead hiss. [Hz] */
  readonly wobbleHz: number;
}

/**
 * The six beds, by zone. Origin: chosen by what the place is, in the order
 * the ear notices - a works hums low and loud, a wood is high and quiet.
 */
export const AMBIENCE_BEDS: Readonly<Record<AmbienceZone, AmbienceBed>> = {
  [AmbienceZone.Residential]: { filterHz: 900, q: 0.9, gain: 0.05, wobbleHz: 0.07 },
  [AmbienceZone.Commercial]: { filterHz: 1_400, q: 0.7, gain: 0.08, wobbleHz: 0.13 },
  [AmbienceZone.Industrial]: { filterHz: 180, q: 1.6, gain: 0.11, wobbleHz: 0.05 },
  [AmbienceZone.Harbour]: { filterHz: 520, q: 0.6, gain: 0.09, wobbleHz: 0.09 },
  [AmbienceZone.Airfield]: { filterHz: 2_200, q: 0.5, gain: 0.07, wobbleHz: 0.04 },
  [AmbienceZone.Rural]: { filterHz: 2_800, q: 1.1, gain: 0.04, wobbleHz: 0.11 },
};

/**
 * What the climate does to a bed.
 *
 * **Temperate is an exact identity in both columns**, which is this project's
 * own convention for a new axis over an existing table (D-246's climate row,
 * D-248's gable era, D-201's clear sky): the world every reference measurement
 * was taken in must come out of the new arithmetic unchanged. The other three
 * are a tilt and never a replacement - a desert station is still the station
 * it was, drier and brighter.
 */
export const AMBIENCE_CLIMATE_TILT: Readonly<
  Record<MapClimate, { readonly filterFactor: number; readonly gainFactor: number }>
> = {
  [MapClimate.Temperate]: { filterFactor: 1, gainFactor: 1 },
  /** Thin, cold air over snow: bright and quiet. */
  [MapClimate.Arctic]: { filterFactor: 1.35, gainFactor: 0.75 },
  /** Rainforest: full of insects at every hour. */
  [MapClimate.Tropical]: { filterFactor: 1.15, gainFactor: 1.3 },
  /** Sand and wind, and not much else. */
  [MapClimate.Desert]: { filterFactor: 0.85, gainFactor: 0.85 },
};

/**
 * How much of a bed the deepest night takes away. [1]
 *
 * Origin: not silence. A works runs its shift at three in the morning and a
 * harbour never stops, so the night is a fall and not a switch; two thirds is
 * what leaves a station audible while making the difference obvious.
 */
export const AMBIENCE_NIGHT_QUIET_SHARE = 0.65;

/**
 * The zone a station stands in, from what its census counted.
 *
 * A quay and a runway WIN over the census, and that is the decision: a
 * container terminal in the middle of an industrial estate is a harbour to the
 * ear, and an airfield is the loudest thing for a mile whatever is beside it.
 * Below them the dominant building kind decides, ties going to the lower zone
 * id so the answer is a total order and not a walk order (law #3's habit, even
 * on the pixel side where it is not law).
 */
export function ambienceZoneOf(
  residential: number,
  commercial: number,
  industrial: number,
  hasQuay: boolean,
  hasRunway: boolean,
): AmbienceZone {
  if (hasRunway) return AmbienceZone.Airfield;
  if (hasQuay) return AmbienceZone.Harbour;
  if (residential === 0 && commercial === 0 && industrial === 0) return AmbienceZone.Rural;
  if (residential >= commercial && residential >= industrial) return AmbienceZone.Residential;
  if (commercial >= industrial) return AmbienceZone.Commercial;
  return AmbienceZone.Industrial;
}

/**
 * The bed a station plays: its zone, tilted by the climate, dimmed by the
 * hour.
 *
 * `dayPhase` is M13's own day curve read straight - `emissiveIntensity(tick)`,
 * 0 in full daylight and 1 at the darkest (D-172) - so the ambience gets
 * quiet exactly as fast as the windows come on, out of ONE source of truth
 * instead of a second clock that would drift against the picture.
 */
export function ambienceBedFor(
  zone: AmbienceZone,
  climate: MapClimate,
  dayPhase: number,
): AmbienceBed {
  const base = AMBIENCE_BEDS[zone];
  const tilt = AMBIENCE_CLIMATE_TILT[climate];
  const night = Math.max(0, Math.min(1, dayPhase));
  return {
    filterHz: base.filterHz * tilt.filterFactor,
    q: base.q,
    gain: base.gain * tilt.gainFactor * (1 - AMBIENCE_NIGHT_QUIET_SHARE * night),
    wobbleHz: base.wobbleHz,
  };
}

// ------------------------------------------------------- what a departure IS

/**
 * `VehicleState.Driving` - the state a departure arrives in.
 *
 * A literal with the name beside it rather than an import, which is the
 * pattern `render/interpolation.ts`, `render/badges.ts` and `render/emissive.ts`
 * already use for the same enum: importing `VehicleStore` would pull the whole
 * vehicle store - and through it the catalogue and the consist arithmetic -
 * into the entry chunk for the sake of five integers, which is D-191's
 * measured trap. `tests/unit/audio.spec.ts` pins every value below against the
 * real `VehicleState`, so a renumbering is a red build and not a silent
 * silence.
 */
export const AUDIO_STATE_DRIVING = 1;

/**
 * The states a DEPARTURE is a departure from: `Stopped` (0), `Loading` (3),
 * `WaitingForCargo` (4), `InDepot` (6) and `WaitingForSlot` (10).
 *
 * `WaitingForPath` (8) is deliberately NOT one of them. A train held at a
 * signal restarts on open line several times a journey (D-060), and treating
 * that as a departure would put a whistle on every block boundary - which is
 * the chorus the debounce exists to defeat, arriving through the front door.
 * A departure in this game is leaving a PLATFORM or a shed.
 */
export const DEPARTURE_FROM_STATES: readonly number[] = [0, 3, 4, 6, 10];

/** True when this pair of states is a departure. */
export function isDeparture(previous: number, next: number): boolean {
  if (next !== AUDIO_STATE_DRIVING) return false;
  for (let i = 0; i < DEPARTURE_FROM_STATES.length; i++) {
    if (DEPARTURE_FROM_STATES[i] === previous) return true;
  }
  return false;
}

// ------------------------------------------------------------- the 3D placer

/**
 * Half the width of the screen, in listener units. [1]
 *
 * Origin: chosen against `PANNER_PLANE_DEPTH_UNITS` below so that a source at
 * the left edge of the screen is 2.24 units from the listener while one in the
 * middle is 1 - which under the inverse distance model is a fall to 0.45, an
 * audible edge without a vehicle disappearing the moment it leaves the middle.
 */
export const PANNER_SCREEN_HALF_UNITS = 2;

/**
 * How far in front of the listener the screen plane sits. [1]
 *
 * Origin: it IS the reference distance, so a thing at the centre of the screen
 * plays at exactly its own gain and every falloff in the game is a departure
 * from that one point.
 */
export const PANNER_PLANE_DEPTH_UNITS = 1;

/** Below this distance the model stops attenuating. [1] Origin: the plane. */
export const PANNER_REF_DISTANCE = PANNER_PLANE_DEPTH_UNITS;

/**
 * Beyond this the model stops attenuating further. [1]
 *
 * Origin: the far corner of a 16:9 screen is `sqrt(2 * 2² + 1)` = 3 units, so
 * a ceiling of 8 is comfortably past anything the camera can produce and the
 * clamp never decides a gain the geometry did not.
 */
export const PANNER_MAX_DISTANCE = 8;

/** How hard the inverse model falls with distance. [1] Origin: the default. */
export const PANNER_ROLLOFF = 1;

/** Where a source sits, in the listener's own coordinates. */
export interface PannerPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Screen position to listener position.
 *
 * The camera IS the listener, so the screen is a plane one reference distance
 * in front of it and a vehicle's own position on that plane is the whole
 * answer. `z` is negative because the WebAudio listener looks down -z by
 * default, and putting sources behind it is the one arrangement whose front to
 * back confusion nobody can hear their way out of.
 *
 * Both axes are CLAMPED. A vehicle drawn just off the edge of the screen is a
 * legitimate input (the sprite pool draws a margin), and without the clamp its
 * distance would grow without bound and its sound would vanish long before it
 * came back into view.
 */
export function pannerPlacementFor(panX: number, panY: number): PannerPlacement {
  const x = Math.max(-1, Math.min(1, panX)) * PANNER_SCREEN_HALF_UNITS;
  const y = Math.max(-1, Math.min(1, panY)) * PANNER_SCREEN_HALF_UNITS;
  return { x, y, z: -PANNER_PLANE_DEPTH_UNITS };
}

/**
 * The gain the inverse distance model will apply at that placement.
 *
 * The engine does not call this - the browser does the arithmetic inside the
 * node. It exists so the test can state what "behaves at the map edges" MEANS
 * as a number instead of asserting that a field was assigned.
 */
export function pannerGainAt(placement: PannerPlacement): number {
  const distance = Math.min(
    PANNER_MAX_DISTANCE,
    Math.sqrt(placement.x * placement.x + placement.y * placement.y + placement.z * placement.z),
  );
  return (
    PANNER_REF_DISTANCE /
    (PANNER_REF_DISTANCE + PANNER_ROLLOFF * Math.max(0, distance - PANNER_REF_DISTANCE))
  );
}

// ----------------------------------------------------------------- the gates

/**
 * At most one whistle in this window, whatever departs. [s]
 *
 * Origin: SPEC2 M25 names the failure by name - "der 10-Züge-Klaxon-Chor".
 * Ten trains leaving a terminus on one takt slot is not an unlikely case in
 * this game, it is what a working timetable LOOKS like (D-149), so the chorus
 * is the normal case and the debounce is not a safety net but the design.
 */
export const WHISTLE_WINDOW_SECONDS = 0.9;

/**
 * The same vehicle may not whistle again inside this. [s]
 *
 * Origin: a vehicle that leaves a stop, brakes at a signal and starts again
 * would otherwise announce itself twice within a few seconds. Twenty seconds
 * is four station dwells at 1x.
 */
export const WHISTLE_VEHICLE_COOLDOWN_SECONDS = 20;

/** At most one crossing bell in this window, whatever approaches. [s] */
export const BELL_WINDOW_SECONDS = 1.4;

/** The same crossing may not ring again inside this. [s] */
export const BELL_TILE_COOLDOWN_SECONDS = 12;

/**
 * How many keys a gate remembers before it forgets the oldest. [1]
 *
 * Origin: a gate keyed on a vehicle id would otherwise grow for the length of
 * a session. Two hundred is more than the twelve voices and more than any
 * plausible number of crossings on one screen, and the eviction is by age, so
 * the entries that go are the ones whose cooldown was nearly up anyway.
 */
export const GATE_MAX_KEYS = 200;

/**
 * The debounce, as a thing that can be tested without a speaker.
 *
 * Two rules, and both are needed. The WINDOW is what defeats the chorus: ten
 * departures in one frame are one whistle, because the second one asks 0
 * seconds after the first. The per-key COOLDOWN is what stops a single
 * vehicle chirping every time it restarts, which the window alone would allow
 * as long as it was slow about it.
 *
 * Time comes from the caller - and the caller passes `AudioContext.currentTime`
 * rather than a wall clock, so the gate is on the same clock as the sounds it
 * is gating and a headless test simply advances it.
 */
export class EventGate {
  private lastAdmitted = Number.NEGATIVE_INFINITY;
  private readonly seen = new Map<number, number>();

  constructor(
    private readonly windowSeconds: number,
    private readonly keyCooldownSeconds: number,
  ) {}

  /** True if this event may sound now; recording it if so. */
  admit(key: number, nowSeconds: number): boolean {
    if (nowSeconds - this.lastAdmitted < this.windowSeconds) return false;
    const previous = this.seen.get(key);
    if (previous !== undefined && nowSeconds - previous < this.keyCooldownSeconds) return false;

    this.lastAdmitted = nowSeconds;
    this.seen.set(key, nowSeconds);
    if (this.seen.size > GATE_MAX_KEYS) this.forgetOldest();
    return true;
  }

  /** How many keys are remembered; the test's window onto the eviction. */
  get rememberedKeys(): number {
    return this.seen.size;
  }

  private forgetOldest(): void {
    let oldestKey = -1;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, at] of this.seen) {
      if (at < oldestAt || (at === oldestAt && key < oldestKey)) {
        oldestAt = at;
        oldestKey = key;
      }
    }
    if (oldestKey >= 0) this.seen.delete(oldestKey);
  }
}

// ------------------------------------------------------------------- the pad

/**
 * The generative music of SPEC2 M25, and what it degraded to.
 *
 * The clause is explicit that music is TIMEBOXED and that the acceptance is
 * the event sounds - "Musik darf würdevoll zu Ambience degradieren
 * (Juroren-Veto gegen Musik als Gate)". So this is not a composer: it is a
 * three-voice pad that moves through a fixed cycle of chords, on the Music
 * channel, which SPEC.md 18 ships at zero per cent. A player who wants music
 * puts files in the documented folder; a player who turns the slider up gets a
 * drone that stays out of the way. Nothing else was attempted, and the entry
 * says so rather than shipping half a soundtrack.
 *
 * The pitches are one chord per row, in the order they are played. Origin: a
 * i - VI - III - VII loop in A minor, which is the least intrusive four-chord
 * cycle there is, one octave below the middle so it sits under the effects.
 */
export const MUSIC_CHORDS: readonly (readonly number[])[] = [
  [110, 164.81, 220],
  [87.31, 130.81, 174.61],
  [130.81, 196, 261.63],
  [98, 146.83, 196],
];

/** How long one chord lasts. [s] Origin: slow enough not to be a rhythm. */
export const MUSIC_CHORD_SECONDS = 12;

/** Crossfade between two chords. [s] Origin: half a chord, so it never edges. */
export const MUSIC_FADE_SECONDS = 6;

/** Peak of one pad voice, before the Music channel. [1] */
export const MUSIC_VOICE_PEAK = 0.09;
