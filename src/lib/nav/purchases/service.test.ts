import test from 'node:test';
import assert from 'node:assert/strict';
import { NavPurchasesResponseSchema, type NavPurchasesResponse } from '@/lib/nav/context/schema';
import type { InboundLocateDeps } from '@/lib/nav/locate/inbound';
import type { CheckZohoReceivedLocal, CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { OrgId } from '@/lib/tenancy/constants';
import { foldPurchases, getNavPurchases, purchasesWindow, type NavPurchasesDeps, type NavPurchasesResult } from './service';
import type { PurchaseRow, PurchasesWindow } from './sql';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const CALLER = { orgId: ORG, permissions: new Set(['receiving.view']) };
const TODAY = '2026-10-05';

function row(patch: Partial<PurchaseRow> & Pick<PurchaseRow, 'ref'>): PurchaseRow {
  return {
    source: 'zoho',
    vendor: null,
    orderedOn: '2026-09-01',
    importedAt: null,
    inWindow: true,
    matchesFind: true,
    purchaseId: null,
    referenceNumber: null,
    trackings: [],
    equivalents: [],
    ...patch,
  };
}

const LOCAL: CheckZohoReceivedLocal = { known: true, delivered: false, delivered_at: null, scanned: false, unboxed: false, watch: 'unknown' as CheckZohoReceivedLocal['watch'] };

function checkRow(tracking: string, local: Partial<CheckZohoReceivedLocal>, patch: Partial<CheckZohoReceivedRow> = {}): CheckZohoReceivedRow {
  return {
    tracking,
    po_number: tracking,
    reference_number: null,
    vendor_name: 'Mirror vendor',
    status: 'issued',
    reason: 'matched',
    source: 'mirror',
    synced_at: null,
    local: { ...LOCAL, ...local },
    ...patch,
  };
}

function line(patch: Partial<ReceivingLineRow>): ReceivingLineRow {
  return { quantity_received: 0, quantity_expected: 1, ...patch } as unknown as ReceivingLineRow;
}

/** The window's purchases: an unboxed one, one in transit, one delivered and sealed (stalled: an exception), one awaiting tracking. */
const ROWS: PurchaseRow[] = [
  row({ ref: '64589584', orderedOn: '2026-09-20', importedAt: '2026-09-21T16:00:00.000Z' }),
  row({ ref: '64589585', orderedOn: '2026-09-10', importedAt: '2026-10-01T16:00:00.000Z' }),
  row({ ref: '64589586', orderedOn: '2026-09-30' }),
  row({ ref: '27-15150-59879', source: 'ebay', purchaseId: '27-15150-59879', orderedOn: '2026-08-02', importedAt: '2026-08-03T16:00:00.000Z' }),
];

const CHECK: Record<string, CheckZohoReceivedRow> = {
  '64589584': checkRow('64589584', { unboxed: true }),
  '64589585': checkRow('64589585', {}),
  '64589586': checkRow('64589586', { delivered: true, delivered_at: '2026-09-28T18:00:00Z' }),
  '27-15150-59879': checkRow('27-15150-59879', { known: false }, { reason: 'zoho_cap', status: null, po_number: null, vendor_name: null, source: null }),
};

const LINES: ReceivingLineRow[] = [
  line({ id: 1, zoho_purchaseorder_number: '64589584', vendor_name: 'Goodwill', item_name: 'Bose QC45', unboxed_at: '2026-09-25T17:00:00.000Z', unboxed_by_id: 7, unboxed_by_name: 'Kai', quantity_received: 1, is_delivered: true, delivered_at: '2026-09-24T17:00:00.000Z' }),
  line({ id: 2, zoho_purchaseorder_number: '64589585', vendor_name: 'Goodwill', item_name: 'Sonos One', tracking_number: '1Z999AA10123456784' }),
  line({ id: 3, zoho_purchaseorder_number: '64589586', vendor_name: 'Monoprice', item_name: 'Cable', delivery_state: 'STALLED', is_delivered: true, delivered_at: '2026-09-28T18:00:00.000Z' }),
  line({ id: 4, source_order_id: '27-15150-59879', platform_account_label: 'usav-ebay', item_name: 'Speaker', unboxed_at: '2026-09-02T17:00:00.000Z', unboxed_by_id: 9, unboxed_by_name: 'Tuan', quantity_received: 1 }),
];

interface Captured {
  purchases: Array<{ orgId: OrgId; window: PurchasesWindow; find: { text: string; key: string } | null }>;
  inboundOrgs: OrgId[];
  checked: string[][];
  lines: string[][];
}

function fakes(rows: PurchaseRow[] = ROWS) {
  const cap: Captured = { purchases: [], inboundOrgs: [], checked: [], lines: [] };
  const inbound: InboundLocateDeps = {
    check: async (refs) => {
      cap.checked.push([...refs]);
      return refs.flatMap((ref) => (CHECK[ref] ? [CHECK[ref]] : []));
    },
    lines: async (refs) => {
      cap.lines.push([...refs]);
      return LINES;
    },
    awaiting: async () => [line({ id: 2, zoho_purchaseorder_number: '64589585' })],
    followups: async () => [],
  };
  const deps: NavPurchasesDeps = {
    purchases: async (orgId, window, find) => {
      cap.purchases.push({ orgId, window, find });
      return rows;
    },
    inbound: (orgId) => {
      cap.inboundOrgs.push(orgId);
      return inbound;
    },
    today: () => TODAY,
  };
  return { deps, cap };
}

function body(result: NavPurchasesResult): NavPurchasesResponse {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  return NavPurchasesResponseSchema.parse(result.body);
}

const ask = (qs: string, deps: NavPurchasesDeps) => getNavPurchases(CALLER, new URLSearchParams(qs), deps);

test('purchases: gated by the Inbound ledger permission, nothing read without it', async () => {
  const { deps, cap } = fakes();
  const result = await getNavPurchases({ orgId: ORG, permissions: new Set(['orders.view']) }, new URLSearchParams(), deps);
  assert.deepEqual(result, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'receiving.view' });
  assert.equal(cap.purchases.length, 0);
});

