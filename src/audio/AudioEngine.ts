import { MapClimate } from '../sim/constants';
import { Cue } from './cues';
import { VOLUME_CHANNEL_COUNT, VolumeChannel, type AppSettings } from '../shared/settings';
import { PowerCode } from '../sim/vehicles/spec';
import {
  BELL_TILE_COOLDOWN_SECONDS,
  BELL_WINDOW_SECONDS,
  CROSSING_BELL,
  DEPARTURE_SIGNALS,
  EventGate,
  MUSIC_CHORDS,
  MUSIC_CHORD_SECONDS,
  MUSIC_FADE_SECONDS,
  MUSIC_VOICE_PEAK,
  PANNER_MAX_DISTANCE,
  PANNER_REF_DISTANCE,
  PANNER_ROLLOFF,
  WHISTLE_VEHICLE_COOLDOWN_SECONDS,
  WHISTLE_WINDOW_SECONDS,
  ambienceBedFor,
  ambienceZoneOf,
  isDeparture,
  pannerPlacementFor,
  type AmbienceZone,
  type DepartureSignal,
} from './soundscape';

/**
 * The synthesised audio of section 18.
 *
 * Every sound in the game is made by WebAudio at run time. There is not one
 * audio file in the repository and there is not meant to be: a whistle is a
 * sawtooth through an envelope, a diesel is filtered noise with a slow
 * wobble, and an electric locomotive is a frequency ramp tied to how fast it
 * is actually going. That is cheaper than a sample library, it never goes out
 * of sync with the simulation, and it is the difference between shipping a
 * game and shipping a game plus a licensing problem.
 *
 * The engine is told what is on screen, once every few frames, and works out
 * the rest itself. It never reads the simulation and the simulation never
 * knows it exists.
 *
 * **Everything WHAT a thing sounds like lives in `soundscape.ts`**; this file
 * is the only one that builds nodes. So the identity can be read without a
 * speaker and the graph can be asserted without a browser, which is the same
 * split the M9 injection bought and SPEC2 M25 asks for again by name
 * ("Headless-Audiograph-Assertions (M9-Muster)").
 */

/** Most vehicle loops at once (section 18). Beyond this it is just noise. */
export const MAX_VEHICLE_VOICES = 12;

/**
 * Most station ambience beds at once. [1]
 *
 * Origin: a bed is a wash rather than an event, and four washes already
 * overlap into one. Deliberately far below the twelve vehicle voices - the
 * thing a player is listening FOR is the traffic, and an ambience that can
 * drown it is an ambience that is turned off.
 */
export const MAX_AMBIENCE_VOICES = 4;

/**
 * The master compressor, as SPEC2 M25 asks for it.
 *
 * It is not a loudness trick: twelve vehicle loops, four ambience beds and a
 * chorus of departures can sum past full scale, and what a browser does then
 * is CLIP - a crack that has nothing to do with any of the sounds that caused
 * it. These are the WebAudio defaults but for the threshold, which is pulled
 * down so the compressor is actually working before the sum reaches the top.
 */
const COMPRESSOR = {
  /** Above this the compressor starts working. [dB] */
  thresholdDb: -18,
  /** How soft the bend into compression is. [dB] */
  kneeDb: 24,
  /** How hard it holds the level above the threshold. [1] */
  ratio: 8,
  /** How fast it reacts - short, because a whistle starts abruptly. [s] */
  attackSeconds: 0.004,
  /** How fast it lets go, long enough not to breathe audibly. [s] */
  releaseSeconds: 0.25,
} as const;

/** One-shot sounds, by what caused them; the table is the leaf `cues.ts`. */
export { Cue } from './cues';

/** What the renderer knows about a vehicle that the ear cares about. */
export interface VehicleVoiceInput {
  readonly id: number;
  /** A value of PowerCode. */
  readonly power: number;
  /** Screen position relative to the centre, in half-widths: -1 .. 1. */
  readonly panX: number;
  /** Screen position relative to the centre, in half-heights: -1 .. 1. */
  readonly panY: number;
  /** 0 when stopped, 1 at line speed. */
  readonly throttle: number;
  /** How far from the middle of the screen, 0 near, 1 at the edge. */
  readonly distance: number;
  /** A value of VehicleState - what the snapshot says it is doing. */
  readonly state: number;
  /**
   * The tile it is moving onto carries road AND track, i.e. it is about to
   * take a level crossing. Computed by the renderer, which is the only side
   * that holds the tile layers (the simulation is not asked, and never is).
   */
  readonly crossingTile: number;
}

