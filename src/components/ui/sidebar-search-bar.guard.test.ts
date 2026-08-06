import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the unified-search end state (docs/unified-global-search-consolidation-plan.md).
 *
 * The global header pill (`GlobalHeaderSearch` → `GlobalFindCombobox` chrome) is
 * the search launcher on every route. On `/search` without `?sel=`, the centered
 * stage (`SearchFindStage`) is the expanded find surface — not a context rail.
 * Master sidebars must not revive the deleted per-panel `<SidebarSearchBar>`
 * band or `SidebarShell.search` prop. Page-scoped lookup goes through the AI
 * assistant.
 *
 * These tests fail the moment someone reintroduces a sidebar search band.
 */

const SRC_ROOT = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const ALL_SOURCE_FILES = walk(SRC_ROOT);

test('the deleted SidebarSearchBar component stays deleted', () => {
  assert.ok(
    !existsSync(join(SRC_ROOT, 'components/ui/SidebarSearchBar.tsx')),
    'SidebarSearchBar was removed — do not revive the old per-panel search band. ' +
      'On `/search`, use SearchFindStage / GlobalFindCombobox; elsewhere the ' +
      'global header pill is the launcher.',
  );
});

test('no file imports a SidebarSearchBar symbol', () => {
  const importRe = /import[^;]*\bSidebarSearchBar\b[^;]*from/;
  const offenders: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    if (rel === 'components/ui/sidebar-search-bar.guard.test.ts') continue; // this guard names the symbol
    if (importRe.test(readFileSync(file, 'utf8'))) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    'SidebarSearchBar no longer exists. Do not re-add a sidebar header search band — ' +
      'use SearchFindStage on `/search`, or the global header launcher elsewhere. Offending files:\n' +
      offenders.map((f) => `  - ${f}`).join('\n'),
  );
});

test('SidebarShell exposes no `search` prop (header owns search)', () => {
  const src = readFileSync(join(SRC_ROOT, 'components/layout/SidebarShell.tsx'), 'utf8');
  assert.ok(
    !/\bsearch\??:/.test(src),
    'SidebarShell must not declare a `search` prop. The deleted SidebarSearchBar ' +
      'band stays gone — `/search` uses the centered GlobalFind stage.',
  );
});

test('the 40px sidebar search band token stays deleted', () => {
  const offenders: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    if (rel === 'components/ui/sidebar-search-bar.guard.test.ts') continue; // this guard names the token
    if (readFileSync(file, 'utf8').includes('sidebarHeaderSearchRowClass')) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    'The `sidebarHeaderSearchRowClass` 40px search band was removed with SidebarSearchBar. ' +
      'Do not reintroduce a hand-wrapped sidebar search band. Offending files:\n' +
      offenders.map((f) => `  - ${f}`).join('\n'),
  );
});

test('deleted SearchSidebarPanel stays deleted (centered stage owns /search)', () => {
  assert.ok(
    !existsSync(join(SRC_ROOT, 'components/sidebar/search/SearchSidebarPanel.tsx')),
    'SearchSidebarPanel was removed — /search find lives in SearchFindStage, not a context rail.',
  );
});
