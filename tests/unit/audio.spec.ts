import { describe, expect, it } from 'vitest';
import { AudioEngine, Cue, MAX_VEHICLE_VOICES } from '../../src/audio/AudioEngine';
import { DEFAULT_SETTINGS, VolumeChannel } from '../../src/shared/settings';
import { PowerCode } from '../../src/sim/vehicles/spec';

/**
 * The audio engine of section 18, tested without a speaker.
 *
 * Nothing here can hear anything, so what is checked is the GRAPH: that a
 * voice is built per vehicle and torn down again, that no more than twelve
 * ever exist at once, that the mixer channels carry the settings, and that
 * switching audio off leaves nothing running. Those are the four things that
 * go wrong silently, and every one of them is a fact about the object graph
 * rather than about the sound.
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
  readonly connected: StubNode[] = [];
  disconnected = false;
  connect(target: StubNode): StubNode {
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
  readonly pan = new StubParam();
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
  readonly currentTime = 0;
  readonly destination = new StubNode();
  created = 0;

  createGain(): StubGain {
    this.created++;
    return new StubGain();
  }
  createStereoPanner(): StubPanner {
    this.created++;
    return new StubPanner();
  }
  createBiquadFilter(): StubFilter {
    this.created++;
    return new StubFilter();
  }
  createOscillator(): StubOscillator {
    this.created++;
    return new StubOscillator();
  }
  createBufferSource(): StubBufferSource {
    this.created++;
    return new StubBufferSource();
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

function vehicle(id: number, distance: number, power = PowerCode.Diesel) {
  return { id, power, panX: 0, throttle: 0.5, distance };
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

describe('switching it off', () => {
  it('silences the master and stops every voice', () => {
    const { engine } = engineOnStub();
    engine.setVehicles([vehicle(1, 0.1), vehicle(2, 0.2)]);

    engine.applySettings({ ...DEFAULT_SETTINGS, audioEnabled: false });
    expect(engine.voiceCount).toBe(0);

    // And nothing starts again while it is off.
    engine.setVehicles([vehicle(3, 0.1)]);
    expect(engine.voiceCount).toBe(0);
  });

  it('makes a one-shot a no-op rather than an error', () => {
    const { engine, context } = engineOnStub();
    engine.applySettings({ ...DEFAULT_SETTINGS, audioEnabled: false });
    const before = context.created;

    engine.play(Cue.Build);
    engine.play(Cue.Money);
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
