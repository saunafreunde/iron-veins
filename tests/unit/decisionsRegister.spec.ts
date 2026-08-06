import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The coupling test behind the decision register (D-138): DECISIONS.md opens
 * with a hand-maintained topic-to-D-numbers index, and hand-maintained lists
 * rot in silence unless something red reads them. This test parses both
 * directions - every logged decision must be indexed under at least one
 * topic, and every number the register cites must have an entry - in the
 * same spirit as the command-parser and i18n coupling audits (D-133).
 */

const DECISIONS_PATH = fileURLToPath(new URL('../../DECISIONS.md', import.meta.url));

const REGISTER_HEADING = '## Register';

/** The register block: from its heading to the next top-level heading. */
function registerBlock(text: string): string {
  const start = text.indexOf(REGISTER_HEADING);
  if (start < 0) throw new Error('DECISIONS.md has no "## Register" section');
  const end = text.indexOf('\n## ', start + REGISTER_HEADING.length);
  if (end < 0) throw new Error('the register is not followed by another section');
  return text.slice(start, end);
}

function numbersIn(text: string, pattern: RegExp): Set<number> {
  const found = new Set<number>();
  for (const match of text.matchAll(pattern)) {
    found.add(Number.parseInt(match[1]!, 10));
  }
  return found;
}

describe('the decision register', () => {
  const text = readFileSync(DECISIONS_PATH, 'utf8');
  const entries = numbersIn(text, /^### D-(\d{3})/gm);
  const indexed = numbersIn(registerBlock(text), /D-(\d{3})/g);

  it('has entries and an index at all', () => {
    expect(entries.size).toBeGreaterThan(100);
    expect(indexed.size).toBeGreaterThan(100);
  });

  it('indexes every logged decision under at least one topic', () => {
    const missing = [...entries].filter((n) => !indexed.has(n)).sort((a, b) => a - b);
    expect(
      missing,
      `decisions with no register topic: ${missing.map((n) => `D-${n}`).join(', ')} - ` +
        'add each to a topic line in the register at the head of DECISIONS.md',
    ).toEqual([]);
  });

  it('cites only decisions that exist', () => {
    const phantom = [...indexed].filter((n) => !entries.has(n)).sort((a, b) => a - b);
    expect(
      phantom,
      `register cites entries that do not exist: ${phantom.map((n) => `D-${n}`).join(', ')}`,
    ).toEqual([]);
  });
});
