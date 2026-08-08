import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * `/search` browse shell — no locked-width stage field; header owns find +
 * pending pulse (body never paints “Opening…” holds). Identifier → resolve +
 * header bar → `?sel=`; multi-hit browse is full-bleed under the header.
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
  assert.match(page, /useSearchSelParam/);
  assert.match(page, /setSel=\{setSel\}/);
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
  // Amazon-like: the empty `/search` body paints NO idle teach / placeholder —
  // the header find field is the only search surface, loading lives in the
  // header SearchPendingBar. Never “Opening…” / PendingOpenHold / retrieve overlay.
  assert.doesNotMatch(browse, /Search everything/);
  assert.doesNotMatch(browse, /IdleTeachEmpty/);
  assert.match(browse, /searchOrderResolveQueryKey/);
  assert.doesNotMatch(browse, /PendingOpenHold/);
  assert.doesNotMatch(browse, /Opening…|Opening\.\.\./);
  assert.doesNotMatch(
    browse,
    /absolute inset-0[\s\S]{0,120}Opening|absolute inset-0[\s\S]{0,200}PendingOpenHold/,
    'retrieve must not cover results with an Opening overlay',
  );
  assert.doesNotMatch(browse, /\bsr-only\b/);
  assert.doesNotMatch(browse, /aria-hidden=\{!showResultsShell\}/);
  // Idle teach must not gate on idPending (that painted "use header" over a typed query).
  assert.doesNotMatch(
    browse,
    /idPending\s*\|\|\s*!hasQuery/,
    'idle teach must not share a branch with idPending',
  );
});

test('order feedback loading does not paint Opening order teach', () => {
  const feedback = read('src/components/search/order-feedback/SearchOrderFeedback.tsx');
  assert.match(feedback, /setGlobalSearchPending/);
  assert.doesNotMatch(feedback, /Opening order/);
  assert.doesNotMatch(feedback, /Opening…|Opening\.\.\./);
  assert.doesNotMatch(
    feedback,
    /resolveStatus === 'loading'[\s\S]{0,280}text-role-caption/,
    'loading branch must not return centered teach copy',
  );
  assert.doesNotMatch(
    feedback,
    /resolveStatus === 'loading'[\s\S]{0,200}bg-surface-canvas/,
    'loading hold must not paint a bare bg-surface-canvas page',
  );
});

test('identifier chrome seeds resolve cache and does not gray-handoff on miss', () => {
  assert.match(combobox, /commitIdentifierFind/);
  // Miss path must stay on the current page — no searchRerunHref navigate after resolve.
  const missBlock = combobox.match(
    /result\.kind === 'navigate'[\s\S]*?setResolvePending\(false\)/,
  )?.[0];
  assert.ok(missBlock, 'expected identifier resolve block');
  assert.doesNotMatch(
    missBlock,
    /navigateSearchHref\(router,\s*searchRerunHref/,
    'identifier miss must not open /search?q= gray shell',
  );
  assert.match(missBlock, /keepPreviewOpen/, 'identifier miss re-opens preview/empty dropdown');
});

test('NL zero preview hits stay in header dropdown (no /search?q= blank canvas)', () => {
  // handleSearchSubmit NL: empty flatPreviewHits → keepPreviewOpen (no navigate)
  // when chrome has no onBrowseQuery. Explicit Maximize still opens /search via
  // openSearchWorkbench — that is opt-in, not Enter/empty-query handoff.
  assert.match(combobox, /openSearchWorkbench/);
  assert.match(
    combobox,
    /preview\.length === 0/,
    'expected NL submit zero-hit gate',
  );
  const submitZero = combobox.match(
    /if \(preview\.length === 0\) \{[\s\S]*?keepPreviewOpen\(\);\s*\n\s*return;\s*\n\s*\}/,
  )?.[0];
  assert.ok(submitZero, 'expected NL submit zero-hit keepPreviewOpen block');
  assert.doesNotMatch(
    submitZero,
    /navigateSearchHref\(router,\s*searchRerunHref|navigateSearchHref\(router,\s*globalSearchHandoffHref/,
    'zero-hit submit must not open /search?q= gray shell',
  );
  assert.match(submitZero, /keepPreviewOpen/);
});

test('page surface does not paint absolute-zero EmptyState', () => {
  const surface = read('src/components/search/SearchResultsSurface.tsx');
  assert.doesNotMatch(
    surface,
    /Try fewer words, a partial serial/,
    'zero-hit page EmptyState must be removed',
  );
  assert.doesNotMatch(
    surface,
    /No matches for [“"]/,
    'zero-hit “No matches” EmptyState must be removed (header dropdown owns it)',
  );
  assert.match(browse, /zeroHits/);
  assert.match(browse, /dispatchGlobalSearchFocus/);
});

test('header dropdown empty state is simple red feedback', () => {
  const dropdown = read('src/components/search/GlobalSearchDropdown.tsx');
  const emptyBlock = dropdown.match(/state === 'empty' && \([\s\S]*?\)\s*\}/)?.[0];
  assert.ok(emptyBlock, 'expected empty dropdown state');
  assert.match(emptyBlock, /text-text-danger/);
  assert.match(emptyBlock, /No matches for/);
  assert.doesNotMatch(
    emptyBlock,
    /Try a partial serial/,
    'empty dropdown must not stack a secondary hint',
  );
});

test('header preview is not gated off for identifier-shaped queries', () => {
  // Serials / tracking / order # must still fetch preview (hits or empty).
  const previewAssign = combobox.match(
    /const showPreview\s*=\s*[^;]+;/,
  )?.[0];
  assert.ok(previewAssign, 'expected showPreview assignment');
  assert.doesNotMatch(
    previewAssign,
    /looksLikeIdentifier/,
    'showPreview must not exclude looksLikeIdentifier queries',
  );
  assert.match(previewAssign, /trimmedQuery\.length >= 2/);
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
