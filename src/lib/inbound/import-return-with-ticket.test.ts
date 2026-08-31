/**
 * Add Return orchestration — DB-free unit tests.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  importReturnWithTicket,
  validateAddReturnBody,
} from './import-return-with-ticket';
import type { InboundImportPurchaseBody } from '@/lib/schemas/inbound-desk';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

function returnBody(
  overrides: Partial<InboundImportPurchaseBody> = {},
): InboundImportPurchaseBody {
  return {
    kind: 'return',
    source_type: 'amazon',
    order_id: '111-222-333',
    sku: 'SKU-1',
    item_name: 'Widget',
    tracking_number: '1Z999',
    sku_catalog_id: 42,
    quantity: 1,
    ...overrides,
  };
}

describe('validateAddReturnBody', () => {
  it('requires tracking and sku_catalog_id for returns', async () => {
    assert.equal(
      await validateAddReturnBody(ORG, returnBody({ tracking_number: null })),
      'tracking_number is required for returns',
    );
    assert.equal(
      await validateAddReturnBody(ORG, returnBody({ sku_catalog_id: null })),
      'sku_catalog_id is required for returns',
    );
  });
});

describe('importReturnWithTicket', () => {
  it('does not ingest when helpdesk is missing', async () => {
    let ingestCalled = false;
    const outcome = await importReturnWithTicket(
      { orgId: ORG, staffId: 1, body: returnBody() },
      {
        getHelpdesk: async () => null,
        resolveCatalog: async () => ({ id: 42, sku: 'SKU-1', product_title: 'Widget' }),
        importRow: async () => {
          ingestCalled = true;
          throw new Error('should not ingest');
        },
      },
    );
    assert.equal(ingestCalled, false);
    assert.ok('blocked' in outcome && outcome.blocked);
    assert.equal(outcome.status, 503);
  });

  it('reuses existing ticket without creating a second claim', async () => {
    let claimCalls = 0;
    const outcome = await importReturnWithTicket(
      { orgId: ORG, staffId: 1, body: returnBody() },
      {
        getHelpdesk: async () => ({ createTicket: async () => ({ id: 999 }) }) as never,
        importRow: async () => ({
          receivingLineId: 100,
          receivingId: 50,
          created: true,
          platformAccountId: null,
          sourceType: 'amazon',
          sourceOrderId: '111-222-333',
          kind: 'return' as const,
          sourcePlatform: 'amazon',
          receivingType: 'RETURN',
          priorityTier: null,
        }),
        resolveCatalog: async () => ({ id: 42, sku: 'SKU-1', product_title: 'Widget' }),
        fileClaim: async () => {
          claimCalls += 1;
          return {
            success: true,
            ticketNumber: '#7777',
            ticketUrl: 'https://example.test/t/7777',
            ticketId: 7777,
            reusedExisting: true,
            archiveOk: true,
            archiveCopied: 0,
            archiveTotal: 0,
            archiveFolder: null,
          };
        },
      },
    );
    assert.equal(claimCalls, 1);
    assert.ok('success' in outcome && outcome.success);
    if ('success' in outcome && outcome.success) {
      assert.equal(outcome.ticket.success, true);
      assert.equal(outcome.ticket.ticketNumber, '#7777');
      assert.equal(outcome.ticket.reusedExisting, true);
    }
  });

  it('keeps ingest when claim fails and surfaces draft body', async () => {
    const outcome = await importReturnWithTicket(
      { orgId: ORG, staffId: 1, body: returnBody() },
      {
        getHelpdesk: async () => ({ createTicket: async () => ({ id: 1 }) }) as never,
        importRow: async () => ({
          receivingLineId: 100,
          receivingId: 50,
          created: true,
          platformAccountId: null,
          sourceType: 'amazon',
          sourceOrderId: '111-222-333',
          kind: 'return' as const,
          sourcePlatform: 'amazon',
          receivingType: 'RETURN',
          priorityTier: null,
        }),
        resolveCatalog: async () => ({ id: 42, sku: 'SKU-1', product_title: 'Widget' }),
        fileClaim: async () => ({
          success: false,
          error: 'Zendesk down',
          draftBody: 'Return ticket draft',
          status: 502,
        }),
      },
    );
    assert.ok('success' in outcome && outcome.success);
    if ('success' in outcome && outcome.success) {
      assert.equal(outcome.receivingLineId, 100);
      assert.equal(outcome.ticket.success, false);
      if (!outcome.ticket.success) {
        assert.equal(outcome.ticket.draftBody, 'Return ticket draft');
      }
    }
  });

  it('blocks when tracking does not attach a carton', async () => {
    const outcome = await importReturnWithTicket(
      { orgId: ORG, staffId: 1, body: returnBody() },
      {
        getHelpdesk: async () => ({ createTicket: async () => ({ id: 1 }) }) as never,
        importRow: async () => ({
          receivingLineId: 100,
          receivingId: null,
          created: true,
          platformAccountId: null,
          sourceType: 'amazon',
          sourceOrderId: '111-222-333',
          kind: 'return' as const,
          sourcePlatform: 'amazon',
          receivingType: 'RETURN',
          priorityTier: null,
        }),
        resolveCatalog: async () => ({ id: 42, sku: 'SKU-1', product_title: 'Widget' }),
      },
    );
    assert.ok('blocked' in outcome && outcome.blocked);
    assert.match(outcome.error, /carton/);
  });
});
