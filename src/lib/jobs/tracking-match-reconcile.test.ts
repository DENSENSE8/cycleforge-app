import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import {
  runTrackingMatchReconcileJob,
  type TrackingMatchReconcileDeps,
} from './tracking-match-reconcile';

// ─── Deps fakes ─────────────────────────────────────────────────────────────── The job is deps-injected:

interface Candidate {
  rl_id: number;
  organization_id: string;
  scan_carton: number | null;
}

function fakes(
  candidates: Candidate[],
  reject409: ReadonlySet<number> = new Set(),
) {
  const calls = {
    candidatesSql: null as string | null,
    txOrgIds: [] as string[],
    linkage: [] as { orgId: string; sql: string; params: unknown[] }[],
    transitions: [] as { input: Record<string, unknown>; client: unknown; orgId: unknown }[],
  };
  const txClientByOrg = new Map<string, unknown>();

  const deps: TrackingMatchReconcileDeps = {
    query: async (sql) => {
      calls.candidatesSql = sql;
      return { rows: candidates };
    },
    withTenantTx: async (orgId, fn) => {
      calls.txOrgIds.push(orgId);
      const client = {
        query: async (sql: string, params?: unknown[]) => {
          calls.linkage.push({ orgId, sql, params: params ?? [] });
          return { rows: [], rowCount: 0 };
        },
      } as unknown as PoolClient;
      txClientByOrg.set(orgId, client);
      return fn(client);
    },
    transitionLine: (async (
      input: { receivingLineId: number },
      db: unknown,
      orgId: unknown,
    ) => {
      calls.transitions.push({ input: input as Record<string, unknown>, client: db, orgId });
      if (reject409.has(input.receivingLineId)) {
        return {
          ok: false as const,
          status: 409 as const,
          error: 'expected from=EXPECTED but line is in MATCHED',
          from: 'MATCHED',
        };
      }
      return {
        ok: true as const,
        eventId: -1,
        from: 'EXPECTED',
        to: 'MATCHED',
        changed: true,
        coarse: 'SCANNED' as const,
        receivingId: 1,
      };
    }) as TrackingMatchReconcileDeps['transitionLine'],
  };

  return { deps, calls, txClientByOrg };
}

test('groups candidates by org: one tenant tx per org, one transition per row', async () => {
  const { deps, calls, txClientByOrg } = fakes([
    { rl_id: 1, organization_id: 'org-a', scan_carton: 10 },
    { rl_id: 2, organization_id: 'org-b', scan_carton: 20 },
    { rl_id: 3, organization_id: 'org-a', scan_carton: 11 },
  ]);
  const res = await runTrackingMatchReconcileJob(deps);

  assert.equal(res.ok, true);
  assert.equal(res.advancedLines, 3);
  assert.deepEqual([...calls.txOrgIds].sort(), ['org-a', 'org-b']);

  // Each transition ran on ITS org's tx client with that orgId threaded.
  assert.equal(calls.transitions.length, 3);
  for (const t of calls.transitions) {
    assert.equal(t.client, txClientByOrg.get(String(t.orgId)));
  }
  const orgAIds = calls.transitions
    .filter((t) => t.orgId === 'org-a')
    .map((t) => t.input.receivingLineId)
    .sort();
  assert.deepEqual(orgAIds, [1, 3]);
});

test('chokepoint input shape: to MATCHED, expectedFrom EXPECTED, skipEvent, station SYSTEM', async () => {
  const { deps, calls } = fakes([{ rl_id: 7, organization_id: 'org-a', scan_carton: 5 }]);
  await runTrackingMatchReconcileJob(deps);

  assert.equal(calls.transitions.length, 1);
  const { input } = calls.transitions[0];
  assert.equal(input.receivingLineId, 7);
  assert.equal(input.to, 'MATCHED');
  assert.equal(input.expectedFrom, 'EXPECTED');
  assert.equal(input.skipEvent, true);
  assert.equal(input.station, 'SYSTEM');
});

test('409 (line left EXPECTED meanwhile) is a per-row skip, not counted, never throws', async () => {
  const { deps, calls } = fakes(
    [
      { rl_id: 1, organization_id: 'org-a', scan_carton: 10 },
      { rl_id: 2, organization_id: 'org-a', scan_carton: 10 },
      { rl_id: 3, organization_id: 'org-a', scan_carton: 10 },
    ],
    new Set([2]),
  );
  const res = await runTrackingMatchReconcileJob(deps);
  assert.equal(res.advancedLines, 2, 'the 409 row must not count as advanced');
  assert.equal(calls.transitions.length, 3, 'every candidate row is still attempted');
});