test('purchases: a bad query is a 400, a blank param is unset', async () => {
  const { deps, cap } = fakes();
  for (const qs of ['from=2026-10-05&to=2026-10-01', 'sort=newest', 'axis=shipped', 'from=2026-02-30', 'status=nowhere']) {
    const result = await ask(qs, deps);
    assert.equal(result.ok, false, qs);
    assert.equal(!result.ok && result.status, 400, qs);
  }
  assert.equal(cap.purchases.length, 0);
  body(await ask('vendor=&source=&find=', deps));
  assert.equal(cap.purchases[0]!.find, null);
});

test('window: no bounds = the last 90 PT days on the axis, today included', () => {
  assert.deepEqual(purchasesWindow({ axis: 'ordered', from: undefined, to: undefined }, TODAY), {
    axis: 'ordered',
    fromDay: '2026-07-08',
    toDay: '2026-10-05',
    // PDT: a PT day starts at 07:00Z; the bound after `to` is exclusive.
    fromAt: '2026-07-08T07:00:00.000Z',
    toBefore: '2026-10-06T07:00:00.000Z',
  });
});

test('window: PT day edges follow the clock change; from=all drops the lower bound', () => {
  // 2026-11-01 is the day PDT ends: it starts at 07:00Z, the next day at 08:00Z (PST).
  assert.deepEqual(purchasesWindow({ axis: 'delivered', from: '2026-11-01', to: '2026-11-01' }, TODAY), {
    axis: 'delivered',
    fromDay: '2026-11-01',
    toDay: '2026-11-01',
    fromAt: '2026-11-01T07:00:00.000Z',
    toBefore: '2026-11-02T08:00:00.000Z',
  });
  assert.deepEqual(purchasesWindow({ axis: 'unboxed', from: 'all', to: undefined }, TODAY), {
    axis: 'unboxed',
    fromDay: null,
    toDay: null,
    fromAt: null,
    toBefore: null,
  });
  const upTo = purchasesWindow({ axis: 'ordered', from: 'all', to: '2026-03-08' }, TODAY);
  assert.equal(upTo.fromDay, null);
  // Spring forward: 2026-03-09 starts at 07:00Z (PDT).
  assert.equal(upTo.toBefore, '2026-03-09T07:00:00.000Z');
  // One bound only: open on the other side.
  assert.deepEqual(
    [purchasesWindow({ axis: 'ordered', from: '2026-09-01', to: undefined }, TODAY).toDay, purchasesWindow({ axis: 'ordered', from: undefined, to: '2026-09-01' }, TODAY).fromDay],
    [null, null],
  );
});

