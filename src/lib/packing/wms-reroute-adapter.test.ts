import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import {
  commitWmsReroute,
  WmsRerouteCommitError,
  WmsRerouteIntentSchema,
} from './wms-reroute-adapter';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const INTENT = {
  v: 1 as const,
  action: 'stage.reroute' as const,
  commandId: 'command-slot-full-42',
  signalId: 'signal-slot-full-42',
  organizationId: ORG,
  staffId: 7,
  orderId: 42,
  quantity: 1,
  fromSlot: 'A01',
  toSlot: 'B02',
  reason: 'slot_full' as const,
};

type FakeOptions = {
  replay?: boolean;
  sourceCapacity?: number | null;
  sourceLoad?: number;
  destinationCapacity?: number | null;
  destinationLoad?: number;
};

function fakeClient(options: FakeOptions = {}) {
  const log: string[] = [];
  let inserted = false;
  const event = {
    id: 901,
    order_id: 42,
    from_name: 'Overflow A',
    from_barcode: 'A01',
    to_name: 'Bench B',
    to_barcode: 'B02',
    created_at: new Date('2026-09-17T12:00:00.000Z'),
  };
  const client = {
    query: async (sql: string) => {
      const text = String(sql);
      log.push(text.replace(/\s+/g, ' ').trim());
      if (/pg_advisory_xact_lock/i.test(text)) return { rows: [{}] };
      if (/FROM order_pack_placement_events e/i.test(text)) {
        return { rows: options.replay || inserted ? [event] : [] };
      }
      if (/SELECT id FROM staff/i.test(text)) return { rows: [{ id: 7 }] };
      if (/FROM order_pack_placements p/i.test(text) && /FOR UPDATE OF p, l/i.test(text)) {
        return {
          rows: [{
            location_id: 11,
            id: 11,
            name: 'Overflow A',
            barcode: 'A01',
            capacity: options.sourceCapacity === undefined ? 1 : options.sourceCapacity,
          }],
        };
      }
      if (/FROM locations/i.test(text) && /location_kind = ANY/i.test(text)) {
        return {
          rows: [{
            id: 22,
            name: 'Bench B',
            barcode: 'B02',
            capacity: options.destinationCapacity === undefined ? 2 : options.destinationCapacity,
          }],
        };
      }
      if (/COUNT\(\*\) FILTER/i.test(text)) {
        return {
          rows: [{
            source_load: options.sourceLoad ?? 1,
            destination_load: options.destinationLoad ?? 0,
          }],
        };
      }
      if (/UPDATE order_pack_placements/i.test(text)) return { rows: [] };
      if (/WITH inserted AS/i.test(text)) {
        inserted = true;
        return { rows: [event] };
      }
      throw new Error(`Unexpected SQL: ${text.slice(0, 100)}`);
    },
  } as unknown as PoolClient;
  return { client, log };
}

test('strict contract rejects model-authored database authority', () => {
  assert.throws(() => WmsRerouteIntentSchema.parse({ ...INTENT, databaseUrl: 'postgres://nope' }));
});

test('commits a tenant-scoped capacity-valid reroute and returns its event receipt', async () => {
  const { client, log } = fakeClient();
  const receipt = await commitWmsReroute(ORG as never, INTENT, client);
  assert.equal(receipt.status, 'committed');
  assert.equal(receipt.mutationId, 'order-pack-placement-event:901');
  assert.equal(receipt.commandId, INTENT.commandId);
  assert.ok(log.some((sql) => /UPDATE order_pack_placements/i.test(sql)));
  assert.ok(log.some((sql) => /INSERT INTO order_pack_placement_events/i.test(sql)));
  assert.ok(log.every((sql) => !/postgres:\/\//i.test(sql)));
});

test('replays an already committed command without writing again', async () => {
  const { client, log } = fakeClient({ replay: true });
  const receipt = await commitWmsReroute(ORG as never, INTENT, client);
  assert.equal(receipt.status, 'replayed');
  assert.equal(log.some((sql) => /UPDATE order_pack_placements/i.test(sql)), false);
  assert.equal(log.some((sql) => /INSERT INTO order_pack_placement_events/i.test(sql)), false);
});

test('rejects a destination whose live placement count reaches capacity', async () => {
  const { client, log } = fakeClient({ destinationCapacity: 1, destinationLoad: 1 });
  await assert.rejects(
    () => commitWmsReroute(ORG as never, INTENT, client),
    (error: unknown) => error instanceof WmsRerouteCommitError && error.code === 'DESTINATION_FULL',
  );
  assert.equal(log.some((sql) => /UPDATE order_pack_placements/i.test(sql)), false);
});

test('rejects a model-selected tenant that differs from trusted context', async () => {
  const { client, log } = fakeClient();
  await assert.rejects(
    () => commitWmsReroute('00000000-0000-4000-8000-0000000000bb' as never, INTENT, client),
    (error: unknown) => error instanceof WmsRerouteCommitError && error.code === 'TENANT_MISMATCH',
  );
  assert.equal(log.length, 0);
});
