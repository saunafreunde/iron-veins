import { describe, expect, it } from 'vitest';
import {
  AudioEngine,
  Cue,
  MAX_AMBIENCE_VOICES,
  MAX_VEHICLE_VOICES,
  type StationAmbienceInput,
  type VehicleVoiceInput,
} from '../../src/audio/AudioEngine';
import {
  AMBIENCE_NIGHT_QUIET_SHARE,
  AMBIENCE_ZONE_COUNT,
  AUDIO_STATE_DRIVING,
  AmbienceZone,
  BELL_TILE_COOLDOWN_SECONDS,
  CROSSING_BELL,
  DEPARTURE_FROM_STATES,
  DEPARTURE_SIGNALS,
  EventGate,
  GATE_MAX_KEYS,
  MUSIC_CHORDS,
  MUSIC_CHORD_SECONDS,
  PANNER_MAX_DISTANCE,
  PANNER_REF_DISTANCE,
  PANNER_SCREEN_HALF_UNITS,
  WHISTLE_VEHICLE_COOLDOWN_SECONDS,
  WHISTLE_WINDOW_SECONDS,
  ambienceBedFor,
  ambienceZoneOf,
  isDeparture,
  pannerGainAt,
  pannerPlacementFor,
} from '../../src/audio/soundscape';
import { DEFAULT_SETTINGS, VolumeChannel } from '../../src/shared/settings';
import { MapClimate } from '../../src/sim/constants';
import { PowerCode } from '../../src/sim/vehicles/spec';
import { VehicleState } from '../../src/sim/vehicles/VehicleStore';

/**
 * The audio engine of section 18 and the sound identity of SPEC2 M25, tested
 * without a speaker.
 *
 * Nothing here can hear anything, so what is checked is the GRAPH and the
 * DATA: that a voice is built per vehicle and torn down again, that no more
 * than twelve ever exist at once, that the mixer channels carry the settings,
 * that switching audio off leaves nothing running - and, since M25, that every
 * traction class has a fanfare of its own, that ten trains departing on one
 * takt slot cost ONE whistle, that the panner is a distance model rather than
 * a balance knob, and that the master sum goes through a compressor. Those are
 * the things that go wrong silently, and every one of them is a fact about the
 * object graph or about a table rather than about the sound.
 */

// ------------------------------------------------------------- a stub context

class StubParam {
  value = 0;
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
}

