/**
 * Unit tests for linkReturnedSerial — the shipped↔returned loop on the unbox
 * serial scan. DB-free: the transaction runner + every collaborator is injected,
 * and a fake client records the SQL issued so we can assert the linkage/promotion
 * decisions without a database.
 */

// Dummy connection string so importing the module's transitive pool deps
// (@/lib/db) doesn't complain — every DB call here is faked, none connects.
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';

import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { PriorOutbound } from '@/lib/neon/serial-units-queries';
import { getExternalUrlByItemNumber } from '@/utils/external-item-url';
import {
  linkReturnedSerial,
  importSalesOrderByNumber,
  logUnmatchedReturnSerial,
  type LogUnmatchedSerialDeps,
  type ReturnedSerialLinkDeps,
} from './returned-serial-link';

const ORG = '00000000-0000-0000-0000-000000000001' as unknown as OrgId;

type CartonRow = {
  source: string | null;
  zoho_purchaseorder_id: string | null;
  source_platform: string | null;
};

function basePrior(over: Partial<PriorOutbound> = {}): PriorOutbound {
  return {
    orderPk: 42,
    orderId: 'EBAY-123',
    itemNumber: '123456789012', // 12 digits → eBay /itm/
    accountSource: 'ebay',
    productTitle: 'Widget',
    sku: 'SKU1',
    condition: 'USED_A',
    trackingNumber: '1Z999',
    via: 'allocation',
    allocationState: 'SHIPPED',
    ...over,
  };
}

interface OrderRow {
  order_pk: number;
  order_id: string | null;
  item_number: string | null;
  account_source: string | null;
  product_title: string | null;
  sku: string | null;
  condition: string | null;
}

