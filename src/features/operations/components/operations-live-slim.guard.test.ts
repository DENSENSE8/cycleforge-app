import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the Live-Monitor slim (dashboard-ops-ux plan, Slice 2).
 *
 * Operations Live is a **Monitor** (observe-only): Goal → KPIs → Exceptions →
 * Pipeline → Feed (+ modal). A `PendingOrdersTable` is an order ledger — a
 * Workbench surface with durable selection + edit — and is the wrong archetype
 * on a Monitor, so it was unmounted from Live and lives only on `/dashboard`.
 *
 * This is a source-level assertion (no browser) that Live never re-grows the
 * ledger: the composition source must not import or render `PendingOrdersTable`.
 * The `PendingOrdersTable.tsx` component file is intentionally kept on disk
 * (Analytics may reuse it) — only Live stops consuming it.
 */

const DASHBOARD_SRC = join(
  process.cwd(),
  'src/features/operations/components/OperationsDashboard.tsx',
);

test('Operations Live composition does not consume the PendingOrdersTable ledger', () => {
  const src = readFileSync(DASHBOARD_SRC, 'utf8');
  // Real consumption = an import of, or JSX element for, the ledger. A passing
  // mention in a doc-comment (explaining WHY it's gone) is allowed.
  const imports = /import\s+[^;]*PendingOrdersTable[^;]*from/.test(src);
  const rendered = /<PendingOrdersTable[\s/>]/.test(src);
  assert.equal(
    imports || rendered,
    false,
    'OperationsDashboard.tsx must not import/render PendingOrdersTable — the order ledger is a Workbench, not a Monitor surface.',
  );
});