class StubNode {
  readonly connected: unknown[] = [];
  disconnected = false;
  connect(target: unknown): unknown {
    this.connected.push(target);
    return target;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

class StubGain extends StubNode {
  readonly gain = new StubParam();
}

class StubPanner extends StubNode {
  panningModel = '';
  distanceModel = '';
  refDistance = 0;
  maxDistance = 0;
  rolloffFactor = 0;
  readonly positionX = new StubParam();
  readonly positionY = new StubParam();
  readonly positionZ = new StubParam();
}

class StubCompressor extends StubNode {
  readonly threshold = new StubParam();
  readonly knee = new StubParam();
  readonly ratio = new StubParam();
  readonly attack = new StubParam();
  readonly release = new StubParam();
}

class StubFilter extends StubNode {
  type = 'bandpass';
  readonly frequency = new StubParam();
  readonly Q = new StubParam();
}

class StubOscillator extends StubNode {
  type = 'sine';
  readonly frequency = new StubParam();
  started = false;
  stopped = false;
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

class StubBufferSource extends StubNode {
  buffer: unknown = null;
  loop = false;
  started = false;
  stopped = false;
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

class StubContext {
  readonly sampleRate = 8_000;
  /** Mutable, because the debounce and the pad are on the AUDIO clock. */
  currentTime = 0;
  readonly destination = new StubNode();
  created = 0;
  readonly panners: StubPanner[] = [];
  readonly oscillators: StubOscillator[] = [];
  readonly bufferSources: StubBufferSource[] = [];
  compressor: StubCompressor | null = null;

  createGain(): StubGain {
    this.created++;
    return new StubGain();
  }
  createPanner(): StubPanner {
    this.created++;
    const node = new StubPanner();
    this.panners.push(node);
    return node;
  }
  createDynamicsCompressor(): StubCompressor {
    this.created++;
    this.compressor = new StubCompressor();
    return this.compressor;
  }
  createBiquadFilter(): StubFilter {
    this.created++;
    return new StubFilter();
  }
  createOscillator(): StubOscillator {
    this.created++;
    const node = new StubOscillator();
    this.oscillators.push(node);
    return node;
  }
  createBufferSource(): StubBufferSource {
    this.created++;
    const node = new StubBufferSource();
    this.bufferSources.push(node);
    return node;
  }
  createBuffer(_channels: number, length: number): { getChannelData: () => Float32Array } {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

/** The stub is structurally what the engine uses, which is all it may use. */
function engineOnStub(): { engine: AudioEngine; context: StubContext } {
  const context = new StubContext();
  const engine = new AudioEngine(context as unknown as BaseAudioContext);
  engine.applySettings(DEFAULT_SETTINGS);
  return { engine, context };
}

function vehicle(
  id: number,
  distance: number,
  power: PowerCode = PowerCode.Diesel,
  extra: Partial<VehicleVoiceInput> = {},
): VehicleVoiceInput {
  return {
    id,
    power,
    panX: 0,
    panY: 0,
    throttle: 0.5,
    distance,
    state: VehicleState.Driving,
    crossingTile: -1,
    ...extra,
  };
}

function station(id: number, distance: number, zoneCounts: Partial<StationAmbienceInput> = {}) {
  return {
    id,
    residential: 0,
    commercial: 0,
    industrial: 0,
    hasQuay: false,
    hasRunway: false,
    panX: 0,
    panY: 0,
    distance,
    ...zoneCounts,
  };
}

// --------------------------------------------------------------------- tests

describe('the mixer', () => {
  it('carries the four channels of section 18 at their defaults', () => {
    const { engine } = engineOnStub();

    expect(engine.channelGain(VolumeChannel.Effects)).toBeCloseTo(0.6);
    expect(engine.channelGain(VolumeChannel.Ambience)).toBeCloseTo(0.4);
    // Music is silent because the game ships none - a slider at sixty percent
    // that produces nothing reads as a broken game rather than an empty folder.
    expect(engine.channelGain(VolumeChannel.Music)).toBe(0);
    expect(engine.channelGain(VolumeChannel.Interface)).toBeCloseTo(0.5);
  });

  it('follows a settings change', () => {
    const { engine } = engineOnStub();
    engine.applySettings({ ...DEFAULT_SETTINGS, volumes: [0.1, 0.2, 0.3, 0.4] });
    expect(engine.channelGain(VolumeChannel.Effects)).toBeCloseTo(0.1);
    expect(engine.channelGain(VolumeChannel.Music)).toBeCloseTo(0.3);
  });

  it('puts the master compressor between the sum and the speakers', () => {
    const { engine, context } = engineOnStub();
    const compressor = context.compressor;
    expect(compressor).not.toBeNull();

    // The compressor sees the SUM: it is downstream of the master gain and
    // the only thing connected to the destination. One per channel would duck
    // the effects against the ambience instead of catching the total.
    expect(compressor!.connected).toContain(context.destination);
    expect(engine.masterCompressor as unknown as StubCompressor).toBe(compressor);
    expect(compressor!.threshold.value).toBeLessThan(0);
    expect(compressor!.ratio.value).toBeGreaterThan(1);
    expect(compressor!.attack.value).toBeGreaterThan(0);
    expect(compressor!.release.value).toBeGreaterThan(compressor!.attack.value);
  });
});

describe('vehicle voices', () => {
  it('starts one per vehicle and stops it when the vehicle leaves', () => {
    const { engine } = engineOnStub();

    engine.setVehicles([vehicle(1, 0.1), vehicle(2, 0.2)]);
    expect(engine.voiceCount).toBe(2);

    engine.setVehicles([vehicle(1, 0.1)]);
    expect(engine.voiceCount).toBe(1);

    engine.setVehicles([]);
    expect(engine.voiceCount).toBe(0);
  });

  it('never runs more than the twelve of section 18', () => {
    const { engine } = engineOnStub();
    const many = Array.from({ length: 40 }, (_unused, index) => vehicle(index, index / 40));

    engine.setVehicles(many);
    expect(engine.voiceCount).toBe(MAX_VEHICLE_VOICES);
  });

  it('keeps the nearest, so what is under the cursor is what is heard', () => {
    const { engine, context } = engineOnStub();
    const far = Array.from({ length: MAX_VEHICLE_VOICES }, (_unused, index) =>
      vehicle(100 + index, 0.9),
    );
    engine.setVehicles(far);
    const afterFar = context.created;

    // One vehicle right under the camera arrives; a far one has to give way.
    engine.setVehicles([...far, vehicle(7, 0.01)]);
    expect(engine.voiceCount).toBe(MAX_VEHICLE_VOICES);
    // A voice was built for the newcomer rather than the list simply truncated.
    expect(context.created).toBeGreaterThan(afterFar);
  });

  it('reuses the voice a vehicle already has instead of rebuilding it', () => {
    const { engine, context } = engineOnStub();
    engine.setVehicles([vehicle(1, 0.1)]);
    const afterFirst = context.created;

    for (let frame = 0; frame < 20; frame++) engine.setVehicles([vehicle(1, 0.1)]);
    // Twenty frames and not one new node: a locomotive whose note restarted
    // every frame would be a machine gun, not an engine.
    expect(context.created).toBe(afterFirst);
  });
});

describe('the departure signal, per traction class', () => {
  it('gives every one of the five its own sound', () => {
    const powers = [
      PowerCode.Steam,
      PowerCode.Diesel,
      PowerCode.Electric,
      PowerCode.Hydrogen,
      PowerCode.Battery,
    ];
    const fundamentals = new Set<number>();
    for (const power of powers) {
      const signal = DEPARTURE_SIGNALS[power];
      expect(signal.partials.length).toBeGreaterThan(0);
      // Every one is a real envelope: something to open, something to hold,
      // something to fall.
      expect(signal.attackSeconds).toBeGreaterThan(0);
      expect(signal.releaseSeconds).toBeGreaterThan(0);
      expect(signal.peak).toBeGreaterThan(0);
      fundamentals.add(signal.partials[0]!);
    }
    // The acceptance clause of SPEC2 M25: five classes, five fanfares. A
    // copied row would collapse this set.
    expect(fundamentals.size).toBe(powers.length);
  });

  it('builds the steam whistle exactly as SPEC.md 18 describes it', () => {
    const { engine, context } = engineOnStub();
    const signal = DEPARTURE_SIGNALS[PowerCode.Steam];
    // Sawtooth AND noise, which is what the sentence names.
    expect(signal.noiseShare).toBeGreaterThan(0);

    engine.playDeparture(PowerCode.Steam, 0, 0);

    const sawtooths = context.oscillators.filter((node) => node.type === 'sawtooth');
    expect(sawtooths.map((node) => node.frequency.value).sort((a, b) => a - b)).toEqual(
      [...signal.partials].sort((a, b) => a - b),
    );
    // The noise layer is a looping-free buffer source through a band, and the
    // envelope is a gain that was ramped rather than assigned.
    expect(context.bufferSources.length).toBe(1);
    expect(context.panners.length).toBe(1);
  });

  it('leaves the noise out where the instrument has none', () => {
    const { engine, context } = engineOnStub();
    expect(DEPARTURE_SIGNALS[PowerCode.Battery].noiseShare).toBe(0);
    engine.playDeparture(PowerCode.Battery, 0, 0);
    expect(context.bufferSources.length).toBe(0);
    expect(context.oscillators.length).toBe(DEPARTURE_SIGNALS[PowerCode.Battery].partials.length);
  });

  it('reads a departure out of two consecutive reports', () => {
    const { engine, context } = engineOnStub();
    engine.setVehicles([vehicle(1, 0.1, PowerCode.Steam, { state: VehicleState.Loading })]);
    const beforePanners = context.panners.length;

    engine.setVehicles([vehicle(1, 0.1, PowerCode.Steam, { state: VehicleState.Driving })]);
    // One whistle: exactly one new panner, because a voice that already exists
    // builds no node and a fanfare builds exactly one.
    expect(context.panners.length - beforePanners).toBe(1);
  });

  it('says nothing when a train merely restarts at a signal', () => {
    const { engine, context } = engineOnStub();
    // WaitingForPath is held at a red, which happens several times a journey.
    engine.setVehicles([vehicle(1, 0.1, PowerCode.Steam, { state: VehicleState.WaitingForPath })]);
    const beforePanners = context.panners.length;
    engine.setVehicles([vehicle(1, 0.1, PowerCode.Steam, { state: VehicleState.Driving })]);
    expect(context.panners.length).toBe(beforePanners);
  });

  it('pins the states it reads against the simulation’s own enum', () => {
    // The literals in `soundscape.ts` exist so the audio module does not drag
    // the vehicle store into the entry chunk (D-191); this is what keeps them
    // honest, exactly as `interpolation.spec.ts` does for its own copies.
    expect(AUDIO_STATE_DRIVING).toBe(VehicleState.Driving);
    expect([...DEPARTURE_FROM_STATES].sort((a, b) => a - b)).toEqual(
      [
        VehicleState.Stopped,
        VehicleState.Loading,
        VehicleState.WaitingForCargo,
        VehicleState.InDepot,
        VehicleState.WaitingForSlot,
      ].sort((a, b) => a - b),
    );
    expect(DEPARTURE_FROM_STATES).not.toContain(VehicleState.WaitingForPath);
    expect(isDeparture(VehicleState.Loading, VehicleState.Driving)).toBe(true);
    expect(isDeparture(VehicleState.Driving, VehicleState.Loading)).toBe(false);
  });
});

describe('the whistle debounce', () => {
  it('turns ten simultaneous departures into ONE whistle', () => {
    const { engine, context } = engineOnStub();
    const loading = Array.from({ length: 10 }, (_unused, index) =>
      vehicle(index, index / 100, PowerCode.Steam, { state: VehicleState.Loading }),
    );
    engine.setVehicles(loading);
    const beforePanners = context.panners.length;

    // A takt slot releasing ten trains at once is not an unlikely case in
    // this game, it is what a working timetable looks like (D-149).
    engine.setVehicles(loading.map((input) => ({ ...input, state: VehicleState.Driving })));
    expect(context.panners.length - beforePanners).toBe(1);
  });

  it('lets the next window through, and holds the same vehicle back', () => {
    const { engine, context } = engineOnStub();
    engine.setVehicles([
      vehicle(1, 0.1, PowerCode.Steam, { state: VehicleState.Loading }),
      vehicle(2, 0.2, PowerCode.Steam, { state: VehicleState.Loading }),
    ]);
    engine.setVehicles([
      vehicle(1, 0.1, PowerCode.Steam, { state: VehicleState.Driving }),
      vehicle(2, 0.2, PowerCode.Steam, { state: VehicleState.Loading }),
    ]);
    const afterFirst = context.panners.length;

    // Inside the window: nothing, whoever departs.
    context.currentTime += WHISTLE_WINDOW_SECONDS / 2;
    engine.setVehicles([
      vehicle(1, 0.1, PowerCode.Steam, { state: VehicleState.Driving }),
      vehicle(2, 0.2, PowerCode.Steam, { state: VehicleState.Driving }),
    ]);
    expect(context.panners.length).toBe(afterFirst);

    // Past the window a DIFFERENT vehicle is heard.
    context.currentTime += WHISTLE_WINDOW_SECONDS * 2;
    engine.setVehicles([
      vehicle(1, 0.1, PowerCode.Steam, { state: VehicleState.Loading }),
      vehicle(2, 0.2, PowerCode.Steam, { state: VehicleState.Loading }),
    ]);
    engine.setVehicles([
      vehicle(1, 0.1, PowerCode.Steam, { state: VehicleState.Loading }),
      vehicle(2, 0.2, PowerCode.Steam, { state: VehicleState.Driving }),
    ]);
    expect(context.panners.length).toBe(afterFirst + 1);

    // But the SAME vehicle inside its own cooldown is still silent, even
    // though the window has long since passed.
    const afterSecond = context.panners.length;
    context.currentTime += WHISTLE_WINDOW_SECONDS * 2;
    expect(context.currentTime).toBeLessThan(WHISTLE_VEHICLE_COOLDOWN_SECONDS);
    engine.setVehicles([vehicle(2, 0.2, PowerCode.Steam, { state: VehicleState.Loading })]);
    engine.setVehicles([vehicle(2, 0.2, PowerCode.Steam, { state: VehicleState.Driving })]);
    expect(context.panners.length).toBe(afterSecond);
  });

  it('forgets the oldest key rather than growing for a session', () => {
    const gate = new EventGate(0, 1_000_000);
    for (let key = 0; key < GATE_MAX_KEYS + 50; key++) {
      expect(gate.admit(key, key)).toBe(true);
    }
    expect(gate.rememberedKeys).toBeLessThanOrEqual(GATE_MAX_KEYS);
  });
});

describe('the crossing bell', () => {
  it('rings on the approach and not again on the same crossing', () => {
    const { engine, context } = engineOnStub();
    engine.setVehicles([vehicle(1, 0.1, PowerCode.Steam, { crossingTile: -1 })]);
    const before = context.panners.length;

    engine.setVehicles([vehicle(1, 0.1, PowerCode.Steam, { crossingTile: 4_242 })]);
    expect(context.panners.length - before).toBe(1);

    // The same crossing inside its cooldown: silence, however many trains.
    context.currentTime += BELL_TILE_COOLDOWN_SECONDS / 2;
    engine.setVehicles([vehicle(1, 0.1, PowerCode.Steam, { crossingTile: 4_242 })]);
    expect(context.panners.length - before).toBe(1);

    // A different crossing is a different event.
    context.currentTime += BELL_TILE_COOLDOWN_SECONDS;
    engine.setVehicles([vehicle(1, 0.1, PowerCode.Steam, { crossingTile: 9_001 })]);
    expect(context.panners.length - before).toBe(2);
  });

  it('is two strikes rather than a continuous ring', () => {
    // A crossing shuts on a claim the trains already hold (D-185), so the bell
    // announces an arrival; it is not a state the ear has to live with.
    expect(CROSSING_BELL.repeatAfterSeconds).toBeGreaterThan(0);
    expect(CROSSING_BELL.partials.length).toBeGreaterThan(1);
  });
});

describe('the panner and its distance model', () => {
  it('is a distance model on every sounding node, not a balance knob', () => {
    const { engine, context } = engineOnStub();
    engine.setVehicles([vehicle(1, 0.1)]);
    engine.playDeparture(PowerCode.Steam, 0, 0);

    expect(context.panners.length).toBe(2);
    for (const panner of context.panners) {
      expect(panner.distanceModel).toBe('inverse');
      expect(panner.refDistance).toBe(PANNER_REF_DISTANCE);
      expect(panner.maxDistance).toBe(PANNER_MAX_DISTANCE);
      expect(panner.rolloffFactor).toBeGreaterThan(0);
      // The screen plane sits IN FRONT of the listener; behind it is the one
      // arrangement nobody can hear their way out of.
      expect(panner.positionZ.value).toBeLessThan(0);
    }
  });

  it('places a vehicle where it is drawn, and clamps at the map edges', () => {
    const { engine, context } = engineOnStub();
    engine.setVehicles([vehicle(1, 0.1, PowerCode.Diesel, { panX: -1, panY: 1 })]);
    const panner = context.panners[0]!;
    expect(panner.positionX.value).toBeCloseTo(-PANNER_SCREEN_HALF_UNITS);
    expect(panner.positionY.value).toBeCloseTo(PANNER_SCREEN_HALF_UNITS);

    // The sprite pool draws a margin, so an input past the edge is legitimate
    // and must not send the sound off to infinity.
    engine.setVehicles([vehicle(1, 0.1, PowerCode.Diesel, { panX: -9, panY: 12 })]);
    expect(panner.positionX.value).toBeCloseTo(-PANNER_SCREEN_HALF_UNITS);
    expect(panner.positionY.value).toBeCloseTo(PANNER_SCREEN_HALF_UNITS);
  });

  it('falls off with distance and never falls to nothing', () => {
    const centre = pannerGainAt(pannerPlacementFor(0, 0));
    const edge = pannerGainAt(pannerPlacementFor(1, 0));
    const corner = pannerGainAt(pannerPlacementFor(1, 1));
    const beyond = pannerGainAt(pannerPlacementFor(50, 50));

    // At the reference distance the model is the identity: the centre of the
    // screen is the one point every falloff in the game is measured from.
    expect(centre).toBeCloseTo(1);
    expect(edge).toBeLessThan(centre);
    expect(corner).toBeLessThan(edge);
    expect(corner).toBeGreaterThan(0);
    // Clamped, so a vehicle just off screen does not vanish before it returns.
    expect(beyond).toBeCloseTo(corner);
    for (const gain of [centre, edge, corner, beyond]) expect(Number.isFinite(gain)).toBe(true);
  });
});

describe('station ambience', () => {
  it('decides the zone from the census, with the quay and the runway on top', () => {
    expect(ambienceZoneOf(0, 0, 0, false, false)).toBe(AmbienceZone.Rural);
    expect(ambienceZoneOf(9, 2, 1, false, false)).toBe(AmbienceZone.Residential);
    expect(ambienceZoneOf(2, 9, 1, false, false)).toBe(AmbienceZone.Commercial);
    expect(ambienceZoneOf(2, 3, 9, false, false)).toBe(AmbienceZone.Industrial);
    // A container terminal in an industrial estate is a harbour to the ear,
    // and an airfield is the loudest thing for a mile whatever is beside it.
    expect(ambienceZoneOf(0, 0, 40, true, false)).toBe(AmbienceZone.Harbour);
    expect(ambienceZoneOf(0, 0, 40, true, true)).toBe(AmbienceZone.Airfield);
  });

  it('gives all six zones a bed of their own', () => {
    const filters = new Set<number>();
    for (let zone = 0; zone < AMBIENCE_ZONE_COUNT; zone++) {
      const bed = ambienceBedFor(zone as AmbienceZone, MapClimate.Temperate, 0);
      expect(bed.gain).toBeGreaterThan(0);
      filters.add(bed.filterHz);
    }
    expect(filters.size).toBe(AMBIENCE_ZONE_COUNT);
  });

  it('leaves the temperate climate an exact identity', () => {
    // The convention every new axis in this project follows (D-246, D-248,
    // D-201): the world the reference measurements were taken in comes out of
    // the new arithmetic unchanged.
    for (let zone = 0; zone < AMBIENCE_ZONE_COUNT; zone++) {
      const base = ambienceBedFor(zone as AmbienceZone, MapClimate.Temperate, 0);
      const raw = ambienceBedFor(zone as AmbienceZone, MapClimate.Temperate, 0);
      expect(base.gain).toBe(raw.gain);
      const arctic = ambienceBedFor(zone as AmbienceZone, MapClimate.Arctic, 0);
      expect(arctic.filterHz).not.toBe(base.filterHz);
    }
  });

  it('reads the M13 day phase: the same station is quieter at night', () => {
    const { engine } = engineOnStub();
    engine.setWorldMood(MapClimate.Temperate, 0);
    engine.setStations([station(1, 0.2, { residential: 20 })]);
    const byDay = engine.bedGain(1);

    engine.setWorldMood(MapClimate.Temperate, 1);
    engine.setStations([station(1, 0.2, { residential: 20 })]);
    const byNight = engine.bedGain(1);

    expect(byDay).toBeGreaterThan(0);
    // A works runs its shift at three in the morning, so the night is a fall
    // and never a switch.
    expect(byNight).toBeGreaterThan(0);
    expect(byNight).toBeCloseTo(byDay * (1 - AMBIENCE_NIGHT_QUIET_SHARE));
    expect(engine.bedZone(1)).toBe(AmbienceZone.Residential);
  });

  it('runs at most a handful of beds and keeps the nearest', () => {
    const { engine } = engineOnStub();
    const many = Array.from({ length: 12 }, (_unused, index) =>
      station(index, index / 20, { industrial: 5 }),
    );
    engine.setStations(many);
    expect(engine.bedCount).toBe(MAX_AMBIENCE_VOICES);
    expect(engine.bedZone(0)).toBe(AmbienceZone.Industrial);
    expect(engine.bedZone(11)).toBe(-1);
  });

  it('retunes a bed instead of restarting it', () => {
    const { engine, context } = engineOnStub();
    engine.setStations([station(1, 0.2, { commercial: 8 })]);
    const afterFirst = context.created;
    for (let refresh = 0; refresh < 10; refresh++) {
      engine.setStations([station(1, 0.2, { commercial: 8 })]);
    }
    // Restarting a looping noise source is an audible click.
    expect(context.created).toBe(afterFirst);
  });
});

describe('the generative pad, timeboxed', () => {
  it('builds nothing while the music slider is where SPEC.md 18 ships it', () => {
    const { engine, context } = engineOnStub();
    expect(engine.channelGain(VolumeChannel.Music)).toBe(0);
    const before = context.created;
    engine.updateMusic();
    expect(context.created).toBe(before);
    expect(engine.padVoiceCount).toBe(0);
  });

  it('runs a chord cycle on the audio clock when the slider is up', () => {
    const { engine, context } = engineOnStub();
    engine.applySettings({ ...DEFAULT_SETTINGS, volumes: [0.6, 0.4, 0.5, 0.5] });

    engine.updateMusic();
    expect(engine.padVoiceCount).toBe(MUSIC_CHORDS[0]!.length);
    const afterStart = context.created;

    // Inside a chord: nothing new, and no note re-triggered.
    context.currentTime += MUSIC_CHORD_SECONDS / 2;
    engine.updateMusic();
    expect(context.created).toBe(afterStart);

    // Past it: the same voices are re-voiced onto the next chord.
    context.currentTime += MUSIC_CHORD_SECONDS;
    engine.updateMusic();
    expect(context.created).toBe(afterStart);
    expect(engine.padVoiceCount).toBe(MUSIC_CHORDS[0]!.length);
  });
});

describe('switching it off', () => {
  it('silences the master and stops every voice', () => {
    const { engine } = engineOnStub();
    engine.setVehicles([vehicle(1, 0.1), vehicle(2, 0.2)]);
    engine.setStations([station(1, 0.2, { residential: 4 })]);

    engine.applySettings({ ...DEFAULT_SETTINGS, audioEnabled: false });
    expect(engine.voiceCount).toBe(0);
    expect(engine.bedCount).toBe(0);
    expect(engine.padVoiceCount).toBe(0);

    // And nothing starts again while it is off.
    engine.setVehicles([vehicle(3, 0.1)]);
    engine.setStations([station(2, 0.1, { residential: 4 })]);
    expect(engine.voiceCount).toBe(0);
    expect(engine.bedCount).toBe(0);
  });

  it('makes a one-shot a no-op rather than an error', () => {
    const { engine, context } = engineOnStub();
    engine.applySettings({ ...DEFAULT_SETTINGS, audioEnabled: false });
    const before = context.created;

    engine.play(Cue.Build);
    engine.play(Cue.Money);
    engine.playDeparture(PowerCode.Steam, 0, 0);
    engine.playCrossingBell(0, 0);
    expect(context.created).toBe(before);
  });
});

describe('one-shots', () => {
  it('builds a throwaway graph per cue', () => {
    const { engine, context } = engineOnStub();
    const before = context.created;

    engine.play(Cue.Build);
    expect(context.created).toBeGreaterThan(before);

    // The till is two notes, so it costs more nodes than a single click.
    const beforeMoney = context.created;
    engine.play(Cue.Money);
    expect(context.created - beforeMoney).toBeGreaterThan(2);
  });
});
