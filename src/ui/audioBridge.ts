import { Cue } from '../audio/cues';
import type { AudioEngine } from '../audio/AudioEngine';
import { CommandKind } from '../sim/commands/types';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * Where the audio engine is plugged in.
 *
 * Three rules shape this file. The engine may not be built before the player
 * has clicked something - every browser refuses to start an AudioContext
 * without a gesture, and an engine built at boot is an engine that is silently
 * dead for the whole session. The simulation may not know it exists, so
 * everything here hangs off signals the interface already receives. And the
 * engine is loaded through a DYNAMIC import (D-191/D-192): the synthesis and
 * the sound tables are several kilobytes that a player who never touches the
 * window never needs, and a static import would put them in the entry chunk
 * for the sake of the five cue numbers - which is why those live in the
 * import-free leaf `audio/cues.ts` instead.
 *
 * The price is stated: a command executed in the few milliseconds between the
 * first gesture and the chunk arriving makes no sound. That is the same
 * silence the player had before the gesture.
 */

let engine: AudioEngine | null = null;
let loading = false;
let unsubscribe: (() => void) | null = null;

/** Which command deserves which noise. Anything not listed makes none. */
function cueFor(kind: number): Cue | null {
  switch (kind) {
    case CommandKind.BuildRoad:
    case CommandKind.BuildTrack:
    case CommandKind.BuildRoadStop:
    case CommandKind.BuildRailStop:
    case CommandKind.BuildWaterStop:
    case CommandKind.BuildAirport:
    case CommandKind.BuildStationModule:
    case CommandKind.BuildSignal:
    case CommandKind.RaiseLand:
    case CommandKind.LowerLand:
    case CommandKind.LevelLand:
      return Cue.Build;

    case CommandKind.DemolishRoad:
    case CommandKind.DemolishTrack:
    case CommandKind.DemolishSignal:
    case CommandKind.DemolishBuilding:
      return Cue.Demolish;

    case CommandKind.BuyRoadVehicle:
    case CommandKind.BuyTrain:
    case CommandKind.BuyShip:
    case CommandKind.BuyAircraft:
    case CommandKind.TakeLoan:
    case CommandKind.RepayLoan:
    case CommandKind.SellVehicle:
      return Cue.Money;

    default:
      return null;
  }
}

/**
 * Start the engine, once, on the first gesture the window sees.
 *
 * Nothing is returned: the engine arrives with its own chunk a moment later,
 * and `audioEngine()` answers null until it does - which is also what makes
 * "off" cost nothing at all rather than being a muted graph that still runs.
 */
export function startAudio(client: SimClient): void {
  if (engine !== null || loading) return;
  const settings = useSimStore.getState().settings;
  if (!settings.audioEnabled) return;
  if (typeof AudioContext === 'undefined') return;

  loading = true;
  void import('../audio/AudioEngine').then((module) => {
    loading = false;
    // Switched off, or torn down, while the chunk was in flight.
    if (!useSimStore.getState().settings.audioEnabled) return;
    const started = new module.AudioEngine(new AudioContext());
    started.applySettings(useSimStore.getState().settings);
    engine = started;

    // Every later settings change reaches the mixer through the store, so a
    // slider is a slider and not a slider plus a wiring change somewhere else.
    unsubscribe = useSimStore.subscribe((state) => {
      engine?.applySettings(state.settings);
    });

    const previous = client.onCommandExecuted;
    client.onCommandExecuted = (kind, accepted) => {
      previous?.(kind, accepted);
      const cue = accepted ? cueFor(kind) : Cue.Warning;
      if (cue !== null) engine?.play(cue);
    };
  });
}

/** The running engine, or null. */
export function audioEngine(): AudioEngine | null {
  return engine;
}

/** Tear it down; used when the whole application goes away. */
export function stopAudio(): void {
  engine?.stopAll();
  unsubscribe?.();
  unsubscribe = null;
  engine = null;
}
