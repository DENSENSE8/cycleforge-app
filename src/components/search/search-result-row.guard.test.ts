import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Search-rail narrow anatomy SoT:
 *   • Chips / entity tags are density-gated (comfortable only) — never viewport
 *     `md:` inside a narrow sidebar/dropdown (desktop rails are still ~16–18rem).
 *   • Identifier titles go through narrowSearchTitleDisplay so tracking rows
 *     show last-4 instead of identical `94…` crumbs.
 */

function readSibling(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('SearchResultRow narrow-rail chrome', () => {
  const src = readSibling('./SearchResultRow.tsx');

  it('does not gate chips or packout chrome on viewport md:', () => {
    assert.doesNotMatch(
      src,
      /md:inline-flex/,
      'SearchResultRow must not use md:inline-flex — density gates rail chrome, not viewport',
    );
    assert.doesNotMatch(
      src,
      /\bmd:hidden\b|\bhidden[^\n]*md:/,
      'SearchResultRow must not hide/show chrome via viewport breakpoints',
    );
  });

  it('gates chips behind !narrow / comfortable density', () => {
    assert.match(src, /isNarrowDensity/, 'must define isNarrowDensity for compact|dropdown');
    assert.match(
      src,
      /!narrow &&[\s\S]*?<Chip/,
      'Chip render must be gated behind !narrow (comfortable only)',
    );
    assert.match(
      src,
      /!narrow && <EntityTag/,
      'EntityTag must be comfortable-only (not painted on compact/dropdown)',
    );
  });

  it('abbreviates identifier titles via narrowSearchTitleDisplay', () => {
    assert.match(
      src,
      /narrowSearchTitleDisplay/,
      'SearchResultRow must use narrowSearchTitleDisplay for rail titles',
    );
  });

  it('does not paint a compact GenericRow chevron (row is already a Link)', () => {
    const genericStart = src.indexOf('function GenericRow');
    const genericEnd = src.indexOf('export function SearchResultRow');
    const genericSrc =
      genericStart >= 0 && genericEnd > genericStart
        ? src.slice(genericStart, genericEnd)
        : '';
    assert.doesNotMatch(
      genericSrc,
      /ChevronRight/,
      'GenericRow must not mount a hover ChevronRight — the row Link is the affordance',
    );
  });
});