test('purchases: the window, axis, org and Find are threaded into the one enumeration read', async () => {
  const { deps, cap } = fakes();
  body(await ask('axis=unboxed&from=2026-09-01&to=2026-09-30&find=%20Goodwill%20', deps));
  assert.equal(cap.purchases.length, 1);
  const [read] = cap.purchases;
  assert.equal(read!.orgId, ORG);
  assert.deepEqual(read!.window, {
    axis: 'unboxed',
    fromDay: '2026-09-01',
    toDay: '2026-09-30',
    fromAt: '2026-09-01T07:00:00.000Z',
    toBefore: '2026-10-01T07:00:00.000Z',
  });
  assert.deepEqual(read!.find, { text: 'Goodwill', key: 'GOODWILL' });
  assert.deepEqual(cap.inboundOrgs, [ORG]);
  // `q` reads the same as `find`.
  body(await ask('q=15-15078', deps));
  assert.deepEqual(cap.purchases[1]!.find, { text: '15-15078', key: '1515078' });
});

test('purchases: only rows in the window AND the Find are located — one locate over their numbers', async () => {
  const { deps, cap } = fakes([
    ...ROWS,
    row({ ref: '70000001', inWindow: false }),
    row({ ref: '70000002', matchesFind: false }),
  ]);
  const answer = body(await ask('', deps));
  assert.equal(cap.checked.length, 1);
  assert.deepEqual(cap.checked[0], ['64589584', '64589585', '64589586', '27-15150-59879']);
  assert.deepEqual(cap.lines[0], cap.checked[0]);
  assert.equal(answer.total, 4);
});

test('purchases: each entry IS the locate answer for its number — status, detail, record, facts', async () => {
  const { deps } = fakes();
  const answer = body(await ask('', deps));
  const byRef = new Map(answer.entries.map((entry) => [entry.ref, entry]));
  assert.deepEqual(byRef.get('64589584')!.buckets, ['received']);
  assert.deepEqual(byRef.get('64589585')!.buckets, ['awaiting_tracking', 'not_received']);
  // Delivered by the carrier, never scanned or unboxed here: Delivered, not "not received".
  assert.deepEqual(byRef.get('64589586')!.buckets, ['delivered', 'exceptions']);
  // No ERP answer (our tables only): the eBay order's lines decide it.
  assert.deepEqual(byRef.get('27-15150-59879')!.buckets, ['received']);
  const unboxed = byRef.get('64589584')!;
  assert.equal(unboxed.recordHref, '/incoming?ref_in=64589584&openLine=1');
  assert.equal(unboxed.facts?.vendor, 'Goodwill');
  assert.deepEqual(unboxed.facts?.unboxedBy, { id: 7, name: 'Kai' });
  assert.equal(unboxed.facts?.deliveredAt, '2026-09-24T17:00:00.000Z');
  // The purchase's own dates ride its facts — the sheet's Ordered / Imported columns.
  assert.equal(unboxed.facts?.orderedOn, '2026-09-20');
  assert.equal(unboxed.facts?.importedAt, '2026-09-21T16:00:00.000Z');
});

