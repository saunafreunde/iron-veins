import { AudioEngine, Cue } from '../audio/AudioEngine';
import { CommandKind } from '../sim/commands/types';
import type { SimClient } from './SimClient';
import { useSimStore } from './store';

/**
 * Where the audio engine is plugged in.
 *
 * Two rules shape this file. The engine may not be built before the player has
 * clicked something - every browser refuses to start an AudioContext without a
 * gesture, and an engine built at boot is an engine that is silently dead for
 * the whole session. And the simulation may not know it exists, so everything
 * here hangs off signals the interface already receives.
 */

let engine: AudioEngine | null = null;
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
 * Returns the engine so the renderer can feed it, or null while audio is
 * switched off - which is also what makes "off" cost nothing at all rather
 * than being a muted graph that still runs.
 */
export function startAudio(client: SimClient): AudioEngine | null {
  if (engine !== null) return engine;
  const settings = useSimStore.getState().settings;
  if (!settings.audioEnabled) return null;
  if (typeof AudioContext === 'undefined') return null;

  engine = new AudioEngine(new AudioContext());
  engine.applySettings(settings);

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
  return engine;
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
