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

test('orders review tables share the header q parameter', () => {
  const unshippedTable = source('components/unshipped/UnshippedTable.tsx');
  const shipped = source('components/shipped/dashboard-table/useShippedTableFilters.ts');
  const packing = source('features/review/ReviewPackingTable.tsx');
  const pairing = source('features/review/pairing/ReviewPairingTable.tsx');

  assert.doesNotMatch(unshippedTable, /searchParams\.get\('search'\)/);
  assert.doesNotMatch(shipped, /params\.set\('search'/);
  assert.match(packing, /searchParams\.get\('q'\)/);
  assert.match(pairing, /searchParams\.get\('q'\)/);
  assert.match(packing, /params\.set\('q', next\)/);
  assert.match(pairing, /params\.set\('q', next\)/);
});

test('receiving slot-table search follows the shared inbound header parameter', () => {
  const receiving = source('components/station/ReceivingLinesTable.tsx');
  const spreadsheet = source('components/station/receiving-grid/useReceivingSpreadsheet.tsx');

  assert.match(receiving, /searchParams\.get\(INBOUND_FIND_PARAM\)/);
  assert.match(receiving, /const receivingSearchValue = urlFindValue/);
  assert.match(spreadsheet, /receivingLineMatchesQuery/);
  assert.doesNotMatch(spreadsheet, /from ['"]next\/navigation['"]/);
});

test('photo library uses the shared header query and keeps controls free of duplicate find UI', () => {
  const findRow = source('components/photos/PhotoLibraryFindRow.tsx');
  const page = source('components/photos/PhotoLibraryPage.tsx');

  // The find row draws the box and owns nothing: it neither reads nor writes the
  // finder params, and it never navigates. (The header comment still names the
  // removed `patch({ poFinder })` pattern, so match code shapes, not prose.)
  assert.doesNotMatch(findRow, /filters\.poFinder/);
  assert.doesNotMatch(findRow, /poFinder:/);
  assert.doesNotMatch(findRow, /\bq: /);
  assert.doesNotMatch(findRow, /from ['"]next\/navigation['"]/);
  assert.doesNotMatch(findRow, /value=\{search\.value\}/);
  assert.doesNotMatch(findRow, /onChange=\{search\.onChange\}/);

  // The page reads the shared query and narrows the painted rows.
  assert.match(page, /const searchQuery = filters\.q \?\? ''/);
  assert.match(page, /usePhotoLibrary\(filters\)/);
  assert.match(page, /const visiblePhotos = photos/);
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