test('purchases: bucket counts cover every filter but status; entries honour status', async () => {
  const { deps } = fakes();
  const all = body(await ask('', deps));
  const counts = Object.fromEntries(all.buckets.map((bucket) => [bucket.id, bucket.count]));
  assert.deepEqual(counts, { awaiting_tracking: 1, received: 2, not_received: 1, delivered: 1, exceptions: 1 });
  assert.deepEqual(all.buckets.map((bucket) => bucket.label), ['Awaiting tracking', 'Received', 'Not received', 'Delivered', 'Exceptions']);

  const received = body(await ask('status=received', deps));
  assert.deepEqual(received.buckets, all.buckets);
  assert.deepEqual(received.entries.map((entry) => entry.ref), ['64589584', '27-15150-59879']);
  assert.equal(received.total, 2);

  const goodwill = body(await ask('vendor=Goodwill&status=not_received', deps));
  assert.deepEqual(Object.fromEntries(goodwill.buckets.map((bucket) => [bucket.id, bucket.count])), {
    awaiting_tracking: 1,
    received: 1,
    not_received: 1,
    delivered: 0,
    exceptions: 0,
  });
  assert.deepEqual(goodwill.entries.map((entry) => entry.ref), ['64589585']);
});

test('purchases: source / vendor / unboxed-by filter the rows; each facet counts with the OTHER filters', async () => {
  const { deps } = fakes();
  const all = body(await ask('', deps));
  assert.deepEqual(all.facets, {
    vendors: [
      { value: 'Goodwill', label: 'Goodwill', count: 2 },
      { value: 'Monoprice', label: 'Monoprice', count: 1 },
      { value: 'usav-ebay', label: 'usav-ebay', count: 1 },
    ],
    sources: [
      { value: 'zoho', label: 'Zoho', count: 3 },
      { value: 'ebay', label: 'eBay', count: 1 },
    ],
    unboxedBy: [
      { id: 7, name: 'Kai', count: 1 },
      { id: 9, name: 'Tuan', count: 1 },
    ],
  });

  const ebay = body(await ask('source=ebay', deps));
  assert.deepEqual(ebay.entries.map((entry) => entry.ref), ['27-15150-59879']);
  // The source facet ignores its own filter; the others narrow to eBay.
  assert.deepEqual(ebay.facets.sources.map((option) => [option.value, option.count]), [['zoho', 3], ['ebay', 1]]);
  assert.deepEqual(ebay.facets.vendors, [{ value: 'usav-ebay', label: 'usav-ebay', count: 1 }]);
  assert.deepEqual(ebay.facets.unboxedBy, [{ id: 9, name: 'Tuan', count: 1 }]);

  const kai = body(await ask('unboxedBy=7', deps));
  assert.deepEqual(kai.entries.map((entry) => entry.ref), ['64589584']);
  assert.deepEqual(kai.facets.unboxedBy.map((option) => option.id), [7, 9]);
  assert.deepEqual(kai.facets.vendors, [{ value: 'Goodwill', label: 'Goodwill', count: 1 }]);
});

test('purchases: sorted server-side — newest order first by default, nulls last, dir flips', async () => {
  const { deps } = fakes();
  const refs = async (qs: string) => body(await ask(qs, deps)).entries.map((entry) => entry.ref);
  assert.deepEqual(await refs(''), ['64589586', '64589584', '64589585', '27-15150-59879']);
  assert.deepEqual(await refs('sort=ordered&dir=asc'), ['27-15150-59879', '64589585', '64589584', '64589586']);
  // Numbers order as numbers ("64589584" < "64589585"), never char by char across lengths.
  assert.deepEqual(await refs('sort=po'), ['27-15150-59879', '64589584', '64589585', '64589586']);
  // Most specific status first (exceptions › awaiting › not received › delivered › received); ties fall to the newest order.
  assert.deepEqual(await refs('sort=status'), ['64589586', '64589585', '64589584', '27-15150-59879']);
  // Delivered and not received, longest wait first; the rest after, newest order first.
  assert.deepEqual(await refs('sort=waiting'), ['64589586', '64589584', '64589585', '27-15150-59879']);
  // Imported, newest first; never stamped last either way.
  assert.deepEqual(await refs('sort=imported'), ['64589585', '64589584', '27-15150-59879', '64589586']);
  assert.deepEqual(await refs('sort=imported&dir=asc'), ['27-15150-59879', '64589584', '64589585', '64589586']);
  // Unboxed stamps, newest first; never-unboxed last either way.
  assert.deepEqual(await refs('sort=unboxed'), ['64589584', '27-15150-59879', '64589586', '64589585']);
  assert.deepEqual(await refs('sort=unboxed&dir=asc'), ['27-15150-59879', '64589584', '64589586', '64589585']);
  assert.deepEqual(await refs('sort=vendor'), ['64589584', '64589585', '64589586', '27-15150-59879']);
});

