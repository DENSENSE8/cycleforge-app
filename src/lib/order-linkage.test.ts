import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOrderLinkage,
  type OrderLinkageDeps,
} from './order-linkage';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

test('returns an STN-only partial loop with its linked ticket when no order exists', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const deps: OrderLinkageDeps = {
    query: (async (_orgId: OrgId, sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('JOIN shipment_links sl')) return { rows: [] };
      if (sql.includes('JOIN orders o ON o.shipment_id')) return { rows: [] };
      if (sql.includes('FROM shipping_tracking_numbers') && sql.includes('LIMIT 1')) {
        return {
          rows: [{
            id: 44,
            tracking_number_raw: '1Z999AA10123456784',
            carrier: 'UPS',
            latest_status_category: 'IN_TRANSIT',
            is_delivered: false,
          }],
        };
      }
      if (sql.includes('FROM ticket_links tl')) {
        return {
          rows: [{
            zendesk_ticket_id: 9523,
            support_ticket_id: 12,
            external_ticket_id: '9523',
            subject_cache: 'Return request',
            status_cache: 'open',
          }],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }) as OrderLinkageDeps['query'],
    listShipmentLinks: async () => {
      throw new Error('ORDER shipment links must not be read for a partial loop');
    },
  };

  const result = await resolveOrderLinkage(
    ORG,
    { tracking: '1Z 999 AA1 0123 4567 84' },
    deps,
  );

  assert.equal(result.matchedBy, 'tracking');
  assert.equal(result.order, null);
  assert.equal(result.trackings[0]?.shipmentId, 44);
  assert.equal(result.tickets[0]?.label, '#9523');
  assert.equal(result.serials.length, 0);
  assert.equal(
    calls.some((call) => call.params.includes('1Z999AA10123456784')),
    true,
  );
});

test('serial seed resolves its outbound order and composed tracking loop', async () => {
  const deps: OrderLinkageDeps = {
    query: (async (_orgId: OrgId, sql: string) => {
      if (sql.includes('FROM order_unit_allocations oua') && sql.includes('ORDER BY (oua.state')) {
        return {
          rows: [{
            id: 300,
            order_id: 'SO-300',
            shipment_id: 44,
            product_title: 'Bose Wave',
            sku: 'BOSE-WAVE',
          }],
        };
      }
      if (sql.includes('SELECT su.id AS serial_unit_id')) {
        return {
          rows: [{
            serial_unit_id: 501,
            serial: 'RETURN-SERIAL-501',
            state: 'RETURNED',
          }],
        };
      }
      if (sql.includes('FROM ticket_links tl')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    }) as OrderLinkageDeps['query'],
    listShipmentLinks: async () => [{
      shipment_id: 44,
      box_seq: 1,
      is_primary: true,
      role: 'OUTBOUND',
      tracking_number: '1Z999AA10123456784',
      carrier: 'UPS',
      status_category: 'DELIVERED',
      is_delivered: true,
    }],
  };

  const result = await resolveOrderLinkage(
    ORG,
    { serial: 'RETURN-SERIAL-501' },
    deps,
  );

  assert.equal(result.matchedBy, 'serial');
  assert.equal(result.order?.orderId, 'SO-300');
  assert.equal(result.trackings[0]?.shipmentId, 44);
  assert.equal(result.serials[0]?.serial, 'RETURN-SERIAL-501');
});

test('direct ORDER ticket_links appear on the closed loop (no-STN walk-in)', async () => {
  const deps: OrderLinkageDeps = {
    query: (async (_orgId: OrgId, sql: string) => {
      if (sql.includes('FROM orders o') && sql.includes('order_id ILIKE')) {
        return {
          rows: [{
            id: 65,
            order_id: '65',
            shipment_id: null,
            product_title: 'Walk-in',
            sku: null,
          }],
        };
      }
      if (sql.includes('SELECT su.id AS serial_unit_id')) return { rows: [] };
      if (sql.includes('FROM tech_serial_numbers')) return { rows: [] };
      if (sql.includes("entity_type = 'SHIPMENT'")) return { rows: [] };
      if (sql.includes("entity_type = 'ORDER'")) {
        return {
          rows: [{
            zendesk_ticket_id: 9061,
            support_ticket_id: 100,
            external_ticket_id: '9061',
            subject_cache: 'Walk-in repair',
            status_cache: 'open',
          }],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }) as OrderLinkageDeps['query'],
    listShipmentLinks: async () => [],
  };

  const result = await resolveOrderLinkage(ORG, { order: '65' }, deps);
  assert.equal(result.matchedBy, 'order');
  assert.equal(result.order?.id, 65);
  assert.equal(result.trackings.length, 0);
  assert.equal(result.tickets.length, 1);
  assert.equal(result.tickets[0]?.label, '#9061');
  assert.equal(result.tickets[0]?.linkedVia, 'order');
});
