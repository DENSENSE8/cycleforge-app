/**
 * DB-free coverage for the durable listing-link writers. Every entry takes an
 * executor, so the fake below captures the SQL + params the module would run —
 * no Postgres, no tenancy pool.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createListingLink,
  deleteListingLink,
  listCartonListingLinks,
  reorderListingLinks,
  updateListingLink,
} from './listing-link-store';

const ORG = '00000000-0000-4000-8000-000000000001';

function fakeDb(rowsFor: (sql: string) => unknown[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    db: {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params: params ?? [] });
        return { rows: rowsFor(sql) } as never;
      },
    },
  };
}

const ROW = {
  id: '5',
  receiving_id: 42,
  receiving_line_id: null,
  href: 'https://www.ebay.com/itm/123456789012',
  label: 'Left speaker',
  source: 'manual',
  sort_order: 3,
  bound_by: null,
  bound_at: null,
};

test('list scopes to org + carton and orders by the buyer sequence', async () => {
  const { calls, db } = fakeDb(() => [ROW]);
  const links = await listCartonListingLinks(ORG, 42, db);
  assert.equal(links[0].id, 5);
  assert.match(calls[0].sql, /organization_id = \$1 AND receiving_id = \$2/);
  assert.match(calls[0].sql, /ORDER BY sort_order ASC/);
  assert.deepEqual(calls[0].params, [ORG, 42]);
});

test('create normalizes the href and appends to the end of the sequence', async () => {
  const { calls, db } = fakeDb(() => [ROW]);
  // fake: first call is the carton-ownership probe, second is the INSERT
  const res = await createListingLink(ORG, { receivingId: 42, href: '  ebay.com/itm/123456789012 ', label: ' Left speaker ' }, db);
  assert.equal(res.ok, true);
  assert.match(calls[0].sql, /FROM receiving_carton WHERE id = \$1 AND organization_id = \$2/);
  assert.match(calls[1].sql, /MAX\(sort_order\) \+ 1/);
  assert.equal(calls[1].params[3], 'https://ebay.com/itm/123456789012');
  assert.equal(calls[1].params[4], 'Left speaker');
  assert.equal(calls[1].params[5], 'manual');
});

test('create rejects a non-URL without touching the database', async () => {
  const { calls, db } = fakeDb(() => []);
  const res = await createListingLink(ORG, { receivingId: 42, href: 'not a url' }, db);
  assert.deepEqual(res, { ok: false, error: 'INVALID_HREF' });
  assert.equal(calls.length, 0);
});

test('create reports the carton-unique collision instead of silently upserting', async () => {
  // carton probe hits, INSERT ... ON CONFLICT DO NOTHING returns nothing
  const { db } = fakeDb((sql) => (/receiving_carton/.test(sql) ? [{ id: 42 }] : []));
  const res = await createListingLink(ORG, { receivingId: 42, href: 'https://www.ebay.com/itm/1' }, db);
  assert.deepEqual(res, { ok: false, error: 'DUPLICATE_HREF' });
});

test('create refuses a carton owned by another org', async () => {
  const { calls, db } = fakeDb(() => []);
  const res = await createListingLink(ORG, { receivingId: 42, href: 'https://www.ebay.com/itm/1' }, db);
  assert.deepEqual(res, { ok: false, error: 'CARTON_NOT_FOUND' });
  assert.equal(calls.length, 1, 'stops at the ownership probe — never reaches the INSERT');
});

test('binding a link to a line requires the staff who bound it', async () => {
  const { calls, db } = fakeDb(() => [ROW]);
  const res = await updateListingLink(ORG, { id: 5, receivingLineId: 9 }, db);
  assert.deepEqual(res, { ok: false, error: 'BIND_REQUIRES_STAFF' });
  assert.equal(calls.length, 0);
});

test('a bind stamps bound_by + bound_at; an unbind clears both', async () => {
  const bind = fakeDb(() => [ROW]);
  await updateListingLink(ORG, { id: 5, receivingLineId: 9, boundBy: 77 }, bind.db);
  assert.match(bind.calls[0].sql, /bound_at = now\(\)/);
  assert.ok(bind.calls[0].params.includes(77));

  const unbind = fakeDb(() => [ROW]);
  await updateListingLink(ORG, { id: 5, receivingLineId: null }, unbind.db);
  assert.match(unbind.calls[0].sql, /bound_at = NULL/);
});

test('an update with no fields is refused rather than writing updated_at', async () => {
  const { calls, db } = fakeDb(() => [ROW]);
  const res = await updateListingLink(ORG, { id: 5 }, db);
  assert.deepEqual(res, { ok: false, error: 'NOTHING_TO_UPDATE' });
  assert.equal(calls.length, 0);
});

test('update and delete report NOT_FOUND when the row is another org / gone', async () => {
  const upd = fakeDb(() => []);
  assert.deepEqual(await updateListingLink(ORG, { id: 5, label: 'x' }, upd.db), { ok: false, error: 'NOT_FOUND' });
  const del = fakeDb(() => []);
  assert.deepEqual(await deleteListingLink(ORG, 5, del.db), { ok: false, error: 'NOT_FOUND' });
  assert.match(del.calls[0].sql, /organization_id = \$1 AND id = \$2/);
});

test('reorder renumbers by ordinality and re-reads the carton', async () => {
  const { calls, db } = fakeDb((sql) => (/SELECT/.test(sql) ? [ROW] : []));
  const links = await reorderListingLinks(ORG, { receivingId: 42, orderedIds: [8, 5] }, db);
  assert.match(calls[0].sql, /WITH ORDINALITY/);
  assert.deepEqual(calls[0].params, [ORG, 42, [8, 5]]);
  assert.equal(links.length, 1);
});

test('reorder with no ids is a read, never an empty UPDATE', async () => {
  const { calls, db } = fakeDb(() => [ROW]);
  await reorderListingLinks(ORG, { receivingId: 42, orderedIds: [] }, db);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^\s*SELECT/);
});
