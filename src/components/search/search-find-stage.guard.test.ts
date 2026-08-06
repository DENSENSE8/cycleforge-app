import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * `/search` browse shell — no locked-width stage field; header owns find +
 * pending pulse. Identifier → resolve + header bar → `?sel=`; multi-hit
 * browse is full-bleed under the header.
 */

const ROOT = process.cwd();

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

const browse = read('src/components/search/SearchBrowseShell.tsx');
const page = read('src/app/search/page.tsx');
const header = read('src/components/layout/GlobalHeaderSearch.tsx');
const combobox = read('src/components/search/GlobalFindCombobox.tsx');
const pulse = read('src/components/search/SearchPendingPulse.tsx');
const pending = read('src/lib/global-search-pending.ts');

test('SearchBrowseShell is the no-sel /search surface (page mounts it)', () => {
  assert.match(page, /SearchBrowseShell/);
  assert.match(page, /if \(!sel\)/);
  assert.doesNotMatch(page, /SearchFindStage/);
  assert.doesNotMatch(page, /autoReranRef|recents\[0\]\?\.query/);
});

test('browse shell has no locked-width stage find field', () => {
  assert.doesNotMatch(browse, /GlobalFindCombobox/);
  assert.doesNotMatch(browse, /presentation="stage"/);
  assert.doesNotMatch(browse, /max-w-\[560px\]/);
  assert.doesNotMatch(browse, /SearchStageBackground/);
  assert.match(browse, /SearchResultsSurface/);
  assert.match(browse, /SearchRefineControls/);
});

test('browse resolves identifiers quietly then opens sel (no skeleton wall)', () => {
  assert.match(browse, /looksLikeIdentifier/);
  assert.match(browse, /resolveSearchOrder/);
  assert.match(browse, /setSearchOrderResolveCache/);
  assert.match(browse, /setGlobalSearchPending/);
  assert.doesNotMatch(browse, /SearchResultRowSkeleton/);
  assert.doesNotMatch(browse, /searchSkeletonCount/);
});

test('identifier chrome seeds resolve cache and does not gray-handoff on miss', () => {
  assert.match(combobox, /setSearchOrderResolveCache/);
  // Miss path must stay on the current page — no searchRerunHref navigate after resolve.
  const missBlock = combobox.match(
    /resolved\.status === 'ok'[\s\S]*?setResolvePending\(false\)/,
  )?.[0];
  assert.ok(missBlock, 'expected identifier resolve block');
  assert.doesNotMatch(
    missBlock,
    /navigateSearchHref\(router,\s*searchRerunHref/,
    'identifier miss must not open /search?q= gray shell',
  );
});

test('SearchPendingBar is an indeterminate bottom rule (not animate-pulse)', () => {
  assert.match(pulse, /SearchPendingBar|recv-indet-bar/);
  assert.match(pulse, /recv-indet-bar/);
  assert.doesNotMatch(pulse, /animate-pulse/);
  assert.doesNotMatch(pulse, /elevationClass\(/);
  assert.doesNotMatch(pulse, /backdrop-blur/);
});

test('header owns find on every route and paints browse pending', () => {
  assert.match(header, /ownsFocusEvent/);
  assert.match(header, /pending=\{browsePending\}/);
  assert.match(header, /subscribeGlobalSearchPending/);
  assert.doesNotMatch(header, /deferExpand|deferToStage/);
  assert.doesNotMatch(header, /dispatchGlobalSearchFocus/);
});

test('pending waist bridges browse shell → header combobox', () => {
  assert.match(pending, /setGlobalSearchPending/);
  assert.match(pending, /subscribeGlobalSearchPending/);
  assert.match(combobox, /SearchPendingBar/);
  assert.match(combobox, /pending \|\| resolvePending|showPendingBar/);
  assert.match(combobox, /overflow-hidden/);
});

test('GlobalFindCombobox chrome is the sole find presentation on /search', () => {
  assert.match(header, /presentation="chrome"/);
  // Must not bind the ⌘K chord (arrow/Escape keydown on the input is fine).
  assert.doesNotMatch(combobox, /e\.key\s*===\s*['"]k['"]/i);
});

test('chrome find cell is flush (no pill, no gray bubble)', () => {
  assert.match(combobox, /rounded-none/);
  assert.match(combobox, /border-x/);
  assert.match(combobox, /border-border-hairline/);
  assert.match(combobox, /bg-transparent/);
  assert.doesNotMatch(combobox, /rounded-full/);
});
