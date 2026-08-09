import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the Live-Monitor slim (dashboard-ops-ux plan, Slice 2).
 *
 * Operations Live is a **Monitor** (observe-only). The outbound order ledger
 * (`OrdersGridHost`) is a Workbench surface — wrong archetype on a Monitor —
 * so Live must never import or render it (or the deleted PendingOrdersTable).
 */

const DASHBOARD_SRC = join(
  process.cwd(),
  'src/features/operations/components/OperationsDashboard.tsx',
);

test('Operations Live composition does not consume the outbound order ledger', () => {
  const src = readFileSync(DASHBOARD_SRC, 'utf8');
  const importsPending = /import\s+[^;]*PendingOrdersTable[^;]*from/.test(src);
  const renderedPending = /<PendingOrdersTable[\s/>]/.test(src);
  const importsGrid = /import\s+[^;]*OrdersGridHost[^;]*from/.test(src);
  const renderedGrid = /<OrdersGridHost[\s/>]/.test(src);
  assert.equal(
    importsPending || renderedPending || importsGrid || renderedGrid,
    false,
    'OperationsDashboard.tsx must not import/render PendingOrdersTable or OrdersGridHost — the order ledger is a Workbench, not a Monitor surface.',
  );
});
