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
  const unshippedSidebar = source('components/unshipped/UnshippedSidebar.tsx');
  const unshippedTable = source('components/unshipped/UnshippedTable.tsx');
  const shipped = source('components/shipped/dashboard-table/useShippedTableFilters.ts');
  const packing = source('features/review/ReviewPackingTable.tsx');
  const pairing = source('features/review/pairing/ReviewPairingTable.tsx');

  assert.doesNotMatch(unshippedSidebar, /params\.set\('q'/);
  assert.doesNotMatch(unshippedTable, /searchParams\.get\('search'\)/);
  assert.doesNotMatch(shipped, /params\.set\('search'/);
  assert.match(shipped, /const \[search, setSearchState\] = useState\(''\)/);
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
