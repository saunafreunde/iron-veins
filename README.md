# Iron Veins

A transport tycoon for the desktop. Build railways, roads, shipping and air
routes across a generated world from 1950 to 2050, feed the industries, grow
the towns, and stay solvent while up to five competitors do the same.

Offline, single player, no accounts and no network. The simulation is
deterministic: the same seed and the same commands always produce the same
world.

---

## Playing

| | |
| --- | --- |
| **Start** | The game generates a world and starts paused. Press `1` to run the clock. |
| **First line** | Press `S`, drag a road between two towns, put a stop at each end, add a depot and buy a bus. It pays for itself in two to four game years. |
| **Menu** | `Esc` — new game, save and load, options, tutorial, handbook. The game keeps running behind it. |
| **Help** | `F1` opens the searchable handbook. Five tutorial lessons live in the menu. |

### Keyboard

| Key | Does |
| --- | --- |
| `Space` | Pause / resume |
| `1` `2` `3` `4` | Speed 1× / 2× / 5× / 20× |
| `R` `S` `W` `F` | Build rail / road / quay / airport |
| `G` | Signal · `B` platform · `D` depot · `X` demolish |
| `M` | Route assistant on and off |
| `V` `L` `T` `I` | Lists: vehicles, stations, towns, industries |
| `F1` | Handbook · `F3` block overlay · `F5` quick save · `F9` quick load |
| `Esc` | Menu, or cancel the current tool |
| Right drag | Pan · mouse wheel zooms · click the overview map to jump |

### Where things are kept

| | |
| --- | --- |
| Saves | `%APPDATA%/IronVeins/saves/*.ironsave` |
| Settings | `%APPDATA%/IronVeins/settings.json` |
| Your own music | `assets/music/` — the game ships none and looks for nothing |

Autosave writes one of five slots every six game months and never touches a
save you made yourself. In a browser build there is no application directory,
so settings go to `localStorage` and saves are exported as downloads.

---

## System requirements

- Windows 10 or 11, 64-bit. The installer fetches the WebView2 runtime if it is
  not already present.
- Four cores and 8 GB of memory for a 1024 × 1024 map; the reference machine
  the performance budgets are set against is four cores, 16 GB and integrated
  graphics.
- No GPU beyond what a modern integrated one provides.

---

## Building from source

```bash
npm install
npm run dev          # http://localhost:5183
```

The dev server sets the COOP and COEP headers the game needs: without
cross-origin isolation there is no `SharedArrayBuffer`, and without that there
is no channel between the simulation worker and the renderer. The system panel
says which it got.

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint, including the architecture rules
npm test             # everything: unit, determinism, balance, performance
npm run test:soak    # the recorded 25-year AI game, replayed (~50 s)
npm run build        # typecheck + production bundle into dist/
```

### The desktop build

Needs the Rust toolchain and the MSVC build tools.

```bash
npm run tauri build
```

That produces both installers under `src-tauri/target/release/bundle/`:

- `msi/Iron Veins_<version>_x64_en-US.msi`
- `nsis/Iron Veins_<version>_x64-setup.exe`

Set the version in **one** place — `package.json` — and run:

```bash
npm run version:sync
```

which writes it through to `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`
so the three cannot drift apart.

Neither installer is code-signed. Windows will show a SmartScreen warning on a
machine that has not seen the binary before; signing needs a certificate this
project does not have.

---

## What the tests hold in place

`npm test` runs four suites, and each exists to stop a different kind of damage.
A fifth, `test:soak`, is deliberately outside it and has its own CI job.

| Suite | Guards |
| --- | --- |
| `test:determinism` | Same seed plus same commands ⇒ bit-identical state, across three runs and across a save/load. **This must never be red.** Determinism cannot be repaired afterwards. |
| `test:balance` | The economy. Reference scenarios with tolerance bands; when one leaves its band the CONSTANTS change, never the test. Since M16 every scenario also runs TWICE and asserts hash equality, so the balance suite doubles as a desync net; the two quarter-century AI scenarios are costly enough that their twin runs in CI's `soak` job rather than locally (`npm run test:balance:full` runs all of them). |
| `test:unit` | The formulas, the physics, the signalling, the migrations, and that both translation catalogues carry the same keys. |
| `test:perf` | Section 21's budgets that a headless run can hold: tick p99 with a full fleet on a 1024 map, save load time, map generation. |
| `test:soak` | A recorded twenty-five year AI game exported as a `.ironreplay` and re-simulated against the sixteen year-boundary hashes it committed to, plus a text fixture pinning them. About 50 s, so it lives in its own CI job rather than in `npm test`. |

### Measuring the two frame-rate budgets

Section 21 also asks for ≥ 60 fps at 4 000 visible sprites and ≥ 45 fps at zoom
0.25. Those need a real GPU and a compositor, so they are measured by hand:

1. `npm run dev`, start a 1024 map, and play until several hundred vehicles run.
2. Open the system panel; it shows the simulation rate in Hz.
3. Use the browser's own frame-rate meter (in Chromium: DevTools → Rendering →
   Frame Rendering Stats) at zoom 1.0 and again at zoom 0.25.

There is deliberately no browser test runner in the repository: adding one would
pull PixiJS into the simulation's own test runs, and the simulation must never
be able to reach the renderer.

---

## How it is put together

```
src/sim/       the simulation. Deterministic, 20 Hz, no DOM, no rendering.
src/render/    PixiJS. Reads the simulation's snapshot, never writes.
src/ui/        React panels, the zustand store and the worker client.
src/audio/     WebAudio synthesis. No audio files anywhere in the project.
src/shared/    what both sides need: snapshot layout, protocol, palette.
src/platform/  the only directory allowed to import @tauri-apps/*.
src/i18n/      t() plus de.json and en.json, kept in step by a test.
```

Three documents matter if you are going to change anything:

- **`SPEC.md`** — the specification, verbatim. It says what was wanted.
- **`DECISIONS.md`** — every departure from it, and why. A departure with no
  entry here is a defect, not a decision.
- **`CLAUDE.md`** — the ten architecture laws and the traps each milestone
  found. Read it before touching the simulation.

The short version of the laws: the simulation never sees the renderer; time
steps are fixed; determinism is mandatory; money is integer cents; every state
change goes through a command; nothing allocates in the tick loop.

---

## Licence

Not licensed for redistribution. All names of vehicles, companies and places in
the game are invented; no real manufacturer, operator or series is referenced.
