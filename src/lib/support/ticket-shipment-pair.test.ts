import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  pairTicketShipmentFromEntity,
  pairTicketShipmentFromReceiving,
  type PairTicketShipmentFromEntityDeps,
  type PairTicketShipmentFromReceivingDeps,
} from '@/lib/support/ticket-shipment-pair';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

function receivingFakes(opts: {
  shipmentId: number | null;
  addResult?: { shipmentId: number; isPrimary: boolean; added: boolean };
}): {
  deps: PairTicketShipmentFromReceivingDeps;
  lookups: Array<{ orgId: OrgId; receivingId: number }>;
  refs: Array<{ orgId: OrgId; ticketId: number; shipmentId: number; staffId?: number | null }>;
} {
  const lookups: Array<{ orgId: OrgId; receivingId: number }> = [];
  const refs: Array<{
    orgId: OrgId;
    ticketId: number;
    shipmentId: number;
    staffId?: number | null;
  }> = [];
  return {
    lookups,
    refs,
    deps: {
      lookupCartonShipmentId: async (orgId, receivingId) => {
        lookups.push({ orgId, receivingId });
        return opts.shipmentId;
      },
      addReference: async (args) => {
        refs.push(args);
        return (
          opts.addResult ?? {
            shipmentId: args.shipmentId,
            isPrimary: false,
            added: true,
          }
        );
      },
    },
  };
}

describe('pairTicketShipmentFromReceiving', () => {
  it('no-ops when the carton has no shipment_id', async () => {
    const { deps, lookups, refs } = receivingFakes({ shipmentId: null });
    const out = await pairTicketShipmentFromReceiving(
      { orgId: ORG, ticketId: 42, receivingId: 7, staffId: 3 },
      deps,
    );
    assert.equal(out, null);
    assert.deepEqual(lookups, [{ orgId: ORG, receivingId: 7 }]);
    assert.equal(refs.length, 0);
  });

  it('calls addReference when shipment_id is present', async () => {
    const { deps, refs } = receivingFakes({
      shipmentId: 99,
      addResult: { shipmentId: 99, isPrimary: false, added: true },
    });
    const out = await pairTicketShipmentFromReceiving(
      { orgId: ORG, ticketId: 42, receivingId: 7, staffId: 3 },
      deps,
    );
    assert.deepEqual(out, { shipmentId: 99, isPrimary: false, added: true });
    assert.deepEqual(refs, [
      { orgId: ORG, ticketId: 42, shipmentId: 99, staffId: 3 },
    ]);
  });

  it('reports idempotent re-pair (added: false)', async () => {
    const { deps } = receivingFakes({
      shipmentId: 99,
      addResult: { shipmentId: 99, isPrimary: false, added: false },
    });
    const out = await pairTicketShipmentFromReceiving(
      { orgId: ORG, ticketId: 42, receivingId: 7 },
      deps,
    );
    assert.deepEqual(out, { shipmentId: 99, isPrimary: false, added: false });
  });
});

describe('pairTicketShipmentFromEntity', () => {
  it('pairs SHIPMENT entity as a direct reference', async () => {
    const refs: Array<{ shipmentId: number }> = [];
    const deps: PairTicketShipmentFromEntityDeps = {
      lookupCartonShipmentId: async () => {
        throw new Error('should not look up carton for SHIPMENT');
      },
      lookupLineReceivingId: async () => {
        throw new Error('should not look up line for SHIPMENT');
      },
      addReference: async (args) => {
        refs.push({ shipmentId: args.shipmentId });
        return { shipmentId: args.shipmentId, isPrimary: true, added: true };
      },
    };
    const out = await pairTicketShipmentFromEntity(
      { orgId: ORG, ticketId: 1, entityType: 'SHIPMENT', entityId: 55 },
      deps,
    );
    assert.deepEqual(out, { shipmentId: 55, isPrimary: true, added: true });
    assert.deepEqual(refs, [{ shipmentId: 55 }]);
  });

  it('resolves RECEIVING_LINE → carton → STN', async () => {
    const refs: Array<{ shipmentId: number }> = [];
    const deps: PairTicketShipmentFromEntityDeps = {
      lookupLineReceivingId: async () => 7,
      lookupCartonShipmentId: async (_org, receivingId) => {
        assert.equal(receivingId, 7);
        return 99;
      },
      addReference: async (args) => {
        refs.push({ shipmentId: args.shipmentId });
        return { shipmentId: args.shipmentId, isPrimary: false, added: true };
      },
    };
    const out = await pairTicketShipmentFromEntity(
      { orgId: ORG, ticketId: 1, entityType: 'receiving_line', entityId: 12 },
      deps,
    );
    assert.deepEqual(out, { shipmentId: 99, isPrimary: false, added: true });
    assert.deepEqual(refs, [{ shipmentId: 99 }]);
  });

  it('returns null for unrelated entity types', async () => {
    const out = await pairTicketShipmentFromEntity(
      { orgId: ORG, ticketId: 1, entityType: 'ORDER', entityId: 9 },
      {
        lookupCartonShipmentId: async () => 1,
        lookupLineReceivingId: async () => 1,
        addReference: async () => {
          throw new Error('should not add');
        },
      },
    );
    assert.equal(out, null);
  });
});
