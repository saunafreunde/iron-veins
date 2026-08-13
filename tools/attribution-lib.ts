/**
 * The build-time attribution file of SPEC2 M25 - generated from the dependency
 * tree, never typed by hand.
 *
 * WHY GENERATED. A hand-written credits list is right on the day it is written
 * and wrong at the next `npm install`: it cannot see a transitive dependency
 * arriving, a licence changing between versions, or a package leaving. The
 * milestone asks for "zur Build-Zeit generierte Attributions-Datei", and this
 * file is the generator's pure half - everything in it is a function of what it
 * is handed, so the interesting rules can be driven from a synthetic tree in a
 * test instead of from whatever happens to be in `node_modules` today.
 *
 * WHAT IT COVERS, AND WHAT IT SAYS IT DOES NOT. The npm RUNTIME dependency
 * closure: the packages in `dependencies`, plus everything they themselves
 * depend on, which is exactly the set whose code ships inside the application.
 * Devtools do not ship and are deliberately absent. What it also does not cover
 * is the Rust crate graph behind the Tauri shell and the Kenney CC0 kits, and
 * both are NAMED in the rendered header rather than silently missing - a
 * credits file whose gaps are invisible is worse than one that has none, and
 * the Kenney kits are a build-time download the repo never contains (E-14).
 *
 * WHY IT REFUSES RATHER THAN GUESSES. A package with no `license` field is a
 * red build, not an omission: the whole point of the artefact is that shipping
 * something the project has no right to ship becomes impossible by accident.
 */

/** One package's own `package.json`, as far as this generator reads it. */
export interface PackageManifest {
  readonly name?: string;
  readonly version?: string;
  readonly license?: string;
  readonly homepage?: string;
  readonly repository?: string | { readonly url?: string };
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

/** One rendered credit. */
export interface AttributionEntry {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  /** Where the project lives, or '' when the package says nothing. */
  readonly url: string;
}

/**
 * The names of every package whose code can end up in the shipped bundles.
 *
 * The walk is ITERATIVE with an explicit stack. That is architecture law #8
 * applied outside the simulation, and it is not ceremony: an npm dependency
 * graph has cycles (a package depending on a package that depends back), and a
 * recursive walk over one either overflows or needs the same visited set this
 * one has anyway.
 *
 * Returned sorted, so the file a build produces is a pure function of the tree
 * and two builds of one commit are byte-identical - the same property the
 * asset bake promises (D-160).
 */
export function runtimeClosure(
  root: PackageManifest,
  read: (name: string) => PackageManifest | null,
): string[] {
  const seen = new Set<string>();
  const stack: string[] = Object.keys(root.dependencies ?? {});
  while (stack.length > 0) {
    const name = stack.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const manifest = read(name);
    if (manifest === null) continue;
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (!seen.has(dependency)) stack.push(dependency);
    }
  }
  return [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The project URL a manifest states, in the order the ecosystem uses. */
export function manifestUrl(manifest: PackageManifest): string {
  if (typeof manifest.homepage === 'string' && manifest.homepage.length > 0) {
    return manifest.homepage;
  }
  const repository = manifest.repository;
  if (typeof repository === 'string') return repository;
  if (repository !== undefined && typeof repository.url === 'string') return repository.url;
  return '';
}

/**
 * Turn the closure into entries, refusing anything that does not state a
 * licence.
 *
 * A missing manifest is refused for the same reason: a package the build
 * cannot read is a package whose terms nobody has seen, and the honest answer
 * to that is a failed release rather than a shorter credits file.
 */
export function collectAttribution(
  root: PackageManifest,
  read: (name: string) => PackageManifest | null,
): AttributionEntry[] {
  const entries: AttributionEntry[] = [];
  const unlicensed: string[] = [];
  for (const name of runtimeClosure(root, read)) {
    const manifest = read(name);
    if (manifest === null) {
      unlicensed.push(`${name} (no package.json found)`);
      continue;
    }
    const license = manifest.license;
    if (typeof license !== 'string' || license.length === 0) {
      unlicensed.push(`${name} (no license field)`);
      continue;
    }
    entries.push({
      name,
      version: typeof manifest.version === 'string' ? manifest.version : '',
      license,
      url: manifestUrl(manifest),
    });
  }
  if (unlicensed.length > 0) {
    throw new Error(
      `attribution: ${unlicensed.length} runtime dependencies state no licence and ` +
        `a release must not ship them unnamed: ${unlicensed.join(', ')}`,
    );
  }
  return entries;
}

/** Everything the header needs that is not a dependency. */
export interface AttributionHeader {
  readonly product: string;
  readonly version: string;
}

/**
 * The rendered file.
 *
 * Plain text, because it is read by a person in an installer directory and by a
 * person in a browser, and because a format with structure invites somebody to
 * parse it and depend on the shape.
 */
export function renderAttribution(
  header: AttributionHeader,
  entries: readonly AttributionEntry[],
): string {
  const lines: string[] = [];
  lines.push(`${header.product} ${header.version} - third-party notices`);
  lines.push('');
  lines.push('Generated at build time from the npm runtime dependency tree by');
  lines.push('tools/make-attribution.mjs. Do not edit: the next build overwrites it.');
  lines.push('');
  lines.push(`${entries.length} packages ship inside this application.`);
  lines.push('');
  lines.push('Not covered here, and named so the gap is visible:');
  lines.push('  - the Rust crates behind the Tauri desktop shell, whose notices the');
  lines.push('    Tauri bundler emits with the installer;');
  lines.push('  - the Kenney game-asset kits (CC0 1.0, public domain), which are');
  lines.push('    downloaded and baked at build time and are in no repository file.');
  lines.push('    Credit is given because it is deserved, not because CC0 asks.');
  lines.push('');
  lines.push('-'.repeat(72));
  for (const entry of entries) {
    lines.push('');
    lines.push(`${entry.name}@${entry.version}`);
    lines.push(`  Licence: ${entry.license}`);
    if (entry.url.length > 0) lines.push(`  Project: ${entry.url}`);
  }
  lines.push('');
  return lines.join('\n');
}