test('linkage UPDATE sets receiving_id only — workflow_status is NOT in the SET list', async () => {
  const { deps, calls } = fakes([
    { rl_id: 1, organization_id: 'org-a', scan_carton: 10 },
    { rl_id: 2, organization_id: 'org-a', scan_carton: 20 },
  ]);
  await runTrackingMatchReconcileJob(deps);

  const linkage = calls.linkage.filter((c) => /UPDATE receiving_line/.test(c.sql));
  assert.equal(linkage.length, 1, 'one set-based linkage UPDATE per org');
  const sql = linkage[0].sql;
  const setClause = sql.slice(sql.indexOf('SET'), sql.indexOf('WHERE'));
  assert.ok(/receiving_id/.test(setClause), 'SET must carry the receiving_id linkage');
  assert.ok(
    !/workflow_status/.test(setClause),
    'SET must NOT list workflow_status — the coarse trigger fires on any SET of it',
  );
  // The still-EXPECTED guard stays as a read predicate (WHERE is fine).
  assert.ok(/workflow_status = 'EXPECTED'/.test(sql.slice(sql.indexOf('WHERE'))));
  // Set-based params: rl_ids + scan_cartons arrays.
  assert.deepEqual(linkage[0].params, [[1, 2], [10, 20]]);
});

test('candidates query is read-only and org-scopes the carton + dock-scan joins', async () => {
  const { deps, calls } = fakes([]);
  await runTrackingMatchReconcileJob(deps);

  const sql = calls.candidatesSql ?? '';
  assert.ok(/^\s*WITH inc AS/.test(sql));
  assert.ok(!/UPDATE\s/.test(sql), 'candidates query must not write');
  assert.ok(/rl\.organization_id/.test(sql), 'candidates carry the org id');
  assert.ok(
    /rs\.organization_id = resolved\.organization_id/.test(sql),
    'dock-scan join must be org-scoped (no cross-tenant scan match)',
  );
  assert.ok(
    /r\.organization_id = inc\.organization_id/.test(sql),
    'carton resolution must be org-scoped',
  );
});

test('candidates query reads line zoho fields from receiving_line_zoho, not the spine', async () => {
  const { deps, calls } = fakes([]);
  await runTrackingMatchReconcileJob(deps);

  const sql = calls.candidatesSql ?? '';
  assert.ok(
    /LEFT JOIN receiving_line_zoho rz/.test(sql),
    'line zoho facts come via the rz street table',
  );
  assert.ok(
    /rz\.receiving_line_id = rl\.id/.test(sql) && /rz\.organization_id = rl\.organization_id/.test(sql),
    'rz join must be 1:1 PK + org-scoped',
  );
  assert.ok(
    /rz\.zoho_purchaseorder_id IS NOT NULL/.test(sql),
    'the zoho-PO filter reads rz (LEFT JOIN + IS NOT NULL ≡ old spine filter)',
  );
  assert.ok(
    !/rl\.zoho_purchaseorder_id/.test(sql),
    'no line-level zoho read off the receiving_line spine',
  );
  // CARTON-level zoho_purchaseorder_id deliberately STAYS on receiving_carton
  // (r.*) — only LINE zoho fields moved to receiving_line_zoho.
  assert.ok(
    /r\.zoho_purchaseorder_id = inc\.zoho_purchaseorder_id/.test(sql),
    'the carton PO fallback still reads receiving_carton.zoho_purchaseorder_id',
  );
});

test('no candidates → no tenant tx, zero advanced, retired counters stay 0', async () => {
  const { deps, calls } = fakes([]);
  const res = await runTrackingMatchReconcileJob(deps);
  assert.equal(res.ok, true);
  assert.equal(res.advancedLines, 0);
  assert.equal(calls.txOrgIds.length, 0);
  assert.equal(calls.transitions.length, 0);
  assert.equal(res.linkedExact, 0);
  assert.equal(res.linkedSuffix, 0);
  assert.equal(res.registered, 0);
  assert.equal(res.exceptions, 0);
});
