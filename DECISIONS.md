# Decision log

Every decision that was not spelled out in the specification, with the reason it
was made that way. Newest milestone last.

---

## M0 - foundation (2026-07-27)

### D-001 The trigonometric table is computed, not measured and not checked in

The specification demands a 4096 entry Int32 sine table and forbids `Math.sin`
in the simulation. Building that table _with_ `Math.sin` would reintroduce the
exact engine dependency the rule exists to prevent. It is therefore evaluated at
module load from a Taylor series that uses only `+ - * /`, folded onto
`[0, PI/4]` where the series converges to roughly 2e-14 - nine orders of
magnitude below the Q16.16 quantisation step. Checking in a generated table was
rejected because a data file cannot be reviewed.

### D-002 FNV-1a 64 on two 32 bit halves instead of BigInt

The determinism hash will eventually run over megabytes of tile and vehicle
arrays. BigInt is exact but roughly two orders of magnitude too slow for that,
so the 64 bit multiply is done by hand on hi/lo words. `tests/unit/hash.spec.ts`
cross-checks it against an independent BigInt implementation _and_ the canonical
FNV test vectors, so the optimisation is not taken on trust.

### D-003 `SimWorker.ts` is exempt from the determinism global ban

The scheduler needs `performance.now()` and worker globals; the simulation core
must not have them. Rather than weakening the rule for all of `src/sim`, ESLint
exempts exactly this one file, which holds no simulation state - it only decides
_when_ `World.step()` runs. `tests/unit/lint-rules.spec.ts` asserts both halves
of that arrangement.

### D-004 Speed is control traffic, not a command

If the speed setting travelled as a command it would end up in the replay log
and a session recorded at 20x would not reproduce at 1x. Speed therefore changes
only how often the scheduler calls `step()`. The determinism suite contains an
explicit test that batching 20 ticks per wake-up yields the same state as one
tick per wake-up.

### D-005 Commands still execute while the game is paused

`World.drainCommands()` runs the commands stamped for the current tick without
advancing time, and the scheduler calls it in the paused branch. Renaming the
company or taking a loan while paused is expected behaviour, and it stays
replay-exact because the command is logged with the same tick either way.

### D-006 Snapshot carries numbers only; rare changes go by postMessage

The `SharedArrayBuffer` slot holds a fixed set of Int32/Float64 fields. Strings
(company name) and one-off events (command rejected, fatal error) travel by
`postMessage`, because packing variable length data into the buffer would make
the layout version churn for no gain. Money sits in a Float64 because cent
amounts exceed Int32 and doubles hold integers below 2^53 exactly.

### D-007 The save format was implemented in M0, not later

Failure #11 of the specification is "save without versioning". Beyond that,
section 19.3 requires the determinism suite to include a save/load/continue run
from M0 onwards, which is impossible without serialisation. `SAVE_VERSION` is 1,
the migration registry is empty (correctly - there is no older format), and the
migration runner is tested with an injected registry so the mechanism is proven
before it is first needed.

### D-008 M0 gameplay scope: company identity and loans

The determinism suite needs real state and real commands to be worth anything.
Company name, company colour and the credit line from section 14.2 are the
smallest slice that is genuinely complete (limit formula, step rounding, monthly
interest, annual profit rollover) and that survives unchanged into later
milestones. `fixedAssetsCt` and `lastYearProfitCt` are legitimately 0 for a
company that owns nothing and has earned nothing; they are inputs to the fully
implemented formula, not placeholders.

### D-009 The RNG stream is not consumed yet

Nothing in M0 legitimately needs random numbers - map generation arrives in M1.
The generator is seeded, hashed as part of the world state, and covered by unit
tests including frozen golden digests, so a change to the algorithm cannot slip
through unnoticed.

### D-010 The determinism suite compares runs, not frozen hashes

Every milestone deliberately changes the simulation state, so a checked-in
golden world hash would have to be updated constantly and would stop being a
signal. The suite asserts equality across three in-process runs, across a
save/load boundary, across tick batching and against a replayed command log.
Frozen golden values are used where the value genuinely must never change: the
RNG stream and the FNV test vectors.

### D-011 The HUD read loop uses a timer, not requestAnimationFrame

rAF stops when the window is occluded or minimised, which froze the status bar
while the simulation kept running - reproduced during M0 verification. The HUD
is text and refreshes at ~15 Hz from `setInterval`. The map renderer added in M1
will use rAF, where "no frame" correctly means "nothing to draw".

### D-012 One tsconfig with node and vite types

Project references would keep node globals out of `src/`, at the cost of a
composite build and two config files. Since ESLint already forbids host globals
where it matters (the simulation core), the simpler single config was chosen.

### D-013 Company colour slot 0 is grey, not black

The Okabe-Ito palette is used because it stays distinguishable under all common
forms of colour vision deficiency. Its first entry is black, which disappears
against the dark map background, so slot 0 is a light neutral grey instead.

### D-014 Icons are generated, not drawn

`tools/make-icons.mjs` rasterises the icon from a vector description into PNG
and ICO, with its own PNG encoder and DIB writer. Same reasoning as the sprite
bake step in section 16.2: no binary art enters the repository and the result is
reproducible from code.

### D-015 React components return `ReactElement`, not `JSX.Element`

The global `JSX` namespace exists in the React 18 types but was removed in 19.
Returning `ReactElement` keeps the components compiling if the React version is
ever raised.

### D-016 `noUncheckedIndexedAccess` is paid for with `!` on typed array reads

The specification mandates the flag. It makes every `Int32Array` read
`number | undefined`, which is noise in hot loops; a non-null assertion where the
index is provably in range is the accepted cost. `any` and `@ts-ignore` remain
forbidden and are enforced by ESLint.

### D-017 Cross-origin isolation is configured in both environments, verified in one

`vite.config.ts` sets COOP/COEP for dev and preview; `tauri.conf.json` sets the
same pair under `app.security.headers`. The browser side is verified - the app
reports "SharedArrayBuffer available (cross-origin isolated)". The Tauri side
could **not** be verified because Rust and the MSVC build tools are not
installed on this machine; it is the first thing to check once they are.