/**
 * What the renderer knows about a station that the ear cares about.
 *
 * The census rather than the zone: which of the six beds those counts mean is
 * a decision about SOUND and belongs here, in the module that owns the beds.
 * The renderer owns the map layers, which this module must never read.
 */
export interface StationAmbienceInput {
  readonly id: number;
  /** Zoned building tiles around the station, by 13.1 zone. */
  readonly residential: number;
  readonly commercial: number;
  readonly industrial: number;
  readonly hasQuay: boolean;
  readonly hasRunway: boolean;
  readonly panX: number;
  readonly panY: number;
  readonly distance: number;
}

interface Voice {
  readonly source: AudioBufferSourceNode | OscillatorNode;
  readonly gain: GainNode;
  readonly panner: PannerNode;
  readonly filter: BiquadFilterNode | null;
  /**
   * True when the source is an oscillator whose pitch follows the speed.
   *
   * A flag rather than an `instanceof OscillatorNode`: the constructor is a
   * host global, so a test that supplies its own audio context could not
   * satisfy it, and a graph nothing can assert about is a graph nothing
   * checks.
   */
  readonly tonal: boolean;
  vehicleId: number;
}

interface Bed {
  readonly source: AudioBufferSourceNode;
  readonly filter: BiquadFilterNode;
  readonly gain: GainNode;
  readonly panner: PannerNode;
  /** The wobble that keeps the bed from being a dead hiss. */
  readonly wobble: OscillatorNode;
  readonly wobbleDepth: GainNode;
  zone: number;
}

interface PadVoice {
  readonly oscillator: OscillatorNode;
  readonly gain: GainNode;
}

/**
 * One second of white noise, reused by every voice that needs it.
 *
 * Made once because it is 44 100 random numbers and because every diesel in
 * the game can share it: they differ in the filter in front of them, not in
 * the noise behind it.
 */