test('fold: one number is one purchase — two POs sharing a PO#, an eBay order whose id IS the PO#', () => {
  const folded = foldPurchases([
    row({ ref: '271516079713', purchaseId: 'po-a', orderedOn: '2026-09-01', importedAt: '2026-09-04T10:00:00.000Z', inWindow: false }),
    row({ ref: '27-15160-79713', source: 'ebay', purchaseId: '27-15160-79713', orderedOn: '2026-09-03', importedAt: '2026-09-03T10:00:00.000Z' }),
    row({ ref: '271516079713', purchaseId: 'po-b', orderedOn: '2026-09-02' }),
  ]);
  assert.equal(folded.length, 1);
  // The latest order date, the FIRST time any of its records landed.
  assert.deepEqual(folded[0], {
    ref: '271516079713',
    key: '271516079713',
    source: 'zoho',
    vendor: null,
    orderedOn: '2026-09-03',
    importedAt: '2026-09-03T10:00:00.000Z',
    inWindow: true,
    matchesFind: true,
  });
});

test('fold: a recorded equivalence folds into the better-ranked record, through a chain', () => {
  const folded = foldPurchases([
    row({ ref: '64000001', purchaseId: '5623409000003519027', inWindow: false }),
    row({ ref: '04-15131-00982', source: 'ebay', purchaseId: '04-15131-00982', equivalents: ['zoho:5623409000003519027', 'manual:M-1'] }),
    row({ ref: 'M-1', source: 'manual', purchaseId: 'M-1', equivalents: ['ebay:04-15131-00982'], matchesFind: true }),
  ]);
  assert.deepEqual(folded.map((purchase) => [purchase.ref, purchase.inWindow]), [['64000001', false]]);
});

test('fold: an eBay order matchZohoPo pairs with a PO folds into it — by tracking last-8 or order# = Reference#', () => {
  const folded = foldPurchases([
    row({ ref: '65000001', purchaseId: 'po-1', referenceNumber: '9434608106245533522453', matchesFind: false }),
    row({ ref: '65000002', purchaseId: 'po-2', referenceNumber: '12-34567-89012' }),
    // Same package (last 8 digits of the tracking), different numbers.
    row({ ref: '05-15006-11313', source: 'ebay', purchaseId: '05-15006-11313', trackings: ['9400100000000033522453'], matchesFind: true }),
    // The PO's Reference# names the eBay order.
    row({ ref: '12-34567-89012', source: 'ebay', purchaseId: '12-34567-89012' }),
    // Nothing pairs it: its own purchase.
    row({ ref: '23-14979-54443', source: 'ebay', purchaseId: '23-14979-54443', trackings: ['9434608106245465408122'] }),
  ]);
  assert.deepEqual(
    folded.map((purchase) => [purchase.ref, purchase.source, purchase.matchesFind]),
    [
      // A folded order still answers the Find for its purchase.
      ['65000001', 'zoho', true],
      ['65000002', 'zoho', true],
      ['23-14979-54443', 'ebay', true],
    ],
  );
});

test('purchases: a twin never shows twice — the located numbers are the folded ones', async () => {
  const { deps, cap } = fakes([
    row({ ref: '64589584', purchaseId: 'po-1', referenceNumber: '1Z999AA10123456784' }),
    row({ ref: '27-15150-59879', source: 'ebay', purchaseId: '27-15150-59879', trackings: ['1Z999AA10123456784'] }),
  ]);
  const answer = body(await ask('', deps));
  assert.deepEqual(cap.checked[0], ['64589584']);
  assert.deepEqual(answer.entries.map((entry) => entry.ref), ['64589584']);
  assert.deepEqual(answer.facets.sources, [{ value: 'zoho', label: 'Zoho', count: 1 }]);
});
