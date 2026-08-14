# The web build, and putting it on Vercel

The game runs in a browser: same code, same worker, same simulation. What a
browser changes is where things are kept (settings in `localStorage`, saves and
recordings in the Origin Private File System) and one hard requirement —
**`SharedArrayBuffer`**, which a browser hands out only to a **cross-origin
isolated** document. There is deliberately no single-threaded fallback (law
#10), so a host that cannot send two headers is a host the game refuses to
start on.

This file is the whole procedure. It is short on purpose.

---

## 1. Import the project

The owner does this once, in the Vercel dashboard. Nothing here needs the CLI,
and nothing should be deployed with `vercel deploy` — every deployment comes
from a push to GitHub.

1. **Add New… → Project → Import** `saunafreunde/iron-veins`.
2. **Framework Preset:** _Other_. `vercel.json` in the repository root already
   states the install command, the build command and the output directory, and
   they win over anything the preset would guess.
3. **Node.js Version** (Settings → General): **22.x or newer**. The build imports
   one TypeScript module directly (`tools/attribution-lib.ts`), which needs
   Node's own type stripping; `npm run attribution` passes
   `--experimental-strip-types` so that Node 22.6 upwards is enough. If a build
   ever fails with `Unknown file extension ".ts"`, this setting is why.
4. **Environment variables:** none are required. There is exactly one optional
   variable and section 3 is about it. Set variables in the dashboard, never in
   `vercel.json`.
5. **Deploy.** Then do section 4 (protection) **before** giving the URL to
   anybody, and section 5 (the four checks).

Everything the build does:

```
npm ci
node tools/web-deploy.mjs prepare   # baked Kenney art, if there is any
npm run build:web                   # third-party notices + tsc --noEmit + vite build
node tools/web-deploy.mjs finish    # drop the source maps, check what shipped
```

## 2. The two headers, and why the service worker still ships

`vercel.json` sends them on every path:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

That is the real ticket, and with it the first load of the page is already
isolated. `public/coi-serviceworker.js` is the fallback for hosts that cannot
set headers (E-13): it registers itself, reloads the page once, and adds the
same two headers to everything afterwards.

**The two do not fight and the shim needs no switch.** `main.tsx` asks
`ensureCrossOriginIsolation` first, and its very first branch is "already
isolated → do nothing and clear the reload flag". On Vercel that branch is
always the one taken, so the worker is never registered and the extra reload
never happens. It stays in the build as insurance — if the headers were ever
lost, or if somebody serves this `dist/` from a file share, the game still
starts — and because it sets the identical pair, a browser that registered it
under an older deployment keeps working. `tests/unit/vercelConfig.spec.ts`
holds all three copies of that pair against each other.

## 3. The Kenney art is a build artefact, not a commit

`public/assets-baked/` (6.52 MB of baked atlases) and `assets-cache/` (46.2 MB
of downloaded Kenney zips, 178 MB once unpacked) are gitignored on purpose —
E-14 / D-140, and `tests/unit/repoAssets.spec.ts` fails the build if a binary ever
reaches the index. **A Vercel build from a clean clone therefore has no Kenney
art and the game draws itself procedurally.** That is a supported state, not a
defect: it is what every developer without a filled cache sees, and the build
never fails over it.

If you want the art in the deployment, publish the bake once and point the
build at it (D-262):

```bash
npm run assets:fetch && npm run assets:bake      # ~36 s with the packs cached
cd public/assets-baked && zip -r ../../assets-baked.zip . && cd ../..
shasum -a 256 assets-baked.zip                   # optional, for the pin below
```

Attach `assets-baked.zip` to a GitHub release (a tag like
`assets-2026-08-14` does), then in Vercel → Settings → Environment Variables:

| Variable                  | Value                                               |
| ------------------------- | --------------------------------------------------- |
| `IRON_VEINS_ATLAS_URL`    | the release asset's download URL                    |
| `IRON_VEINS_ATLAS_SHA256` | optional; the archive's SHA-256, checked before use |

Re-publish the archive whenever `tools/assets-manifest.json` or the baker
changes. A stale bake is refused by `src/render/bakedAtlas.ts` on its manifest
version and costs the art, never the game.

## 4. Protection — do this before you share the link

A `*.vercel.app` URL is public to anybody who has it, and this repository
states **no licence** ("not licensed for redistribution", README). Deployment
Protection is a dashboard setting; nothing in the repository can switch it on.

1. Project → **Settings** → **Deployment Protection**.
2. **Vercel Authentication** — on by default for Preview deployments; set it to
   **All Deployments** if only people in your Vercel account should reach the
   game. This is the strictest and costs nothing.
3. Or **Password Protection** → **All Deployments**, type a password, **Save**.
   That is the one to use for a link you want to hand to a person who has no
   Vercel account. It is a paid feature on Pro; Vercel Authentication is not.
4. **Save**, then open the deployment URL in a private window and confirm you
   are asked for the password (or to log in) before the game appears.

Two related notes. `tools/web-deploy.mjs finish` deletes the source maps from
`dist/` before it is published — they inline the complete TypeScript source,
and a public URL would publish the project with the game; the desktop build and
`npm run build` keep theirs. And **the licence question itself is not decided
here**: RELEASE.md's appendix §1 is the open owner decision, and putting a
playable build behind a link is the moment it starts to matter.

## 5. What to check after the first deploy

Open the deployment, open the browser console, and check four things.

| Check                   | How                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Isolation**           | Console: `crossOriginIsolated` → `true`, and `typeof SharedArrayBuffer` → `'function'`. No page reload.                                                                       |
| **A world**             | The game generates a map and starts paused. Press `1`; the clock runs. The system panel (`Esc` → menu) states the same isolation fact.                                        |
| **A save through OPFS** | `F5` (quick save), reload the tab, `Esc` → load — the save is in the list and opens. It survives closing the browser; three autosave slots in a browser, five on the desktop. |
| **The art**             | Console: either nothing about atlases, or `bakedAtlas: no baked art …; using procedural art`. Both are correct — the second means section 3 was skipped.                      |

If `crossOriginIsolated` is `false`, the headers are not arriving: check
Settings → Functions/Headers is not overriding them, and that the response for
the document really carries both (`curl -I <url>`).

If the page reloads once on the first visit, the shim ran, which means the
headers were missing — the game still works, but section 2 says it should not
have happened.

## 6. Local reproduction

```bash
npm run build:web && npm run preview      # http://localhost:5184, headers included
```

`vite preview` sends the same two headers, so this is the real thing minus the
CDN. To rehearse the shim instead, serve `dist/` from any static server that
sends no headers at all and watch for exactly one reload.
