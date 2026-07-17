import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  loadSupportContextSerialSeed,
  loadTicketShipmentSeed,
  type SupportSerialSeedDeps,
} from './context-linkage-seeds';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

test('ticket shipment references seed tracking and retain every referenced STN', async () => {
  const calls: Array<{ orgId: OrgId; ticketId: number }> = [];
  const seed = await loadTicketShipmentSeed(ORG, 9523, null, {
    listReferences: async (args) => {
      calls.push(args);
      return [
        {
          shipmentId: 44,
          trackingNumber: '1Z999AA10123456784',
          carrier: 'UPS',
          isPrimary: true,
          linkedAt: '2026-07-17T00:00:00.000Z',
        },
        {
          shipmentId: 45,
          trackingNumber: '9400111899560000000000',
          carrier: 'USPS',
          isPrimary: false,
          linkedAt: '2026-07-16T00:00:00.000Z',
        },
      ];
    },
  });

  assert.deepEqual(calls, [{ orgId: ORG, ticketId: 9523 }]);
  assert.equal(seed.tracking, '1Z999AA10123456784');
  assert.deepEqual(seed.shipmentIds, [44, 45]);
});

test('an explicit tracking seed wins over ticket reference display order', async () => {
  const seed = await loadTicketShipmentSeed(ORG, 9523, 'EXPLICIT-TRACKING', {
    listReferences: async () => [{
      shipmentId: 44,
      trackingNumber: 'REFERENCE-TRACKING',
      carrier: null,
      isPrimary: true,
      linkedAt: '2026-07-17T00:00:00.000Z',
    }],
  });

  assert.equal(seed.tracking, 'EXPLICIT-TRACKING');
  assert.deepEqual(seed.shipmentIds, [44]);
});

test('receiving context serial seed resolves current serials for carton lines', async () => {
  const queryCalls: unknown[][] = [];
  const fetchCalls: Array<{ lineIds: number[]; orgId: OrgId }> = [];
  const serial = await loadSupportContextSerialSeed(
    ORG,
    { lineId: null, receivingId: 77 },
    {
      query: (async (_orgId: OrgId, _sql: string, params: unknown[]) => {
        queryCalls.push(params);
        return { rows: [{ id: 101 }, { id: 102 }] };
      }) as SupportSerialSeedDeps['query'],
      fetchSerials: async (lineIds, orgId) => {
        fetchCalls.push({ lineIds, orgId });
        return new Map([
          [102, [{
            id: 501,
            serial_number: 'RETURN-SERIAL-501',
            current_status: 'IN_TEST',
            sku_catalog_id: null,
            condition_grade: null,
            created_at: '2026-07-17T00:00:00.000Z',
            handling_unit_id: null,
            unit_uid: null,
          }]],
        ]);
      },
    },
  );

  assert.equal(serial, 'RETURN-SERIAL-501');
  assert.deepEqual(queryCalls, [[77, ORG]]);
  assert.deepEqual(fetchCalls, [{ lineIds: [101, 102], orgId: ORG }]);
});
