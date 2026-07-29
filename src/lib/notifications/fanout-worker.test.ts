import test from 'node:test';
import assert from 'node:assert/strict';
import type { QueryResult, QueryResultRow } from 'pg';
import { drainNotificationOutbox, type FanoutDeps } from './fanout-worker';

const ORG = '00000000-0000-4000-8000-000000000001';

interface Call {
  sql: string;
  params: readonly unknown[];
}

/**
 * DB-free fakes (house `Deps` pattern). Each fake matches on a SQL fragment so
 * a test can assert both the RETURN VALUE and what the worker actually threaded
 * into its collaborators — the part a pure return-value assertion would miss.
 */
function fakes(opts: {
  outboxRows?: Record<string, unknown>[];
  recipients?: { staff_id: number; subscription_id: number; reason: string }[];
  permissions?: Map<number, string[]>;
  /** Simulate an existing open row that absorbs the event. */
  collapseHits?: boolean;
}) {
  const ownerCalls: Call[] = [];
  const orgCalls: Call[] = [];

  const deps: FanoutDeps = {
    ownerQuery: async <T extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: readonly unknown[],
    ) => {
      ownerCalls.push({ sql, params: params ?? [] });
      const rows = sql.includes('RETURNING') ? (opts.outboxRows ?? []) : [];
      return { rows: rows as T[], rowCount: rows.length } as QueryResult<T>;
    },
    orgQuery: async <T extends QueryResultRow = QueryResultRow>(
      _orgId: string,
      sql: string,
      params?: readonly unknown[],
    ) => {
      orgCalls.push({ sql, params: params ?? [] });
      if (sql.includes('FROM staff_subscriptions')) {
        return {
          rows: (opts.recipients ?? []) as unknown as T[],
          rowCount: (opts.recipients ?? []).length,
        } as QueryResult<T>;
      }
      if (sql.includes('UPDATE staff_inbox_items')) {
        const n = opts.collapseHits ? 1 : 0;
        return { rows: [] as T[], rowCount: n } as QueryResult<T>;
      }
      // INSERT INTO staff_inbox_items
      return { rows: [] as T[], rowCount: 1 } as QueryResult<T>;
    },
    loadPermissions: async () => opts.permissions ?? new Map(),
    now: () => new Date('2026-07-28T12:00:00Z'),
  };

  return { deps, ownerCalls, orgCalls };
}

function outboxRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    organization_id: ORG,
    ops_event_id: 1001,
    entity_type: 'receiving',
    entity_id: 4412,
    event_key: 'receiving.carton.received',
    actor_staff_id: 9,
    client_event_id: null,
    payload: {},
    occurred_at: '2026-07-28T11:59:00Z',
    ...over,
  };
}

test('a non-notifiable event is consumed, not delivered', async () => {
  const { deps, orgCalls } = fakes({
    outboxRows: [outboxRow({ event_key: 'receiving.something.unknown' })],
  });
  const r = await drainNotificationOutbox({}, deps);

  assert.equal(r.claimed, 1);
  assert.equal(r.skippedNotNotifiable, 1);
  assert.equal(r.delivered, 0);
  // It must not even look for recipients — that is the cost saving that lets
  // the DB trigger stay dumb.
  assert.equal(orgCalls.length, 0);
});

test('the actor is never notified about their own action', async () => {
  const { deps, orgCalls } = fakes({
    outboxRows: [outboxRow({ actor_staff_id: 9 })],
    recipients: [{ staff_id: 9, subscription_id: 55, reason: 'acted' }],
    permissions: new Map([[9, ['receiving.view']]]),
  });
  const r = await drainNotificationOutbox({}, deps);

  assert.equal(r.delivered, 0);
  assert.ok(
    !orgCalls.some((c) => c.sql.includes('INSERT INTO staff_inbox_items')),
    'no inbox row should be written for the actor',
  );
});

