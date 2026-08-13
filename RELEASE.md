# Cutting a release

SPEC2 M25 asks that "a git tag produces installers, a web build and an
attribution file with no handwork". This is that mechanism, and the appendix at
the end is the commercial-readiness checklist the same milestone asks for.

## What a tag does

Push a tag that starts with `v` and `.github/workflows/release.yml` runs three
jobs:

| Job       | Runner           | Produces                                         |
| --------- | ---------------- | ------------------------------------------------ |
| `web`     | `ubuntu-latest`  | `dist/`, notices included, as one artefact       |
| `desktop` | `windows-latest` | the MSI and the NSIS installer, plus the notices |
| `publish` | `ubuntu-latest`  | a **draft** GitHub release with all of the above |

`workflow_dispatch` runs the same two build jobs without a tag, so the pipeline
can be exercised without cutting a version. `publish` is the only job guarded on
the tag, because a release without one has nothing to attach itself to.

The release is a **draft**. Publishing it is an owner decision and the appendix
below is why: a workflow can build an installer, but it must not decide that a
licence text, a product name and a privacy note are ready to be shipped under.

## Before you tag

1. `npm version <major|minor|patch>` — this moves `package.json`, and
   `npm run version:sync` (which `build:desktop` runs) writes the same number
   into `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. Three files
   carrying three different versions is how a bug report stops being useful.
2. Let `ci.yml` go green on the commit you are about to tag. The release
   workflow deliberately does not re-run the suite: CI already runs on every
   push, and a forty-minute duplicate here would only tempt somebody to skip
   one of the two.
3. `npm run test:soak` and `npm run test:balance:full` are part of that CI run
   (the `soak` job). A release off a commit whose soak job never ran is a
   release nobody has replayed a quarter century of.

## The attribution file

`npm run attribution` writes `public/THIRD-PARTY.txt` from the installed npm
runtime dependency tree — the `dependencies` closure, which is exactly the set
whose code ships inside the application. It is **generated, gitignored and
overwritten by every build**: a credits list that is typed by hand is right on
the day it is written and wrong at the next install.

The generator refuses to finish when a runtime dependency states no licence.
That refusal is the point of the artefact: shipping something the project has no
right to ship should be impossible by accident rather than caught in review.

Two things it does not cover, and it says so in its own header rather than
leaving the gap invisible:

- the **Rust crates** behind the Tauri shell — the Tauri bundler emits their
  notices with the installer;
- the **Kenney kits** (CC0 1.0). They are downloaded and baked at build time and
  are in no repository file at all (E-14, and `tests/unit/repoAssets.spec.ts`
  keeps it that way), so no dependency walk could see them. CC0 asks for
  nothing; they are credited because it is deserved.

## Code signing

The workflow signs when the certificate secret exists and warns clearly when it
does not — SPEC2 M25's "signiert, wenn das Zertifikat-Secret existiert; warnt
sonst", read literally.

| Secret                         | What it is                               |
| ------------------------------ | ---------------------------------------- |
| `WINDOWS_CERTIFICATE`          | the code-signing certificate, base64 PFX |
| `WINDOWS_CERTIFICATE_PASSWORD` | its password                             |

With neither set the installers are built **unsigned**, the job raises a GitHub
warning annotation saying so, and Windows SmartScreen will warn every user who
has not seen the binary before. That is a real cost and it is stated here rather
than discovered by the first player.

---

# Appendix — commercial readiness

**Everything in this appendix is an owner decision.** What is written beside
each item is a _proposed default_ and nothing more: the code cannot decide
whether a licence fits a business, and a workflow that published a release would
be deciding all of it by accident. None of these blocks development; all of them
block the moment money is asked for.

### 1. Licence and end-user agreement

- **Status:** the repository states no licence at all. That is the strictest
  possible position — all rights reserved by default — and it is the right one
  while nothing has shipped.
- **Proposed default:** a plain EULA naming Levando GmbH as the licensor, a
  personal non-transferable licence to use the software, no warranty, German law
  and the seat of the company as the venue. Ship it as `EULA.txt` beside the
  notices, show it in the NSIS installer (`bundle.windows.nsis.license`), and
  link it from the handbook.
- **What is already true and needs no decision:** every dependency the generated
  notices name is MIT, ISC or Apache-2.0 — permissive, no copyleft, no
  attribution obligation beyond the notices file that already ships. The Kenney
  kits are CC0. Nothing in the tree forces a licence choice.
- **Open question only the owner can answer:** whether the game is sold, given
  away, or offered as a demo with a paid full version — the three need three
  different agreements.

### 2. Name and trademark

- **Status:** unchecked. "Iron Veins" and "Eisenadern" are used in the
  application, the campaign and the bundle identifier
  (`de.levando.ironveins`).
- **Proposed default:** before the first paid release, a search of the EUIPO and
  DPMA registers for both names in Nice class 9 (software) and class 41
  (entertainment services), plus a plain web search for an existing game of
  either name. If both are clear, register the word mark in class 9 at the DPMA;
  if either is taken, the campaign name is the cheaper one to change (it appears
  in two briefings and one screen), the product name is not.
- **Related and separate:** "Transport Tycoon" is a registered mark. The game is
  a successor in genre, and nothing in it uses that name, its artwork or its
  data — but marketing copy that leans on the comparison is where that would
  stop being true. Describe the genre, never the trademark.
- **Also unchecked:** whether the domain and the store listing names are
  available, which is usually what forces the answer in practice.

### 3. Privacy note for crash bundles

- **Status of the mechanism, which is not a decision but a fact worth writing
  down:** the crash bundle of M16 is written **offline** and **only when the
  player asks** for it. Nothing in this application makes a network request —
  there is no backend, no telemetry, no analytics, no auto-update, and the web
  build's own service worker only adds two headers to responses it already
  fetched. A crash bundle is a file on the player's disk until the player
  chooses to send it.
- **What is in one**, read off `assembleBundle` in `src/ui/crashReporter.ts`
  rather than remembered: the application and save-format versions, the time it
  was written, the error and its stack, the world's seed, map size, tick and
  state hash, whether this is the desktop build, the last commands as text, the
  autosave itself and a `.ironreplay` of the session. So the personal content of
  a crash bundle is **the player's own save and the company name they typed into
  it**. Not in one: the operating-system version, the user agent, any file path
  outside the application's own data directory, the clipboard, any network
  identity, any account.
- **Proposed default text**, to sit in the handbook and beside the export
  button, in both languages: _"A crash report is written to disk on your
  machine and is never sent anywhere. It contains your last autosave, a replay
  of the session, and the error message. Send it only if you want to; delete the
  file to be rid of it."_
- **Open question only the owner can answer:** whether there is an address to
  send one to, and if so, what happens to it after it arrives — because that
  address, not the file, is where data protection law starts.

### 4. The two things that are simply not done yet

Named here because a checklist that only lists decisions hides the work:

- the installers are **unsigned** until the secrets above exist (see above);
- `npm run format:check` is red on 42 files (D-227, D-257) — none of it is a
  correctness problem, all of it is a formatter that has never been run, and it
  is its own session with its own diff.
