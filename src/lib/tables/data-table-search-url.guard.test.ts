import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

function source(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    'utf8',
  );
}

test('shared workbench search is local and preserves the raw input', () => {
  const text = source('hooks/useWorkbenchSearchParam.ts');

  assert.match(text, /useState\(''\)/);
  assert.match(text, /setSearchQuery\(next\)/);
  assert.doesNotMatch(text, /from ['"]next\/navigation['"]/);
  assert.doesNotMatch(text, /\brouter\.(replace|push)\(/);
  assert.doesNotMatch(text, /\.trim\(\)/);
});

test('dashboard and outbound table search setters do not navigate', () => {
  const dashboard = source('hooks/useDashboardSearchController.ts');
  const outbound = source('hooks/useOutboundUrlState.ts');

  assert.match(
    dashboard,
    /const setSearch = useCallback\(\(nextValue: string\) => setSearchQuery\(nextValue\), \[\]\)/,
  );
  assert.match(outbound, /const \[q, setLocalQ\] = useState\(''\)/);
  assert.match(outbound, /const setQ = useCallback\(\s*\(value: string\) => setLocalQ\(value\),/);
});

test('orders slot-table search stays out of browser URL state', () => {
  const unshippedTable = source('components/unshipped/UnshippedTable.tsx');
  const shipped = source('components/shipped/dashboard-table/useShippedTableFilters.ts');
  const packing = source('features/review/ReviewPackingTable.tsx');
  const pairing = source('features/review/pairing/ReviewPairingTable.tsx');

  assert.doesNotMatch(unshippedTable, /searchParams\.get\('search'\)/);
  assert.doesNotMatch(shipped, /params\.set\('search'/);
  assert.doesNotMatch(packing, /params\.set\('search'/);
  assert.doesNotMatch(pairing, /params\.set\('search'/);
  assert.match(packing, /useState\(''\)/);
  assert.match(pairing, /useState\(''\)/);
});

test('receiving slot-table search stays out of browser URL state', () => {
  const receiving = source('components/station/ReceivingLinesTable.tsx');
  const spreadsheet = source('components/station/receiving-grid/useReceivingSpreadsheet.tsx');

  assert.match(receiving, /const \[receivingSearchValue, setReceivingSearchValue\] = useState\(''\)/);
  assert.doesNotMatch(receiving, /params\.set\(RECEIVING_SEARCH_PARAM_KEY/);
  assert.doesNotMatch(receiving, /searchParams\.get\(RECEIVING_SEARCH_PARAM_KEY/);
  assert.match(spreadsheet, /receivingLineMatchesQuery/);
  assert.doesNotMatch(spreadsheet, /from ['"]next\/navigation['"]/);
});

test('photo library find-bar stays out of browser URL state', () => {
  const findRow = source('components/photos/PhotoLibraryFindRow.tsx');
  const page = source('components/photos/PhotoLibraryPage.tsx');

  // The find row draws the box and owns nothing: it neither reads nor writes the
  // finder params, and it never navigates. (The header comment still names the
  // removed `patch({ poFinder })` pattern, so match code shapes, not prose.)
  assert.doesNotMatch(findRow, /filters\.poFinder/);
  assert.doesNotMatch(findRow, /poFinder:/);
  assert.doesNotMatch(findRow, /\bq: /);
  assert.doesNotMatch(findRow, /from ['"]next\/navigation['"]/);
  assert.match(findRow, /value=\{search\.value\}/);
  assert.match(findRow, /onChange=\{search\.onChange\}/);

  // The page holds the query in session state and narrows the painted rows.
  assert.match(page, /const \[searchQuery, setSearchQuery\] = useState\(''\)/);
  assert.match(page, /filterPhotosByQuery\(photos, searchQuery/);
  assert.doesNotMatch(page, /patch\(\{\s*poFinder:/);
});

test('kiosk catalog find stays out of browser URL state', () => {
  const shell = source('app/kiosk/KioskShell.tsx');
  const selector = source('components/repair/ProductSelector.tsx');
  const devices = source('components/settings/kiosk-devices/useKioskDevicesSpreadsheet.ts');

  // The tablet's one catalog find lives in the shell and is handed down as data.
  assert.match(shell, /const \[catalogSearch, setCatalogSearch\] = useState\(''\)/);
  assert.match(shell, /searchQuery=\{catalogSearch\}/);
  // The shell may navigate exactly once — the Exit verb lives in KioskTopChrome —
  // but the search value must never reach the URL from either file.
  assert.doesNotMatch(shell, /params\.set\('(q|search)'/);
  assert.doesNotMatch(selector, /from ['"]next\/navigation['"]/);
  assert.doesNotMatch(selector, /params\.set\('(q|search)'/);

  // Settings' kiosk-devices slot table follows the same law as every desk.
  assert.match(devices, /const \[query, setQuery\] = useState\(''\)/);
  assert.doesNotMatch(devices, /from ['"]next\/navigation['"]/);
});