function makeNoise(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  // Math.random is fine here and nowhere else in this project: audio is not
  // simulation, and two players hearing different noise is not a divergence.
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export class AudioEngine {
  private readonly context: BaseAudioContext;
  private readonly master: GainNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly channels: GainNode[] = [];
  private readonly noise: AudioBuffer;
  private readonly voices = new Map<number, Voice>();
  private readonly beds = new Map<number, Bed>();
  private readonly pad: PadVoice[] = [];
  /**
   * What each vehicle on screen was doing last time, which is what makes a
   * departure a thing that HAPPENED rather than a state that is true. Kept for
   * every vehicle the renderer reports, not only the twelve that have a voice:
   * a train leaving a terminus at the edge of the screen still departed.
   */
  private readonly lastState = new Map<number, number>();
  private readonly whistleGate = new EventGate(
    WHISTLE_WINDOW_SECONDS,
    WHISTLE_VEHICLE_COOLDOWN_SECONDS,
  );
  private readonly bellGate = new EventGate(BELL_WINDOW_SECONDS, BELL_TILE_COOLDOWN_SECONDS);
  private climate: MapClimate = MapClimate.Temperate;
  private dayPhase = 0;
  private padChordIndex = -1;
  private padNextChangeAt = 0;
  private enabled = true;

  /**
   * The context is injected rather than constructed, which is what lets the
   * whole graph be built and asserted in a headless test against a stub. An
   * engine that could only be exercised by listening to it would be an engine
   * nothing checks.
   */
  constructor(context: BaseAudioContext) {
    this.context = context;
    // channels -> master -> compressor -> speakers. The compressor sits LAST,
    // after the mixer, because it has to see the sum: one placed per channel
    // would duck the effects against the ambience instead of catching the
    // total.
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = COMPRESSOR.thresholdDb;
    this.compressor.knee.value = COMPRESSOR.kneeDb;
    this.compressor.ratio.value = COMPRESSOR.ratio;
    this.compressor.attack.value = COMPRESSOR.attackSeconds;
    this.compressor.release.value = COMPRESSOR.releaseSeconds;
    this.compressor.connect(context.destination);

    this.master = context.createGain();
    this.master.connect(this.compressor);

    for (let channel = 0; channel < VOLUME_CHANNEL_COUNT; channel++) {
      const gain = context.createGain();
      gain.connect(this.master);
      this.channels.push(gain);
    }
    this.noise = makeNoise(context);
  }

  /** Apply the mixer settings of section 18. */
  applySettings(settings: AppSettings): void {
    this.enabled = settings.audioEnabled;
    this.master.gain.value = settings.audioEnabled ? 1 : 0;
    for (let channel = 0; channel < VOLUME_CHANNEL_COUNT; channel++) {
      const gain = this.channels[channel];
      if (gain !== undefined) gain.gain.value = settings.volumes[channel] ?? 0;
    }
    if (!settings.audioEnabled) this.stopAll();
  }

  /**
   * The world's climate and how dark it is, for the station beds.
   *
   * Both are pure functions of published fields (the climate arrives on the
   * `ready` message since D-202, the phase is `emissiveIntensity` of the
   * published tick since D-172), so this is Z1's pixel side throughout: the
   * ambience never asks the simulation anything.
   */
  setWorldMood(climate: MapClimate, dayPhase: number): void {
    this.climate = climate;
    this.dayPhase = dayPhase;
  }

  /** Volume of one channel, for the test to read back. */
  channelGain(channel: VolumeChannel): number {
    return this.channels[channel]?.gain.value ?? 0;
  }

  get voiceCount(): number {
    return this.voices.size;
  }

  get bedCount(): number {
    return this.beds.size;
  }

  get padVoiceCount(): number {
    return this.pad.length;
  }

  /** Which zone a running bed is playing, or -1; the test's window onto it. */
  bedZone(stationId: number): number {
    return this.beds.get(stationId)?.zone ?? -1;
  }

  /** How loud a running bed is, or 0 - the `channelGain` device one down. */
  bedGain(stationId: number): number {
    return this.beds.get(stationId)?.gain.gain.value ?? 0;
  }

  /** The compressor, so the graph test can read what it was set to. */
  get masterCompressor(): DynamicsCompressorNode {
    return this.compressor;
  }

  /**
   * Bring the vehicle loops in line with what is on screen.
   *
   * The caller hands over everything visible; this picks the nearest twelve.
   * Nearest rather than loudest, because the ear expects the thing under the
   * cursor to be the thing it hears - and a stable choice keyed on the vehicle
   * id is what stops a locomotive's note jumping every time the list reorders.
   *
   * The EVENTS are read off the same list. A departure is a state transition
   * and a crossing bell is a tile the vehicle is moving onto, so both are
   * facts about two consecutive reports rather than a second channel from the
   * simulation - which is what keeps the sim from knowing sound exists.
   */
  setVehicles(inputs: readonly VehicleVoiceInput[]): void {
    if (!this.enabled) return;

    this.fireVehicleEvents(inputs);

    const wanted = [...inputs]
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.id - b.id;
      })
      .slice(0, MAX_VEHICLE_VOICES);

    const keep = new Set<number>();
    for (const input of wanted) {
      keep.add(input.id);
      const voice = this.voices.get(input.id) ?? this.startVoice(input);
      if (voice === null) continue;
      this.tune(voice, input);
    }

    for (const [id, voice] of [...this.voices]) {
      if (keep.has(id)) continue;
      this.stopVoice(voice);
      this.voices.delete(id);
    }
  }

  /**
   * Bring the station ambience in line with what is on screen: the nearest
   * few beds, each retuned for its zone, the climate and the hour.
   *
   * A bed is never rebuilt when only its tuning changed - the same argument as
   * the vehicle loops one method up, and a good deal louder here, because
   * restarting a noise loop is an audible click.
   */
  setStations(inputs: readonly StationAmbienceInput[]): void {
    if (!this.enabled) return;

    const wanted = [...inputs]
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.id - b.id;
      })
      .slice(0, MAX_AMBIENCE_VOICES);

    const keep = new Set<number>();
    for (const input of wanted) {
      const zone = ambienceZoneOf(
        input.residential,
        input.commercial,
        input.industrial,
        input.hasQuay,
        input.hasRunway,
      );
      keep.add(input.id);
      const bed = this.beds.get(input.id) ?? this.startBed(input, zone);
      if (bed === null) continue;
      this.tuneBed(bed, input, zone);
    }

    for (const [id, bed] of [...this.beds]) {
      if (keep.has(id)) continue;
      this.stopBed(bed);
      this.beds.delete(id);
    }
  }

  /**
   * The departure fanfare of SPEC2 M25, per traction class.
   *
   * Public and UNGATED: the debounce belongs to the event DETECTION, so that
   * a test can drive the fanfare of every traction class one after another
   * without nine of them being swallowed by the very rule the next test is
   * about.
   */
  playDeparture(power: number, panX: number, panY: number): void {
    if (!this.enabled) return;
    const signal = DEPARTURE_SIGNALS[power as PowerCode] ?? DEPARTURE_SIGNALS[PowerCode.Diesel];
    this.playSignal(signal, panX, panY);
  }

  /** The level crossing bell. */
  playCrossingBell(panX: number, panY: number): void {
    if (!this.enabled) return;
    this.playSignal(CROSSING_BELL, panX, panY);
  }

  /**
   * Move the generative pad along, if the Music channel is audible at all.
   *
   * Called from the same timer that feeds the vehicles. It schedules AHEAD on
   * the audio clock rather than starting a note when it is asked to, which is
   * the only way a pad on a 120 ms polling timer does not audibly stutter.
   *
   * **This is the whole of the music, and the timebox is why.** SPEC2 M25
   * allows music to degrade with dignity to ambience and vetoes it as a gate;
   * what is here is three voices over a four-chord cycle, and no attempt at a
   * composition was made or is claimed.
   */
  updateMusic(): void {
    if (!this.enabled) return;
    const channel = this.channels[VolumeChannel.Music];
    if (channel === undefined) return;
    if (channel.gain.value <= 0) {
      // The slider is at zero, which is where SPEC.md 18 ships it. Building a
      // pad nobody can hear would be three oscillators running for a session.
      this.stopPad();
      return;
    }

    const now = this.context.currentTime;
    if (this.pad.length === 0) this.startPad(channel);
    if (now < this.padNextChangeAt) return;

    this.padChordIndex = (this.padChordIndex + 1) % MUSIC_CHORDS.length;
    const chord = MUSIC_CHORDS[this.padChordIndex] ?? [];
    for (let i = 0; i < this.pad.length; i++) {
      const voice = this.pad[i]!;
      const hz = chord[i % Math.max(1, chord.length)] ?? 110;
      voice.oscillator.frequency.setValueAtTime(hz, now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(MUSIC_VOICE_PEAK, now + MUSIC_FADE_SECONDS);
    }
    this.padNextChangeAt = now + MUSIC_CHORD_SECONDS;
  }

  /** Stop everything, e.g. when the game is paused or audio is switched off. */
  stopAll(): void {
    for (const voice of this.voices.values()) this.stopVoice(voice);
    this.voices.clear();
    for (const bed of this.beds.values()) this.stopBed(bed);
    this.beds.clear();
    this.lastState.clear();
    this.stopPad();
  }

  /**
   * A one-shot: a build click, a till, a warning.
   *
   * Built and thrown away per sound rather than pooled. A oscillator node is
   * a few dozen bytes and these fire a handful of times a second at worst;
   * pooling them would be the kind of optimisation that costs more in bugs
   * than it saves in allocation.
   */
  play(cue: Cue): void {
    if (!this.enabled) return;
    const now = this.context.currentTime;
    const channel = cue === Cue.Warning ? VolumeChannel.Effects : VolumeChannel.Interface;
    const target = this.channels[channel];
    if (target === undefined) return;

    const gain = this.context.createGain();
    gain.connect(target);

    switch (cue) {
      case Cue.Build:
        this.blip(gain, now, 'square', 320, 180, 0.09, 0.3);
        return;
      case Cue.Demolish:
        this.noiseBurst(gain, now, 0.16, 900, 0.35);
        return;
      case Cue.Money:
        // Two notes a fifth apart: a till, without a sample of one.
        this.blip(gain, now, 'triangle', 880, 880, 0.12, 0.25);
        this.blip(gain, now + 0.07, 'triangle', 1320, 1320, 0.16, 0.2);
        return;
      case Cue.Warning:
        this.blip(gain, now, 'sawtooth', 220, 180, 0.35, 0.3);
        return;
      default:
        this.blip(gain, now, 'sine', 660, 660, 0.05, 0.15);
        return;
    }
  }

  // --------------------------------------------------------------- internals

  /**
   * Departures and crossing bells, both gated.
   *
   * The gate is asked BEFORE anything is built, so ten trains leaving on one
   * takt slot cost one whistle and nine map lookups - not ten graphs that are
   * then thrown away.
   */
  private fireVehicleEvents(inputs: readonly VehicleVoiceInput[]): void {
    const now = this.context.currentTime;
    for (const input of inputs) {
      const previous = this.lastState.get(input.id);
      this.lastState.set(input.id, input.state);
      if (previous === undefined) continue;

      if (isDeparture(previous, input.state) && this.whistleGate.admit(input.id, now)) {
        this.playDeparture(input.power, input.panX, input.panY);
      }
      if (input.crossingTile >= 0 && this.bellGate.admit(input.crossingTile, now)) {
        this.playCrossingBell(input.panX, input.panY);
      }
    }

    // Forget what left the screen, or the map grows for the session. A vehicle
    // that comes back gets no whistle on its first frame, which is right: the
    // engine did not see it depart.
    if (this.lastState.size <= inputs.length) return;
    const present = new Set<number>();
    for (const input of inputs) present.add(input.id);
    for (const id of [...this.lastState.keys()]) {
      if (!present.has(id)) this.lastState.delete(id);
    }
  }

  /**
   * One fanfare: the sawtooth partials, the noise beside them, one envelope
   * over both, and a repeat for the instruments that have one.
   *
   * That is SPEC.md 18's "Sägezahn + Rauschen, Hüllkurve" built as three
   * things rather than as one preset, which is what lets the same code play a
   * steam whistle, a diesel horn and a crossing bell from three rows of data.
   */
  private playSignal(signal: DepartureSignal, panX: number, panY: number): void {
    const target = this.channels[VolumeChannel.Effects];
    if (target === undefined) return;
    const panner = this.makePanner(panX, panY);
    panner.connect(target);

    const now = this.context.currentTime;
    this.strike(signal, panner, now);
    if (signal.repeatAfterSeconds > 0) {
      this.strike(signal, panner, now + signal.repeatAfterSeconds);
    }
  }

  private strike(signal: DepartureSignal, target: AudioNode, at: number): void {
    const length = signal.attackSeconds + signal.holdSeconds + signal.releaseSeconds;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(signal.peak, at + signal.attackSeconds);
    envelope.gain.setValueAtTime(signal.peak, at + signal.attackSeconds + signal.holdSeconds);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    envelope.connect(target);

    for (const hz of signal.partials) {
      const oscillator = this.context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(hz, at);
      oscillator.connect(envelope);
      oscillator.start(at);
      oscillator.stop(at + length + 0.02);
    }

    if (signal.noiseShare <= 0) return;
    const noise = this.context.createBufferSource();
    noise.buffer = this.noise;
    const band = this.context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(signal.noiseHz, at);
    band.Q.setValueAtTime(1.2, at);
    const noiseGain = this.context.createGain();
    noiseGain.gain.setValueAtTime(signal.noiseShare, at);
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(envelope);
    noise.start(at);
    noise.stop(at + length + 0.02);
  }

  /**
   * A panner with a distance model, which is what replaced the stereo panner
   * of M9 (SPEC2 M25).
   *
   * A `StereoPannerNode` knows only left and right, so a lorry in the middle
   * of the screen and one about to leave it were the same sound at a different
   * balance and the falloff had to be faked with a gain. This node does the
   * geometry: the camera is the listener, the screen is a plane one reference
   * distance in front of it, and the distance model does the rest.
   */
  private makePanner(panX: number, panY: number): PannerNode {
    const panner = this.context.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = PANNER_REF_DISTANCE;
    panner.maxDistance = PANNER_MAX_DISTANCE;
    panner.rolloffFactor = PANNER_ROLLOFF;
    this.placePanner(panner, panX, panY);
    return panner;
  }

  private placePanner(panner: PannerNode, panX: number, panY: number): void {
    const at = pannerPlacementFor(panX, panY);
    panner.positionX.value = at.x;
    panner.positionY.value = at.y;
    panner.positionZ.value = at.z;
  }

  private startVoice(input: VehicleVoiceInput): Voice | null {
    const target = this.channels[VolumeChannel.Ambience];
    if (target === undefined) return null;

    const gain = this.context.createGain();
    gain.gain.value = 0;
    const panner = this.makePanner(input.panX, input.panY);
    gain.connect(panner);
    panner.connect(target);

    let source: AudioBufferSourceNode | OscillatorNode;
    let filter: BiquadFilterNode | null = null;

    if (input.power === PowerCode.Electric || input.power === PowerCode.Battery) {
      // A wire-fed motor is a tone whose pitch follows the speed - the one
      // sound in the game that is genuinely a function of a state variable.
      const oscillator = this.context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 120;
      oscillator.connect(gain);
      oscillator.start();
      source = oscillator;
    } else {
      // Everything that burns something is filtered noise. What separates a
      // steam engine from a lorry is where the filter sits, not the source.
      const noise = this.context.createBufferSource();
      noise.buffer = this.noise;
      noise.loop = true;
      filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = input.power === PowerCode.Steam ? 380 : 220;
      filter.Q.value = input.power === PowerCode.Steam ? 1.4 : 3.2;
      noise.connect(filter);
      filter.connect(gain);
      noise.start();
      source = noise;
    }

    const voice: Voice = {
      source,
      gain,
      panner,
      filter,
      tonal: filter === null,
      vehicleId: input.id,
    };
    this.voices.set(input.id, voice);
    return voice;
  }

  private tune(voice: Voice, input: VehicleVoiceInput): void {
    // The falloff over the screen is the PANNER's job now; what is left here
    // is how hard the machine is working, which is a property of the vehicle
    // and not of where the camera happens to be.
    voice.gain.gain.value = Math.max(0, 0.05 + input.throttle * 0.25);
    this.placePanner(voice.panner, input.panX, input.panY);

    if (voice.tonal) {
      (voice.source as OscillatorNode).frequency.value = 90 + input.throttle * 260;
      return;
    }
    if (voice.filter !== null) {
      voice.filter.frequency.value = 180 + input.throttle * 420;
    }
  }

  private stopVoice(voice: Voice): void {
    voice.gain.gain.value = 0;
    try {
      voice.source.stop();
    } catch {
      // A source that was never started, or is already stopped, is already in
      // the state that was wanted.
    }
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.panner.disconnect();
  }

  private startBed(input: StationAmbienceInput, zone: AmbienceZone): Bed | null {
    const target = this.channels[VolumeChannel.Ambience];
    if (target === undefined) return null;

    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    const gain = this.context.createGain();
    gain.gain.value = 0;
    const panner = this.makePanner(input.panX, input.panY);

    // The wobble is an LFO ON the bed's own gain, so the bed breathes instead
    // of hissing. Depth is a fraction of the gain rather than an absolute, or
    // a quiet night bed would pump and a loud one would not.
    const wobble = this.context.createOscillator();
    wobble.type = 'sine';
    const wobbleDepth = this.context.createGain();
    wobble.connect(wobbleDepth);
    wobbleDepth.connect(gain.gain);
    wobble.start();

    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(target);
    source.start();

    const bed: Bed = { source, filter, gain, panner, wobble, wobbleDepth, zone };
    this.beds.set(input.id, bed);
    return bed;
  }

  private tuneBed(bed: Bed, input: StationAmbienceInput, zone: AmbienceZone): void {
    const look = ambienceBedFor(zone, this.climate, this.dayPhase);
    bed.zone = zone;
    bed.filter.frequency.value = look.filterHz;
    bed.filter.Q.value = look.q;
    bed.gain.gain.value = look.gain;
    bed.wobble.frequency.value = look.wobbleHz;
    bed.wobbleDepth.gain.value = look.gain * 0.35;
    this.placePanner(bed.panner, input.panX, input.panY);
  }

  private stopBed(bed: Bed): void {
    bed.gain.gain.value = 0;
    try {
      bed.source.stop();
      bed.wobble.stop();
    } catch {
      // Already stopped is the state that was wanted.
    }
    bed.source.disconnect();
    bed.filter.disconnect();
    bed.gain.disconnect();
    bed.panner.disconnect();
    bed.wobble.disconnect();
    bed.wobbleDepth.disconnect();
  }

  private startPad(target: GainNode): void {
    const voices = MUSIC_CHORDS[0]?.length ?? 0;
    for (let i = 0; i < voices; i++) {
      const oscillator = this.context.createOscillator();
      oscillator.type = 'triangle';
      const gain = this.context.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(target);
      oscillator.start();
      this.pad.push({ oscillator, gain });
    }
    this.padChordIndex = -1;
    this.padNextChangeAt = 0;
  }

  private stopPad(): void {
    for (const voice of this.pad) {
      voice.gain.gain.value = 0;
      try {
        voice.oscillator.stop();
      } catch {
        // Already stopped is the state that was wanted.
      }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    this.pad.length = 0;
    this.padChordIndex = -1;
    this.padNextChangeAt = 0;
  }

  private blip(
    target: GainNode,
    at: number,
    type: OscillatorType,
    from: number,
    to: number,
    seconds: number,
    peak: number,
  ): void {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, at + seconds);

    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

    oscillator.connect(envelope);
    envelope.connect(target);
    oscillator.start(at);
    oscillator.stop(at + seconds + 0.02);
  }

  private noiseBurst(
    target: GainNode,
    at: number,
    seconds: number,
    cutoff: number,
    peak: number,
  ): void {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(peak, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(target);
    source.start(at);
    source.stop(at + seconds + 0.02);
  }
}
