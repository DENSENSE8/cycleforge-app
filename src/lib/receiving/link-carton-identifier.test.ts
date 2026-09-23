/**
 * linkCartonIdentifier — DB-free unit tests.
 *
 * The contract an operator depends on: ANY id links, a resolvable id imports
 * that order's items, and an unresolvable id is recorded WITHOUT claiming the
 * carton is a matched Zoho PO.
 *
 * Run: `tsx --test src/lib/receiving/link-carton-identifier.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linkCartonIdentifier,
  normalizeIdentifierKey,
  type LinkCartonIdentifierDeps,
  type ResolvedPurchaseOrder,
} from '@/lib/receiving/link-carton-identifier';
import type { OrgId } from '@/lib/tenancy/constants';
import type { RelinkPoInput, RelinkPoResult } from '@/lib/receiving/relink-po';
import type { PurchaseLinkRow, UpsertPurchaseLinkInput } from '@/lib/inbound/purchase-links';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

interface Captured {
  text: string;
  params: unknown[];
}
function fakes(opts: {
  cartonExists?: boolean;
  resolved?: ResolvedPurchaseOrder | null;
  relinkResult?: Partial<RelinkPoResult>;
  existingLinks?: PurchaseLinkRow[];
  salesOrderImported?: boolean;
}) {
  const queries: Captured[] = [];
  const relinkCalls: RelinkPoInput[] = [];
  const salesOrderCalls: string[] = [];
  const linkCalls: UpsertPurchaseLinkInput[] = [];
  const cartonExists = opts.cartonExists ?? true;

  const deps: LinkCartonIdentifierDeps = {
    runTx: async (_org, fn) =>
      fn({
        query: async (text: string, params: unknown[] = []) => {
          queries.push({ text, params });
          if (/FROM receiving_carton/.test(text)) {
            return cartonExists
              ? { rows: [{ id: params[0] }], rowCount: 1 }
              : { rows: [], rowCount: 0 };
          }
          return { rows: [], rowCount: 1 };
        },
      }),
    resolvePurchaseOrder: async () => opts.resolved ?? null,
    relink: (async (input: RelinkPoInput) => {
      relinkCalls.push(input);
      return {
        ok: true,
        status: 200,
        receivingId: input.receivingId,
        linesUpdated: 1,
        poId: input.zohoPurchaseorderId,
        poNumber: input.zohoPurchaseorderNumber ?? null,
        linesImported: 3,
        ...opts.relinkResult,
      } as RelinkPoResult;
    }) as LinkCartonIdentifierDeps['relink'],
    importSalesOrder: (async (input: { orderNumber: string }) => {
      salesOrderCalls.push(input.orderNumber);
      return {
        imported: opts.salesOrderImported === true,
        promotedToFound: opts.salesOrderImported === true,
        matchedOrder: opts.salesOrderImported === true ? { order_id: input.orderNumber } : null,
        linePatch: null,
      };
    }) as unknown as LinkCartonIdentifierDeps['importSalesOrder'],
    listLinks: async () => opts.existingLinks ?? [],
    upsertLink: (async (_org: OrgId, input: UpsertPurchaseLinkInput) => {
      linkCalls.push(input);
      return { id: 1, receiving_line_id: input.receivingLineId } as PurchaseLinkRow;
    }) as LinkCartonIdentifierDeps['upsertLink'],
  };

  return { deps, queries, relinkCalls, salesOrderCalls, linkCalls };
}

test('resolved id relinks the carton and reports the imported items', async () => {
  const { deps, relinkCalls } = fakes({
    resolved: { poId: '123456', poNumber: 'PO-6001' },
  });

  const result = await linkCartonIdentifier(
    ORG,
    { receivingId: 42, lineId: 7, identifier: ' po 6001 ' },
    deps,
  );

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'linked');
  assert.equal(result.linesImported, 3);
  assert.equal(result.poNumber, 'PO-6001');
  assert.deepEqual(
    relinkCalls.map((c) => [c.receivingId, c.lineId, c.scope, c.zohoPurchaseorderId]),
    [[42, 7, 'both', '123456']],
  );
});

test('resolved id without a line relinks the whole carton', async () => {
  const { deps, relinkCalls } = fakes({ resolved: { poId: '9', poNumber: null } });

  await linkCartonIdentifier(ORG, { receivingId: 42, identifier: '9' }, deps);

  assert.equal(relinkCalls[0].scope, 'carton');
  assert.equal(relinkCalls[0].lineId, null);
});

test('an id the PO mirror misses still imports when it is a sales order', async () => {
  const { deps, salesOrderCalls, linkCalls } = fakes({
    resolved: null,
    salesOrderImported: true,
  });

  const result = await linkCartonIdentifier(
    ORG,
    { receivingId: 42, lineId: 7, identifier: '111-8911758-3549041' },
    deps,
  );

  assert.equal(result.outcome, 'linked');
  assert.equal(result.linesImported, 1);
  assert.equal(result.poNumber, '111-8911758-3549041');
  assert.deepEqual(salesOrderCalls, ['111-8911758-3549041']);
  // A resolved order is linked for real — never also parked as pending.
  assert.equal(linkCalls.length, 0);
});

test('unresolved id is recorded as pending — never as a Zoho PO', async () => {
  const { deps, queries, linkCalls, relinkCalls } = fakes({ resolved: null });

  const result = await linkCartonIdentifier(
    ORG,
    { receivingId: 42, lineId: 7, identifier: 'AMZ-112-9988' },
    deps,
  );

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'pending');
  assert.equal(result.linesImported, 0);
  assert.equal(relinkCalls.length, 0);

  const update = queries.find((q) => /UPDATE receiving_carton/.test(q.text));
  assert.ok(update, 'the identifier is written to the carton');
  assert.match(update.text, /source_order_id = \$1/);
  assert.equal(update.params[0], 'AMZ-112-9988');
  // The two things that would make the carton lie about being matched.
  assert.doesNotMatch(update.text, /zoho_purchaseorder_number/);
  assert.doesNotMatch(update.text, /source\s*=\s*'zoho_po'/);

  assert.deepEqual(linkCalls, [
    {
      receivingLineId: 7,
      sourceType: 'manual',
      sourceOrderId: 'AMZ-112-9988',
      isPrimary: true,
    },
  ]);
});

test('pending link never demotes an existing primary identity', async () => {
  const { deps, linkCalls } = fakes({
    resolved: null,
    existingLinks: [
      { id: 5, receiving_line_id: 7, source_type: 'ebay', source_order_id: '11-22', source_line_item_id: null, is_primary: true, platform_account_id: null },
    ],
  });

  await linkCartonIdentifier(ORG, { receivingId: 42, lineId: 7, identifier: 'RMA-8' }, deps);

  assert.equal(linkCalls[0].isPrimary, false);
});

test('a missing carton is a 404 with no writes', async () => {
  const { deps, queries, linkCalls, relinkCalls } = fakes({ cartonExists: false });

  const result = await linkCartonIdentifier(
    ORG,
    { receivingId: 999, lineId: 7, identifier: 'X-1' },
    deps,
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(relinkCalls.length, 0);
  assert.equal(linkCalls.length, 0);
  assert.equal(queries.filter((q) => /UPDATE/.test(q.text)).length, 0);
});

test('a blank identifier is rejected before any lookup', async () => {
  const { deps, queries } = fakes({});

  const result = await linkCartonIdentifier(ORG, { receivingId: 42, identifier: '   ' }, deps);

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(queries.length, 0);
});

test('identifier keys ignore case and punctuation', () => {
  assert.equal(normalizeIdentifierKey('po-6001'), 'PO6001');
  assert.equal(normalizeIdentifierKey('PO 6001'), 'PO6001');
  assert.equal(normalizeIdentifierKey(null), '');
});
