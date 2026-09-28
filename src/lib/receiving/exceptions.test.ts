import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordReceivingException,
  listReceivingLineExceptions,
  recordTicketReason,
  resolveReceivingExceptions,
  type ReceivingExceptionsDeps,
} from './exceptions';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = 'org-1' as unknown as OrgId;

function fakes(updateRows: Array<{ id: number }> = []) {
  const calls: Array<{ orgId: unknown; sql: string; params: unknown[] }> = [];
  const deps: ReceivingExceptionsDeps = {
    query: (async (orgId: unknown, sql: string, params: unknown[]) => {
      calls.push({ orgId, sql, params });
      if (/INSERT INTO receiving_exceptions/.test(sql)) return { rows: [{ id: 555 }] };
      if (/UPDATE receiving_exceptions/.test(sql)) return { rows: updateRows };
      return { rows: [{ id: 1 }] };
    }) as unknown as ReceivingExceptionsDeps['query'],
  };
  return { deps, calls };
}

test('recordReceivingException inserts an org-scoped row with all fields', async () => {
  const { deps, calls } = fakes();
  const r = await recordReceivingException(
    ORG,
    { receivingLineId: 7, receivingId: 42, exceptionCode: 'DAMAGED', reason: 'dent', createdBy: 9 },
    deps,
  );
  assert.equal(r.id, 555);
  assert.match(calls[0].sql, /INSERT INTO receiving_exceptions/);
  assert.equal(calls[0].orgId, ORG);
  assert.deepEqual(calls[0].params, [ORG, 7, 42, 'DAMAGED', 'dent', null, null, 9]);
});

test('recordReceivingException defaults optional fields to null', async () => {
  const { deps, calls } = fakes();
  await recordReceivingException(ORG, { receivingLineId: 5, exceptionCode: 'PROBLEM' }, deps);
  assert.deepEqual(calls[0].params, [ORG, 5, null, 'PROBLEM', null, null, null, null]);
});

test('listReceivingLineExceptions queries newest-first scoped to org+line', async () => {
  const { deps, calls } = fakes();
  await listReceivingLineExceptions(ORG, 7, deps);
  assert.match(calls[0].sql, /ORDER BY created_at DESC/);
  assert.deepEqual(calls[0].params, [ORG, 7]);
});

test('resolveReceivingExceptions returns the resolved count + threads the code filter', async () => {
  const { deps, calls } = fakes([{ id: 1 }, { id: 2 }]);
  const n = await resolveReceivingExceptions(ORG, 7, { exceptionCode: 'DAMAGED', resolvedBy: 3 }, deps);
  assert.equal(n, 2);
  assert.deepEqual(calls[0].params, [ORG, 7, 3, 'DAMAGED']);
});

/** A fake DB for the ticket-reason writer: the carton's order fact, and whether an OPEN row for the ticket already exists. */
function reasonFakes(opts: { hasOrder: boolean; openRowExists: boolean }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const deps: ReceivingExceptionsDeps = {
    query: (async (_orgId: unknown, sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (/FROM receiving_carton/.test(sql)) return { rows: [{ has_order: opts.hasOrder }] };
      if (/INSERT INTO receiving_exceptions/.test(sql)) return { rows: [{ id: 900 }] };
      if (/UPDATE receiving_exceptions/.test(sql)) return { rows: opts.openRowExists ? [{ id: 1 }] : [] };
      return { rows: [] };
    }) as unknown as ReceivingExceptionsDeps['query'],
    emitSignal: (async () => undefined) as unknown as ReceivingExceptionsDeps['emitSignal'],
  };
  const inserts = () => calls.filter((c) => /INSERT INTO receiving_exceptions/.test(c.sql));
  return { deps, calls, inserts };
}

test('recordTicketReason: an unfound carton-level ticket records one carton-level NO_PO row', async () => {
  const { deps, inserts } = reasonFakes({ hasOrder: false, openRowExists: false });
  const code = await recordTicketReason(ORG, { receivingId: 42, lineId: null, claimType: 'unfound', ticketNumber: '10066', staffId: 3 }, deps);
  assert.equal(code, 'NO_PO');
  assert.equal(inserts().length, 1);
  // [org, line, carton, code, reason, notes, ticket, by] — no line, the ticket normalised to "#…".
  assert.deepEqual(inserts()[0].params, [ORG, null, 42, 'NO_PO', null, null, '#10066', 3]);
});

test('recordTicketReason: re-filing the same ticket under another type re-codes it, never a second row', async () => {
  const { deps, calls, inserts } = reasonFakes({ hasOrder: true, openRowExists: true });
  const code = await recordTicketReason(ORG, { receivingId: 42, lineId: 7, claimType: 'damage', ticketNumber: '#5', staffId: null }, deps);
  assert.equal(code, 'DAMAGED');
  assert.equal(inserts().length, 0);
  const recode = calls.find((c) => /SET exception_code/.test(c.sql));
  assert.deepEqual(recode?.params, [ORG, '#5', 7, 42, 'DAMAGED']);
});

test('recordTicketReason: a routing type (or a return that has its order) records nothing and closes a prior reason', async () => {
  for (const claimType of ['return_to_sender', 'return'] as const) {
    const { deps, calls, inserts } = reasonFakes({ hasOrder: true, openRowExists: true });
    const code = await recordTicketReason(ORG, { receivingId: 42, lineId: 7, claimType, ticketNumber: '#5', staffId: 3 }, deps);
    assert.equal(code, null, claimType);
    assert.equal(inserts().length, 0, claimType);
    assert.ok(calls.some((c) => /SET status = 'RESOLVED'/.test(c.sql)), claimType);
  }
});