function makeDeps(opts: {
  prior?: PriorOutbound | null;
  carton?: CartonRow | null;
  allocFlipCount?: number;
  order?: OrderRow | null;
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const captured = {
    resolveCalled: 0,
    upsertReturn: [] as Array<Record<string, unknown>>,
    unboxUpserts: [] as Array<{ receivingId: number; patch: Record<string, unknown> }>,
    exceptionsResolved: [] as number[],
    events: [] as Array<Record<string, unknown>>,
    taps: [] as Array<Record<string, unknown>>,
    transitions: [] as Array<Record<string, unknown>>,
  };

  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM receiving_carton WHERE id')) {
        return { rows: opts.carton ? [opts.carton] : [], rowCount: opts.carton ? 1 : 0 };
      }
      if (sql.includes('FROM orders')) {
        return { rows: opts.order ? [opts.order] : [], rowCount: opts.order ? 1 : 0 };
      }
      if (sql.includes('UPDATE order_unit_allocations')) {
        return { rows: [], rowCount: opts.allocFlipCount ?? 0 };
      }
      // Linkage UPDATE returns the line's CURRENT status (pre-advance) so the
      // check-and-skip chokepoint gate sees an advanceable row.
      if (sql.includes('UPDATE receiving_line') && sql.includes('RETURNING workflow_status')) {
        return { rows: [{ workflow_status: 'MATCHED' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  const deps: ReturnedSerialLinkDeps = {
    runTransaction: (async (_org: OrgId, cb: (c: typeof client) => unknown) => cb(client)) as
      unknown as ReturnedSerialLinkDeps['runTransaction'],
    resolvePriorOutbound: (async () => {
      captured.resolveCalled++;
      return opts.prior ?? null;
    }) as unknown as ReturnedSerialLinkDeps['resolvePriorOutbound'],
    upsertReceivingLineReturn: (async (_o: OrgId, _line: number, fields: Record<string, unknown>) => {
      captured.upsertReturn.push(fields);
    }) as unknown as ReturnedSerialLinkDeps['upsertReceivingLineReturn'],
    resolveReceivingExceptionsByReceivingId: (async (rid: number) => {
      captured.exceptionsResolved.push(rid);
      return 1;
    }) as unknown as ReturnedSerialLinkDeps['resolveReceivingExceptionsByReceivingId'],
    recordInventoryEvent: (async (input: Record<string, unknown>) => {
      captured.events.push(input);
      return { id: 1 } as unknown;
    }) as unknown as ReturnedSerialLinkDeps['recordInventoryEvent'],
    listingUrlForItemNumber: (item) => getExternalUrlByItemNumber(item),
    upsertUnbox: (async (
      _client: unknown,
      _org: string,
      receivingId: number,
      patch: Record<string, unknown>,
    ) => {
      captured.unboxUpserts.push({ receivingId, patch });
    }) as unknown as ReturnedSerialLinkDeps['upsertUnbox'],
    transitionLine: (async (input: Record<string, unknown>) => {
      captured.transitions.push(input);
      return {
        ok: true,
        eventId: -1,
        from: 'MATCHED',
        to: input.to,
        changed: true,
        coarse: 'UNBOXED',
        receivingId: 5,
      };
    }) as unknown as ReturnedSerialLinkDeps['transitionLine'],
    tap: (async (args: Record<string, unknown>) => {
      captured.taps.push(args);
    }) as unknown as ReturnedSerialLinkDeps['tap'],
  };

  return { deps, calls, captured };
}

const INPUT = {
  serialUnitId: 7,
  normalizedSerial: 'ABC123',
  receivingLineId: 9,
  receivingId: 5,
  staffId: 3,
};

test('unfound carton + resolved v2 order → full link, allocation flip, promote', async () => {
  const { deps, calls, captured } = makeDeps({
    prior: basePrior(),
    carton: { source: 'unmatched', zoho_purchaseorder_id: null, source_platform: null },
    allocFlipCount: 1,
  });

  const res = await linkReturnedSerial(INPUT, ORG, deps);

  assert.equal(res.linked, true);
  assert.equal(res.allocationReturned, true);
  assert.equal(res.promotedToFound, true);
  assert.equal(res.matchedOrder?.order_id, 'EBAY-123');
  // Listing link built the shipped-details way (12-digit item → eBay /itm/).
  assert.equal(res.matchedOrder?.listing_url, 'https://www.ebay.com/itm/123456789012');

  // Allocation flipped only when state='SHIPPED' (idempotent close).
  assert.ok(
    calls.some((c) => c.sql.includes('UPDATE order_unit_allocations') && c.sql.includes("state = 'SHIPPED'")),
  );
  // Per-line source order persisted + typed RETURN. The linkage UPDATE must NOT
  // list workflow_status (Step D: lifecycle only via the chokepoint).
  assert.ok(calls.some((c) => c.sql.includes('UPDATE receiving_line') && c.sql.includes("receiving_type")));
  assert.ok(
    !calls.some((c) => c.sql.includes('UPDATE receiving_line') && /SET[\s\S]*workflow_status\s*=/.test(c.sql)),
  );
  // The return is advanced to UNBOXED (received) via transitionReceivingLine
  // (skipEvent — the RETURNED event is the richer record), and the carton is
  // stamped unboxed (off the scanned queue) via the receiving_unbox street
  // writer — NOT the spine (Wave-3 writer inversion).
  assert.equal(captured.transitions.length, 1);
  assert.equal(captured.transitions[0].to, 'UNBOXED');
  assert.equal(captured.transitions[0].skipEvent, true);
  assert.equal(captured.transitions[0].actorStaffId, 3);
  assert.equal(captured.unboxUpserts.length, 1);
  assert.equal(captured.unboxUpserts[0].receivingId, 5);
  assert.equal(captured.unboxUpserts[0].patch.unboxedAt, 'now');
  assert.equal(captured.unboxUpserts[0].patch.deriveIntakePath, true);
  assert.equal(captured.unboxUpserts[0].patch.unboxedBy, undefined);
  // The spine promo UPDATE no longer writes the moved unboxed_at column.
  assert.ok(!calls.some((c) => c.sql.includes('UPDATE receiving_carton') && c.sql.includes('unboxed_at')));
  // Carton promoted off the Unfound queue (the CASE flip is the tell).
  assert.ok(calls.some((c) => c.sql.includes("CASE WHEN source = 'unmatched'")));
  // Typed return fact written with the mapped platform + order.
  assert.equal(captured.upsertReturn.length, 1);
  assert.equal(captured.upsertReturn[0].returnPlatform, 'EBAY_USAV');
  assert.equal(captured.upsertReturn[0].sourceOrderId, 'EBAY-123');
  // Open exception cleared so the box leaves Unfound.
  assert.deepEqual(captured.exceptionsResolved, [5]);
  // Timeline marker recorded.
  assert.equal((captured.events[0]?.payload as Record<string, unknown>)?.return_link, true);
  // Studio tap fired once, after commit, with no disposition yet (parks at
  // the returns node rather than routing).
  assert.equal(captured.taps.length, 1);
  assert.equal(captured.taps[0].event, 'return_received');
  assert.equal(captured.taps[0].serialUnitId, 7);
  assert.equal(captured.taps[0].input, undefined);
});

test('real Zoho-PO carton → line source_order_id writes, carton never reclassified', async () => {
  const { deps, calls, captured } = makeDeps({
    prior: basePrior(),
    carton: { source: 'zoho_po', zoho_purchaseorder_id: 'PO-9', source_platform: 'ebay' },
    allocFlipCount: 1,
  });

  const res = await linkReturnedSerial(INPUT, ORG, deps);

  assert.equal(res.linked, true);
  assert.equal(res.allocationReturned, true);
  assert.equal(res.promotedToFound, false);
  assert.ok(calls.some((c) => c.sql.includes('UPDATE receiving_line') && c.sql.includes('source_order_id')));
  assert.ok(!calls.some((c) => c.sql.includes("CASE WHEN source = 'unmatched'")));
  assert.equal(captured.upsertReturn.length, 1);
  assert.equal(captured.upsertReturn[0].sourceOrderId, 'EBAY-123');
  assert.equal(captured.unboxUpserts.length, 0);
  assert.equal(captured.exceptionsResolved.length, 0);
  assert.ok(res.linePatch);
  assert.equal(res.linePatch?.receiving_type, 'RETURN');
});

test('no prior order resolved → flags is_return only, no order import', async () => {
  const { deps, calls, captured } = makeDeps({
    prior: null,
    carton: { source: 'unmatched', zoho_purchaseorder_id: null, source_platform: null },
    allocFlipCount: 0,
  });

  const res = await linkReturnedSerial({ ...INPUT, priorStatus: 'SHIPPED' }, ORG, deps);

  assert.equal(res.linked, false);
  assert.equal(res.matchedOrder, null);
  assert.equal(res.allocationReturned, false);
  // Carton flagged a return, but NOT promoted/imported (no order to import).
  // The is_return flag UPDATE stays on the spine (not a moved column).
  assert.ok(calls.some((c) => c.sql.includes('SET is_return = true, updated_at')));
  assert.ok(!calls.some((c) => c.sql.includes("CASE WHEN source = 'unmatched'")));
  assert.equal(captured.upsertReturn.length, 0);
  assert.equal(captured.unboxUpserts.length, 0); // no linkage → no unbox stamp
  assert.equal(captured.exceptionsResolved.length, 0);
  assert.equal(captured.events.length, 0);
  // Still a genuine physical return (status was already flipped upstream by
  // the attach upsert) even with no sales order resolved — tap fires either way.
  assert.equal(captured.taps.length, 1);
  assert.equal(captured.taps[0].event, 'return_received');
});

test('amazon ASIN order maps to AMZ platform + amazon listing url (tsn path)', async () => {
  const { deps, captured } = makeDeps({
    prior: basePrior({ orderId: 'AMZ-1', itemNumber: 'B0ABCDEFGH', accountSource: 'amazon', via: 'tsn' }),
    carton: { source: 'unmatched', zoho_purchaseorder_id: null, source_platform: null },
    allocFlipCount: 1,
  });

  const res = await linkReturnedSerial(INPUT, ORG, deps);

  assert.equal(res.matchedOrder?.listing_url, 'https://www.amazon.com/dp/B0ABCDEFGH');
  assert.equal(captured.upsertReturn[0].returnPlatform, 'AMZ');
  assert.equal(captured.upsertReturn[0].sourceOrderId, 'AMZ-1');
});

test('importSalesOrderByNumber: order# resolves → imports return, promotes, no alloc flip', async () => {
  const { deps, calls, captured } = makeDeps({
    order: {
      order_pk: 7,
      order_id: 'AMZ-9',
      item_number: 'B0XYZ12345',
      account_source: 'amazon',
      product_title: 'P',
      sku: 'S',
      condition: 'USED_A',
    },
    carton: { source: 'unmatched', zoho_purchaseorder_id: null, source_platform: null },
  });

  const res = await importSalesOrderByNumber(
    { orderNumber: 'amz-9', receivingLineId: 9, receivingId: 5, staffId: 3 },
    ORG,
    deps,
  );

  assert.equal(res.imported, true);
  assert.equal(res.promotedToFound, true);
  assert.equal(res.matchedOrder?.order_id, 'AMZ-9');
  assert.equal(res.matchedOrder?.via, 'order_number');
  assert.equal(res.matchedOrder?.listing_url, 'https://www.amazon.com/dp/B0XYZ12345');
  assert.equal(captured.upsertReturn[0].returnPlatform, 'AMZ');
  // No serial → no allocation flip on the order-number path.
  assert.ok(!calls.some((c) => c.sql.includes('UPDATE order_unit_allocations')));
  // Import stamps the carton unboxed via the street writer (same linkage core).
  assert.equal(captured.unboxUpserts.length, 1);
  assert.equal(captured.unboxUpserts[0].patch.unboxedAt, 'now');
  assert.deepEqual(captured.exceptionsResolved, [5]);
});

test('importSalesOrderByNumber: unknown order# → clean no-op (caller falls back to PO#)', async () => {
  const { deps, calls, captured } = makeDeps({
    order: null,
    carton: { source: 'unmatched', zoho_purchaseorder_id: null, source_platform: null },
  });

  const res = await importSalesOrderByNumber(
    { orderNumber: 'NOT-A-SALES-ORDER', receivingLineId: 9, receivingId: 5 },
    ORG,
    deps,
  );

  assert.equal(res.imported, false);
  assert.equal(res.matchedOrder, null);
  assert.ok(!calls.some((c) => c.sql.includes('UPDATE receiving_line')));
  assert.equal(captured.upsertReturn.length, 0);
});

// ── logUnmatchedReturnSerial — the carton's pairing question gets ANSWERED ────

function makeLogDeps() {
  const triageUpserts: Array<{ receivingId: number; patch: Record<string, unknown> }> = [];
  const deps: LogUnmatchedSerialDeps = {
    attachSerialToLine: (async () => ({
      serial_unit: { id: 2115, sku: null },
      is_new: true,
      already_attached: false,
    })) as unknown as LogUnmatchedSerialDeps['attachSerialToLine'],
    recordReceivingException: (async () => undefined) as unknown as
      LogUnmatchedSerialDeps['recordReceivingException'],
    runTransaction: (async (_org, cb) => cb({} as never)) as LogUnmatchedSerialDeps['runTransaction'],
    upsertSerialUnit: (async () => null) as unknown as LogUnmatchedSerialDeps['upsertSerialUnit'],
    recordInventoryEvent: (async () => null) as unknown as
      LogUnmatchedSerialDeps['recordInventoryEvent'],
    upsertReceivingTriage: (async (_client, _org, receivingId, patch) => {
      triageUpserts.push({ receivingId, patch: patch as Record<string, unknown> });
    }) as unknown as LogUnmatchedSerialDeps['upsertReceivingTriage'],
    emitSignal: (async () => undefined) as unknown as LogUnmatchedSerialDeps['emitSignal'],
  };
  return { deps, triageUpserts };
}

test('logUnmatchedReturnSerial: records WAIVED so the carton stops reading as UNFOUND', async () => {
  // Carton 50354 had NO receiving_triage row, so every reader fell through
  // COALESCE(rt.pairing_state,'UNFOUND') and a state nobody wrote read back as
  // a failed search — a permanent "No matched PO" on a return that cannot have one.
  const { deps, triageUpserts } = makeLogDeps();

  await logUnmatchedReturnSerial(
    { serialNumber: '049331f81860251ae', receivingLineId: 30654, receivingId: 50354 },
    ORG,
    deps,
  );

  assert.equal(triageUpserts.length, 1);
  assert.equal(triageUpserts[0]!.receivingId, 50354);
  assert.equal(triageUpserts[0]!.patch.pairingState, 'WAIVED');
  // Must never downgrade a carton already MATCHED to a real PO.
  assert.equal(triageUpserts[0]!.patch.preserveMatchedPairing, true);
  // Pairing is a different act from "Save for unbox" — do not claim triage done.
  assert.equal(triageUpserts[0]!.patch.triageComplete, undefined);
});

test('logUnmatchedReturnSerial: no carton id ⇒ no pairing write', async () => {
  const { deps, triageUpserts } = makeLogDeps();
  await logUnmatchedReturnSerial(
    { serialNumber: 'SN-1', receivingLineId: 1, receivingId: null },
    ORG,
    deps,
  );
  assert.equal(triageUpserts.length, 0);
});

test('logUnmatchedReturnSerial: a pairing-write failure never fails the scan', async () => {
  const { deps } = makeLogDeps();
  deps.upsertReceivingTriage = (async () => {
    throw new Error('triage table unavailable');
  }) as unknown as LogUnmatchedSerialDeps['upsertReceivingTriage'];

  const res = await logUnmatchedReturnSerial(
    { serialNumber: 'SN-1', receivingLineId: 1, receivingId: 5 },
    ORG,
    deps,
  );
  // The serial is already attached; bookkeeping must not undo that.
  assert.equal(res.serialUnitId, 2115);
  assert.equal(res.pairedToLine, true);
});
