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

test('specialized table searches remain out of browser URL state', () => {
  const unshippedSidebar = source('components/unshipped/UnshippedSidebar.tsx');
  const unfoundToolbar = source('components/receiving/unfound/UnfoundQueueSidebarToolbar.tsx');
  const receiving = source('components/station/ReceivingLinesTable.tsx');

  assert.doesNotMatch(unshippedSidebar, /params\.set\('q'/);
  assert.doesNotMatch(unfoundToolbar, /uf_q/);
  assert.doesNotMatch(receiving, /RECEIVING_SEARCH_PARAM_KEY/);
  assert.match(receiving, /onChange: setReceivingSearchValue/);
});
