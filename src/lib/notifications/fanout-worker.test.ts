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
  /** Simulate the idempotent retry: the row already exists, so nothing new. */
  insertConflicts?: boolean;
}) {
  const ownerCalls: Call[] = [];
  const orgCalls: Call[] = [];
  const pushes: { staffId: number; itemId: number; eventKey: string }[] = [];

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
      if (sql.includes('UPDATE staff_subscriptions')) {
        return { rows: [] as T[], rowCount: 1 } as QueryResult<T>;
      }
      // INSERT INTO staff_inbox_items — RETURNING id, which is what the live
      // push is keyed on. An empty RETURNING is the ON CONFLICT path.
      const inserted = opts.insertConflicts ? [] : [{ id: 900 }];
      return { rows: inserted as unknown as T[], rowCount: inserted.length } as QueryResult<T>;
    },
    loadPermissions: async () => opts.permissions ?? new Map(),
    publishInboxItem: async (args) => {
      pushes.push(args);
    },
    now: () => new Date('2026-07-28T12:00:00Z'),
  };

  return { deps, ownerCalls, orgCalls, pushes };
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

/* ── Rule-arm narrowing + pre-arrival watch lifecycle ──────────────────────── */

/** The narrowing facts the rule arm is asked to match, in bound-param order. */
function ruleArmFacts(orgCalls: Call[]): { sku: unknown; tracking: unknown } {
  const lookup = orgCalls.find((c) => c.sql.includes('FROM staff_subscriptions'));
  assert.ok(lookup, 'expected a recipient lookup');
  return { sku: lookup.params[4], tracking: lookup.params[5] };
}

test('the rule arm is narrowed by the event\'s own sku and tracking facts', async () => {
  const { deps, orgCalls } = fakes({
    outboxRows: [
      outboxRow({
        event_key: 'receiving.carton.arrived',
        // Typed with spaces and in lower case, as a paste or a wedge scan
        // arrives; a watch is stored canonical, so a raw compare would miss.
        payload: { sku: 'LEN-T480-i5', trackingNumber: '1z 999aa1 0123 4567 84' },
      }),
    ],
    recipients: [],
  });
  await drainNotificationOutbox({}, deps);

  assert.deepEqual(ruleArmFacts(orgCalls), {
    sku: 'LEN-T480-i5',
    tracking: '1Z999AA10123456784',
  });
});

test('an event carrying no tracking asks for no tracking rule', async () => {
  const { deps, orgCalls } = fakes({
    outboxRows: [outboxRow({ payload: {} })],
    recipients: [],
  });
  await drainNotificationOutbox({}, deps);

  // NULL is "don't care" on the SUBSCRIPTION side; on the EVENT side it must
  // mean "matches only rules that did not ask", which is what the NULL param
  // buys. A tracking watch firing on a carton with no number is the failure.
  assert.deepEqual(ruleArmFacts(orgCalls), { sku: null, tracking: null });
});

test('a fulfilled pre-arrival watch retires itself on arrival', async () => {
  const { deps, orgCalls } = fakes({
    outboxRows: [
      outboxRow({
        event_key: 'receiving.carton.arrived',
        payload: { trackingNumber: '1z 999aa1 0123 4567 84' },
      }),
    ],
    recipients: [{ staff_id: 3, subscription_id: 55, reason: 'manual' }],
    permissions: new Map([[3, ['receiving.view']]]),
  });
  const r = await drainNotificationOutbox({}, deps);

  assert.equal(r.delivered, 1);
  const retire = orgCalls.find((c) => c.sql.includes('UPDATE staff_subscriptions'));
  assert.ok(retire, 'the number landed — the watch must not wait for it again');
  assert.ok(retire.params.includes('1Z999AA10123456784'));
  // Entity follows are a standing relationship; only the rule arm is a
  // fulfilled prediction.
  assert.ok(retire.sql.includes("subscription_kind = 'rule'"));
});

test('the watch also retires when the watcher scanned it themselves', async () => {
  const { deps, orgCalls } = fakes({
    outboxRows: [
      outboxRow({
        event_key: 'receiving.carton.arrived',
        actor_staff_id: 3,
        payload: { trackingNumber: '1Z999AA10123456784' },
      }),
    ],
    // The only subscriber IS the actor, so nothing is delivered — but the
    // package still arrived, and a watch left live fires on the next reuse of
    // the number.
    recipients: [{ staff_id: 3, subscription_id: 55, reason: 'manual' }],
    permissions: new Map([[3, ['receiving.view']]]),
  });
  const r = await drainNotificationOutbox({}, deps);

  assert.equal(r.delivered, 0);
  assert.ok(orgCalls.some((c) => c.sql.includes('UPDATE staff_subscriptions')));
});

test('a non-arrival event never retires a watch', async () => {
  const { deps, orgCalls } = fakes({
    outboxRows: [
      outboxRow({
        event_key: 'receiving.carton.opened',
        payload: { trackingNumber: '1Z999AA10123456784' },
      }),
    ],
    recipients: [{ staff_id: 3, subscription_id: 55, reason: 'manual' }],
    permissions: new Map([[3, ['receiving.view']]]),
  });
  await drainNotificationOutbox({}, deps);

  assert.ok(
    !orgCalls.some((c) => c.sql.includes('UPDATE staff_subscriptions')),
    'only the arrival fulfils a pre-arrival watch',
  );
});

test('a delivered row is pushed live to its recipient', async () => {
  const { deps, pushes } = fakes({
    outboxRows: [
      outboxRow({
        event_key: 'receiving.carton.arrived',
        payload: { trackingNumber: '1Z999AA10123456784' },
      }),
    ],
    recipients: [{ staff_id: 3, subscription_id: 55, reason: 'rule' }],
    permissions: new Map([[3, ['receiving.view']]]),
  });
  await drainNotificationOutbox({}, deps);

  // Without this leg the row is written and the operator learns about their
  // package on the next window focus.
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].staffId, 3);
  assert.equal(pushes[0].itemId, 900);
  assert.equal(pushes[0].eventKey, 'receiving.carton.arrived');
});

test('a redelivered row is not pushed twice', async () => {
  const { deps, pushes } = fakes({
    outboxRows: [outboxRow()],
    recipients: [{ staff_id: 3, subscription_id: 55, reason: 'manual' }],
    permissions: new Map([[3, ['receiving.view']]]),
    // ON CONFLICT DO NOTHING — the row was already delivered on an earlier
    // attempt, so there is nothing new to announce.
    insertConflicts: true,
  });
  await drainNotificationOutbox({}, deps);

  assert.deepEqual(pushes, []);
});