test('a recipient without the entity view permission is filtered out', async () => {
  const { deps, orgCalls } = fakes({
    outboxRows: [outboxRow()],
    recipients: [{ staff_id: 3, subscription_id: 55, reason: 'manual' }],
    // Has SOME permission, but not receiving.view.
    permissions: new Map([[3, ['orders.view']]]),
  });
  const r = await drainNotificationOutbox({}, deps);

  assert.equal(r.delivered, 0);
  assert.ok(!orgCalls.some((c) => c.sql.includes('INSERT INTO staff_inbox_items')));
});

test('a permitted recipient gets one inbox row with the right dedup + collapse keys', async () => {
  const { deps, orgCalls } = fakes({
    outboxRows: [outboxRow({ client_event_id: 'ce-1' })],
    recipients: [{ staff_id: 3, subscription_id: 55, reason: 'manual' }],
    permissions: new Map([[3, ['receiving.view']]]),
  });
  const r = await drainNotificationOutbox({}, deps);

  assert.equal(r.delivered, 1);
  const insert = orgCalls.find((c) => c.sql.includes('INSERT INTO staff_inbox_items'));
  assert.ok(insert, 'expected an inbox insert');
  assert.ok(insert.params.includes('ce:ce-1'), 'dedup key should use client_event_id');
  assert.ok(insert.params.includes('receiving:4412:unbox'), 'collapse key should be carton-scoped');
  // ON CONFLICT is what makes a worker retry a no-op rather than a duplicate.
  assert.ok(insert.sql.includes('ON CONFLICT'), 'insert must be idempotent');
});

test('an event that folds into an open row collapses instead of inserting', async () => {
  const { deps, orgCalls } = fakes({
    outboxRows: [outboxRow()],
    recipients: [{ staff_id: 3, subscription_id: 55, reason: 'manual' }],
    permissions: new Map([[3, ['receiving.view']]]),
    collapseHits: true,
  });
  const r = await drainNotificationOutbox({}, deps);

  assert.equal(r.collapsed, 1);
  assert.equal(r.delivered, 0);
  assert.ok(!orgCalls.some((c) => c.sql.includes('INSERT INTO staff_inbox_items')));
});

test('the claim uses SKIP LOCKED and every processed row is marked', async () => {
  const { deps, ownerCalls } = fakes({
    outboxRows: [outboxRow()],
    recipients: [],
  });
  await drainNotificationOutbox({ batchSize: 25 }, deps);

  const claim = ownerCalls[0];
  // Without SKIP LOCKED two overlapping cron runs double-deliver the window.
  assert.ok(claim.sql.includes('FOR UPDATE SKIP LOCKED'));
  assert.ok(claim.sql.includes('attempts = attempts + 1'));
  assert.deepEqual(claim.params, [25]);

  assert.ok(
    ownerCalls.some((c) => c.sql.includes('processed_at = now()')),
    'the row must be marked processed or it redelivers forever',
  );
});

test('a failing row records the error and stays unprocessed for retry', async () => {
  const { deps, ownerCalls } = fakes({
    outboxRows: [outboxRow()],
    recipients: [{ staff_id: 3, subscription_id: 55, reason: 'manual' }],
    permissions: new Map([[3, ['receiving.view']]]),
  });
  // Make the inbox write blow up.
  const originalOrgQuery = deps.orgQuery;
  deps.orgQuery = (async (orgId: string, sql: string, params?: readonly unknown[]) => {
    if (sql.includes('INSERT INTO staff_inbox_items')) throw new Error('boom');
    return originalOrgQuery(orgId, sql, params);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  const r = await drainNotificationOutbox({}, deps);

  assert.equal(r.failed, 1);
  assert.equal(r.delivered, 0);
  const errCall = ownerCalls.find((c) => c.sql.includes('last_error = $2'));
  assert.ok(errCall, 'the error must be recorded');
  assert.equal(errCall.params[1], 'boom');
  assert.ok(
    !ownerCalls.some((c) => c.sql.includes('processed_at = now()')),
    'a failed row must stay pending so it retries',
  );
});

test('batch size is clamped to a sane range', async () => {
  const { deps, ownerCalls } = fakes({ outboxRows: [] });
  await drainNotificationOutbox({ batchSize: 9999 }, deps);
  assert.deepEqual(ownerCalls[0].params, [200]);
});
