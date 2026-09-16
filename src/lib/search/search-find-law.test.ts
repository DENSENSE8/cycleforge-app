/**
 * FIND surface ratchet — `/search` may not wear station / PO / Monitor chrome.
 *
 * Callers: node:test. Imports SEARCH_FIND_* from search-find-law.ts.
 * No API / schema. User: Session A / Phase 0 — tripwire stays green via shrink-only debt.
 * Session E / Phase 6–7: station ports deleted; the scan preview embed is the FIND
 * column and carries no Displays index.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  SEARCH_FIND_DISPLAYS_INDEX_MARKERS,
  SEARCH_FIND_FORBIDDEN_MARKERS,
  SEARCH_FIND_LAW,
  SEARCH_FIND_MARKER_DEBT,
  SEARCH_FIND_PREVIEW_EMBED_FILE,
  SEARCH_FIND_SURFACE_FILES,
} from './search-find-law';

const REPO = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(REPO, file), 'utf8');
}

function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Whole identifier for [A-Za-z0-9_]+ markers so UnitStationIdentity ≠ buildUnitStationIdentityVM. */
function hasMarker(src: string, marker: string): boolean {
  if (/[^A-Za-z0-9_]/.test(marker)) return src.includes(marker);
  return new RegExp(`(?:^|[^A-Za-z0-9_])${marker}(?:[^A-Za-z0-9_]|$)`).test(src);
}

function collectHits(): string[] {
  const hits: string[] = [];
  for (const file of SEARCH_FIND_SURFACE_FILES) {
    const src = code(file);
    for (const marker of SEARCH_FIND_FORBIDDEN_MARKERS) {
      if (hasMarker(src, marker)) hits.push(`${file} :: ${marker}`);
    }
  }
  return hits.sort();
}

describe('search FIND law', () => {
  it('names the case-file contract', () => {
    assert.match(SEARCH_FIND_LAW, /case-file/);
    assert.match(SEARCH_FIND_LAW, /handoff/);
    assert.match(SEARCH_FIND_LAW, /Timeline shapes/);
    assert.match(SEARCH_FIND_LAW, /Do not restore recents/);
    assert.match(SEARCH_FIND_LAW, /Displays leaves/);
    assert.doesNotMatch(SEARCH_FIND_LAW, /CartonContextCard/);
  });

  it('every FIND surface file exists', () => {
    const missing = SEARCH_FIND_SURFACE_FILES.filter((file) => !existsSync(path.join(REPO, file)));
    assert.deepEqual(missing, [], `FIND surface files missing:\n${missing.join('\n')}`);
  });

  it('FIND files do not import station, PO line, item-ledger, or Monitor chrome beyond listed debt', () => {
    const hits = collectHits();
    const debt = [...SEARCH_FIND_MARKER_DEBT].sort();
    const unexpected = hits.filter((hit) => !debt.includes(hit));
    const stale = debt.filter((row) => !hits.includes(row));
    assert.deepEqual(unexpected, [], `FIND surface wearing new work chrome:\n${unexpected.join('\n')}`);
    assert.deepEqual(stale, [], `SEARCH_FIND_MARKER_DEBT is stale (shrink the list):\n${stale.join('\n')}`);
  });

  it('FIND dossier does not fork a second lg-hidden tree', () => {
    const src = code('src/components/search/dossier/SearchDossierFrame.tsx');
    assert.doesNotMatch(src, /lg:hidden/);
    assert.doesNotMatch(src, /hidden lg:block/);
    assert.equal((src.match(/data-testid="search-dossier-chronology"/g) || []).length, 1);
  });
});

describe('search FIND law — Displays index stays off FIND (Phase 6–7)', () => {
  it('every Displays-index marker is a forbidden marker', () => {
    const forbidden = new Set<string>(SEARCH_FIND_FORBIDDEN_MARKERS);
    const missing = SEARCH_FIND_DISPLAYS_INDEX_MARKERS.filter((marker) => !forbidden.has(marker));
    assert.deepEqual(missing, [], `Displays-index markers not in the forbidden list:\n${missing.join('\n')}`);
  });

  it('the components/search/station ports are gone from disk', () => {
    assert.equal(
      existsSync(path.join(REPO, 'src/components/search/station')),
      false,
      'src/components/search/station/* was deleted in Phase 6 — do not recreate FIND station ports',
    );
  });

  it('the scan preview embed is a FIND surface file', () => {
    assert.ok(
      (SEARCH_FIND_SURFACE_FILES as readonly string[]).includes(SEARCH_FIND_PREVIEW_EMBED_FILE),
      'SearchFindPreviewEmbed must be governed by the FIND marker tripwire',
    );
  });

  it('the scan preview embed mounts the dossier router and no Displays index', () => {
    const src = code(SEARCH_FIND_PREVIEW_EMBED_FILE);
    assert.match(src, /from '@\/components\/search\/dossier\/SearchDossier'/);
    for (const marker of SEARCH_FIND_DISPLAYS_INDEX_MARKERS) {
      assert.equal(hasMarker(src, marker), false, `preview embed wears a Displays index: ${marker}`);
    }
    for (const marker of ['EntityStationPane', 'ActiveOrderWorkspace', 'StationComposerHost']) {
      assert.equal(hasMarker(src, marker), false, `preview embed is FIND, not a station pane: ${marker}`);
    }
  });

  it('the embed and /m/search consume the same dossier router', () => {
    const importLine = /from '@\/components\/search\/dossier\/SearchDossier'/;
    assert.match(code(SEARCH_FIND_PREVIEW_EMBED_FILE), importLine);
    assert.match(code('src/components/search/SearchDetailWorkspace.tsx'), importLine);
    const surface = code('src/components/search/SearchFindSurface.tsx');
    assert.match(surface, /SearchDetailWorkspace/);
    for (const page of ['src/app/search/page.tsx', 'src/app/m/(shell)/search/page.tsx']) {
      assert.match(code(page), /from '@\/components\/search\/SearchFindSurface'/, `${page} must mount SearchFindSurface`);
    }
  });

  it('no FIND surface file imports from the station Displays registry', () => {
    const hits: string[] = [];
    for (const file of SEARCH_FIND_SURFACE_FILES) {
      const src = code(file);
      if (/from '@\/components\/station\/displays/.test(src)) hits.push(file);
      if (/from '@\/components\/search\/station\//.test(src)) hits.push(file);
    }
    assert.deepEqual(hits, []);
  });
});
