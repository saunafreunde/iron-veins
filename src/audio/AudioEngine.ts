import { VOLUME_CHANNEL_COUNT, VolumeChannel, type AppSettings } from '../shared/settings';
import { PowerCode } from '../sim/vehicles/spec';

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
 * The engine is told what is on screen, once per frame, and works out the rest
 * itself. It never reads the simulation and the simulation never knows it
 * exists.
 */

/** Most vehicle loops at once (section 18). Beyond this it is just noise. */
export const MAX_VEHICLE_VOICES = 12;

/** One-shot sounds, by what caused them. */
export const Cue = {
  Build: 0,
  Demolish: 1,
  Money: 2,
  Warning: 3,
  Click: 4,
} as const;
export type Cue = (typeof Cue)[keyof typeof Cue];

/** What the renderer knows about a vehicle that the ear cares about. */
export interface VehicleVoiceInput {
  readonly id: number;
  /** A value of PowerCode. */
  readonly power: number;
  /** Screen position relative to the centre, in half-widths: -1 .. 1. */
  readonly panX: number;
  /** 0 when stopped, 1 at line speed. */
  readonly throttle: number;
  /** How far from the middle of the screen, 0 near, 1 at the edge. */
  readonly distance: number;
}

interface Voice {
  readonly source: AudioBufferSourceNode | OscillatorNode;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
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
  private readonly channels: GainNode[] = [];
  private readonly noise: AudioBuffer;
  private readonly voices = new Map<number, Voice>();
  private enabled = true;

  /**
   * The context is injected rather than constructed, which is what lets the
   * whole graph be built and asserted in a headless test against a stub. An
   * engine that could only be exercised by listening to it would be an engine
   * nothing checks.
   */
  constructor(context: BaseAudioContext) {
    this.context = context;
    this.master = context.createGain();
    this.master.connect(context.destination);

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

  /** Volume of one channel, for the test to read back. */
  channelGain(channel: VolumeChannel): number {
    return this.channels[channel]?.gain.value ?? 0;
  }

  get voiceCount(): number {
    return this.voices.size;
  }

  /**
   * Bring the vehicle loops in line with what is on screen.
   *
   * The caller hands over everything visible; this picks the nearest twelve.
   * Nearest rather than loudest, because the ear expects the thing under the
   * cursor to be the thing it hears - and a stable choice keyed on the vehicle
   * id is what stops a locomotive's note jumping every time the list reorders.
   */
  setVehicles(inputs: readonly VehicleVoiceInput[]): void {
    if (!this.enabled) return;

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

  /** Stop everything, e.g. when the game is paused or audio is switched off. */
  stopAll(): void {
    for (const voice of this.voices.values()) this.stopVoice(voice);
    this.voices.clear();
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

  private startVoice(input: VehicleVoiceInput): Voice | null {
    const target = this.channels[VolumeChannel.Ambience];
    if (target === undefined) return null;

    const gain = this.context.createGain();
    gain.gain.value = 0;
    const panner = this.context.createStereoPanner();
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

    const voice: Voice = { source, gain, panner, filter, tonal: filter === null, vehicleId: input.id };
    this.voices.set(input.id, voice);
    return voice;
  }

  private tune(voice: Voice, input: VehicleVoiceInput): void {
    // Volume falls off with distance from the middle of the screen, which is
    // what "Lautstärke fällt mit Zoom-Distanz" means once the camera is the
    // listener: zoom out and everything is further away at once.
    const loudness = (0.05 + input.throttle * 0.25) * (1 - Math.min(1, input.distance));
    voice.gain.gain.value = Math.max(0, loudness);
    voice.panner.pan.value = Math.max(-1, Math.min(1, input.panX));

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
