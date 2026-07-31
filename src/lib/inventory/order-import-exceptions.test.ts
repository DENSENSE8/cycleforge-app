/**
 * DB-free unit tests for order-import-exceptions — exercises enqueue / ignore /
 * resolve through injected fakes (no Postgres).
 *
 *   node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     src/lib/inventory/order-import-exceptions.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { FIXED_COL_INDICES_DEFAULT } from '@/lib/orders/sources/google-sheet-rows';
import {
  enqueueImportExceptionsForImport,
  ignoreImportException,
  listOpenImportExceptions,
  resolveImportException,
  type EnqueueImportExceptionInput,
  type ImportExceptionDeps,
} from './order-import-exceptions';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

interface QueryCall {
  sql: string;
  params: unknown[];
}

function baseInput(
  overrides: Partial<EnqueueImportExceptionInput> = {},
): EnqueueImportExceptionInput {
  return {
    accountOrderId: 'ORD-1',
    accountSource: 'eBay',
    productTitle: 'Bose Wave Radio',
    tracking: '1Z999AA10123456784',
    sheetRow: 2,
    rawRow: ['', 'ORD-1', '', 'Bose Wave Radio', '1', '', '', '1Z999AA10123456784', '', 'eBay'],
    colIndices: FIXED_COL_INDICES_DEFAULT,
    ...overrides,
  };
}

function fakes(opts: {
  selectRow?: {
    id: number;
    status: string;
    raw_row: unknown[];
    col_indices: typeof FIXED_COL_INDICES_DEFAULT;
  } | null;
  ignoreReturning?: boolean;
  resolveUpdateReturning?: boolean;
  listRows?: QueryResultRow[];
  listTotal?: number;
  ingestOrderIds?: number[];
} = {}) {
  const queries: QueryCall[] = [];
  const ingestCalls: Array<{ lines: unknown[]; opts: { orgId: OrgId; source: string } }> = [];
  const invalidateCalls: Array<{ orgId: OrgId; tags: string[] }> = [];
  let txOrg: OrgId | null = null;

  const deps: ImportExceptionDeps = {
    query: (async (_orgId, sql, params = []) => {
      queries.push({ sql, params: [...params] });
      if (/INSERT INTO order_import_exceptions/i.test(sql)) {
        return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as QueryResult;
      }
      if (/SET status = 'ignored'/i.test(sql)) {
        return {
          rows: opts.ignoreReturning === false ? [] : [{ id: params[0] }],
          rowCount: opts.ignoreReturning === false ? 0 : 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        } as QueryResult;
      }
      if (/SELECT id, status, raw_row, col_indices/i.test(sql)) {
        const row = opts.selectRow === undefined
          ? {
              id: 7,
              status: 'open',
              raw_row: ['', 'ORD-1', '', 'Bose Wave Radio', '1', '', '', '1Z999', '', 'eBay'],
              col_indices: FIXED_COL_INDICES_DEFAULT,
            }
          : opts.selectRow;
        return {
          rows: row ? [row] : [],
          rowCount: row ? 1 : 0,
          command: 'SELECT',
          oid: 0,
          fields: [],
        } as QueryResult;
      }
      if (/COUNT\(\*\)/i.test(sql)) {
        return {
          rows: [{ total: opts.listTotal ?? (opts.listRows?.length ?? 0) }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        } as QueryResult;
      }
      if (/FROM order_import_exceptions/i.test(sql) && /status = 'open'/i.test(sql)) {
        return {
          rows: opts.listRows ?? [],
          rowCount: (opts.listRows ?? []).length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        } as QueryResult;
      }
      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] } as QueryResult;
    }) as ImportExceptionDeps['query'],
    withTx: async (orgId, fn) => {
      txOrg = orgId;
      const fakeClient: Pick<PoolClient, 'query'> = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query: (async (sql: string, params: unknown[] = []) => {
          queries.push({ sql, params });
          if (/SET status = 'resolved'/i.test(sql)) {
            const ok = opts.resolveUpdateReturning !== false;
            return { rows: ok ? [{ id: params[2] }] : [] };
          }
          return { rows: [] };
        }) as PoolClient['query'],
      };
      return fn(fakeClient);
    },
    ingest: async (lines, ingestOpts) => {
      ingestCalls.push({ lines, opts: ingestOpts });
      return { insertedOrderIds: opts.ingestOrderIds ?? [42] };
    },
    invalidate: async (orgId, tags) => {
      invalidateCalls.push({ orgId, tags });
    },
  };

  return { deps, queries, ingestCalls, invalidateCalls, getTxOrg: () => txOrg };
}

describe('enqueueImportExceptionsForImport', () => {
  it('returns 0 and issues no query for an empty batch', async () => {
    const f = fakes();
    const n = await enqueueImportExceptionsForImport(ORG, [], f.deps);
    assert.equal(n, 0);
    assert.equal(f.queries.length, 0);
  });

  it('skips blank accountOrderId', async () => {
    const f = fakes();
    const n = await enqueueImportExceptionsForImport(
      ORG,
      [baseInput({ accountOrderId: '  ' })],
      f.deps,
    );
    assert.equal(n, 0);
    assert.equal(f.queries.length, 0);
  });

  it('merges duplicate keys last-write-wins and upserts once', async () => {
    const f = fakes();
    const n = await enqueueImportExceptionsForImport(
      ORG,
      [
        baseInput({ productTitle: 'First' }),
        baseInput({ productTitle: 'Second' }),
      ],
      f.deps,
    );
    assert.equal(n, 1);
    assert.equal(f.queries.length, 1);
    assert.match(f.queries[0]!.sql, /WHERE order_import_exceptions\.status = 'open'/);
    assert.equal(f.queries[0]!.params[3], 'Second');
  });

  it('upsert SQL refuses to reopen resolved/ignored rows', async () => {
    const f = fakes();
    await enqueueImportExceptionsForImport(ORG, [baseInput()], f.deps);
    assert.match(f.queries[0]!.sql, /WHERE order_import_exceptions\.status = 'open'/);
    assert.ok(!/SET status = 'open'/i.test(f.queries[0]!.sql));
  });
});

describe('listOpenImportExceptions', () => {
  it('clamps limit/offset and maps camelCase rows', async () => {
    const first = new Date('2026-07-01T12:00:00Z');
    const last = new Date('2026-07-30T12:00:00Z');
    const f = fakes({
      listRows: [
        {
          id: 9,
          account_order_id: 'ORD-9',
          account_source: 'eBay',
          product_title: 'Title',
          tracking: '1Z',
          status: 'open',
          sheet_row: 4,
          resolved_item_number: null,
          resolved_order_id: null,
          seen_count: 3,
          first_seen_at: first,
          last_seen_at: last,
        },
      ],
      listTotal: 1,
    });
    const { rows, total } = await listOpenImportExceptions(
      ORG,
      { limit: 9999, offset: -5, q: 'bose' },
      f.deps,
    );
    assert.equal(total, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, 9);
    assert.equal(rows[0]!.accountOrderId, 'ORD-9');
    assert.equal(rows[0]!.seenCount, 3);
    assert.equal(rows[0]!.firstSeenAt, first.toISOString());

    const listQ = f.queries.find((q) => /LIMIT \$2 OFFSET \$3/i.test(q.sql));
    assert.ok(listQ);
    assert.equal(listQ!.params[1], 500);
    assert.equal(listQ!.params[2], 0);
    assert.match(listQ!.sql, /ILIKE \$4/);
  });
});

describe('ignoreImportException', () => {
  it('returns ok when a row is updated', async () => {
    const f = fakes({ ignoreReturning: true });
    const res = await ignoreImportException(ORG, 11, f.deps);
    assert.deepEqual(res, { ok: true });
    assert.match(f.queries[0]!.sql, /status = 'open'/);
  });

  it('returns 404 when no open row matches', async () => {
    const f = fakes({ ignoreReturning: false });
    const res = await ignoreImportException(ORG, 11, f.deps);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.status, 404);
  });
});

describe('resolveImportException', () => {
  it('rejects a blank Item Number', async () => {
    const f = fakes();
    const res = await resolveImportException(ORG, { id: 7, itemNumber: '  ' }, f.deps);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.status, 400);
    assert.equal(f.queries.length, 0);
  });

  it('returns 404 when the exception is missing', async () => {
    const f = fakes({ selectRow: null });
    const res = await resolveImportException(ORG, { id: 7, itemNumber: '123' }, f.deps);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.status, 404);
  });

  it('returns 409 when the exception is not open', async () => {
    const f = fakes({
      selectRow: {
        id: 7,
        status: 'ignored',
        raw_row: [],
        col_indices: FIXED_COL_INDICES_DEFAULT,
      },
    });
    const res = await resolveImportException(ORG, { id: 7, itemNumber: '123' }, f.deps);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.status, 409);
  });

  it('returns 409 when itemNumber column index is absent', async () => {
    const f = fakes({
      selectRow: {
        id: 7,
        status: 'open',
        raw_row: ['x'],
        col_indices: { ...FIXED_COL_INDICES_DEFAULT, itemNumber: -1 },
      },
    });
    const res = await resolveImportException(ORG, { id: 7, itemNumber: '123' }, f.deps);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.status, 409);
  });

  it('splices the Item Number, ingests via the sheet path, and marks resolved', async () => {
    const raw = ['', 'ORD-1', '', 'Bose Wave Radio', '1', '', '', '1Z999', '', 'eBay'];
    const f = fakes({
      selectRow: {
        id: 7,
        status: 'open',
        raw_row: raw,
        col_indices: FIXED_COL_INDICES_DEFAULT,
      },
      ingestOrderIds: [99],
    });
    const res = await resolveImportException(ORG, { id: 7, itemNumber: '  ITEM-42  ' }, f.deps);
    assert.deepEqual(res, { ok: true, orderId: 99 });

    assert.equal(f.ingestCalls.length, 1);
    assert.equal(f.ingestCalls[0]!.opts.source, 'review-import-exception');
    assert.equal(f.ingestCalls[0]!.opts.orgId, ORG);
    const line = f.ingestCalls[0]!.lines[0] as { itemNumber?: string };
    assert.equal(line.itemNumber, 'ITEM-42');

    const update = f.queries.find((q) => /SET status = 'resolved'/i.test(q.sql));
    assert.ok(update);
    assert.match(update!.sql, /AND status = 'open'/);
    assert.deepEqual(update!.params, ['ITEM-42', 99, 7, ORG]);
    assert.equal(f.getTxOrg(), ORG);
    assert.equal(f.invalidateCalls.length, 1);
  });

  it('returns 409 when the resolve UPDATE races and finds no open row', async () => {
    const f = fakes({ resolveUpdateReturning: false });
    const res = await resolveImportException(ORG, { id: 7, itemNumber: 'ITEM' }, f.deps);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.status, 409);
  });
});
