import test from 'node:test';
import assert from 'node:assert/strict';
import type { QueryResult, QueryResultRow } from 'pg';
import { promoteWatchedArrival, type WatchedArrivalDeps } from './watched-arrival';

const ORG = '00000000-0000-4000-8000-000000000001' as never;

/**
 * DB-free fakes (house `Deps` pattern). The door's promise is behavioural, not
 * textual: a watched box is flagged urgent AND its scanner is told, and an
 * unwatched box costs neither write nor push.
 */
function fakes(opts: { watchers?: number; urgentWritten?: boolean }) {
  const lookups: { params: readonly unknown[] }[] = [];
  const urgentCalls: number[] = [];
  const alerts: { staffId: number; trackingNumber: string; watcherCount: number }[] = [];

  const deps: WatchedArrivalDeps = {
    query: async <T extends QueryResultRow = QueryResultRow>(
      _orgId: string,
      _sql: string,
      params?: readonly unknown[],
    ) => {
      lookups.push({ params: params ?? [] });
      const rows = [{ watchers: opts.watchers ?? 0 }];
      return { rows: rows as unknown as T[], rowCount: 1 } as QueryResult<T>;
    },
    markUrgent: async (receivingId) => {
      urgentCalls.push(receivingId);
      return opts.urgentWritten ?? true;
    },
    alertScanner: async (args) => {
      alerts.push({
        staffId: args.staffId,
        trackingNumber: args.trackingNumber,
        watcherCount: args.watcherCount,
      });
    },
  };

  return { deps, lookups, urgentCalls, alerts };
}

test('an unwatched arrival changes nothing', async () => {
  const { deps, urgentCalls, alerts } = fakes({ watchers: 0 });

  const r = await promoteWatchedArrival(
    { orgId: ORG, receivingId: 4412, trackingNumber: '1Z999AA10123456784', scannedByStaffId: 7 },
    deps,
  );

  assert.deepEqual(r, { watched: false, watcherCount: 0, promotedUrgent: false });
  // Most cartons are nobody's. Flagging them urgent would make urgent mean
  // nothing, and toasting would train the door to ignore the toast.
  assert.deepEqual(urgentCalls, []);
  assert.deepEqual(alerts, []);
});

test('a watched arrival is flagged urgent and its scanner is told', async () => {
  const { deps, urgentCalls, alerts } = fakes({ watchers: 2 });

  const r = await promoteWatchedArrival(
    { orgId: ORG, receivingId: 4412, trackingNumber: '1Z999AA10123456784', scannedByStaffId: 7 },
    deps,
  );

  assert.deepEqual(r, { watched: true, watcherCount: 2, promotedUrgent: true });
  assert.deepEqual(urgentCalls, [4412]);
  assert.deepEqual(alerts, [
    { staffId: 7, trackingNumber: '1Z999AA10123456784', watcherCount: 2 },
  ]);
});

test('the watch is matched on the canonical number, not the keystrokes', async () => {
  const { deps, lookups, alerts } = fakes({ watchers: 1 });

  await promoteWatchedArrival(
    { orgId: ORG, receivingId: 4412, trackingNumber: '1z 999aa1 0123 4567 84', scannedByStaffId: 7 },
    deps,
  );

  // A watch is stored canonical. Comparing raw would miss every wedge scan
  // that arrives with spaces or lower case — i.e. most of them.
  assert.equal(lookups[0].params[1], '1Z999AA10123456784');
  assert.equal(alerts[0].trackingNumber, '1Z999AA10123456784');
});

test('an already-urgent carton still alerts the operator holding it', async () => {
  const { deps, alerts } = fakes({ watchers: 1, urgentWritten: false });

  const r = await promoteWatchedArrival(
    { orgId: ORG, receivingId: 4412, trackingNumber: '1Z999AA10123456784', scannedByStaffId: 7 },
    deps,
  );

  // The flag is idempotent, the news is not: this operator is holding the box
  // now, whatever a previous scan already wrote.
  assert.equal(r.promotedUrgent, false);
  assert.equal(alerts.length, 1);
});

test('an unattributed door scan promotes without a phantom recipient', async () => {
  const { deps, urgentCalls, alerts } = fakes({ watchers: 1 });

  const r = await promoteWatchedArrival(
    {
      orgId: ORG,
      receivingId: 4412,
      trackingNumber: '1Z999AA10123456784',
      scannedByStaffId: null,
    },
    deps,
  );

  assert.equal(r.watched, true);
  assert.deepEqual(urgentCalls, [4412]);
  assert.deepEqual(alerts, []);
});
