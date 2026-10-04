import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePackScan, type PackScanDeps } from './pack-scan-order';
import type { Queryable } from '@/lib/neon/serial-units-queries';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-1111-1111-1111-111111111111' as OrgId;
const client: Queryable = {
  query: async () => {
    throw new Error('resolvePackScan reads through its deps only');
  },
};

interface ToteFact {
  code: string;
  status: string;
  orderId: number | null;
  tracking: string | null;
}

function deps(opts: {
  tote?: ToteFact;
  unit?: { serialUnitId: number; orderId: number | null };
}): PackScanDeps & { unitScans: Array<{ kind: string; key: string }> } {
  const unitScans: Array<{ kind: string; key: string }> = [];
  return {
    unitScans,
    resolveTote: async () =>
      opts.tote
        ? {
            toteId: 5,
            code: opts.tote.code,
            status: opts.tote.status,
            orderId: opts.tote.orderId,
            orderExists: opts.tote.orderId != null,
            tracking: opts.tote.tracking,
            conflictingUnits: false,
          }
        : null,
    findUnitOrder: async (_client, _org, scan) => {
      unitScans.push(scan);
      return opts.unit ?? null;
    },
  };
}

test('resolvePackScan: a staged tote names its order', async () => {
  const d = deps({ tote: { code: 'H-12', status: 'STAGED', orderId: 77, tracking: '1Z999' } });
  assert.deepEqual(await resolvePackScan(client, ORG, 'H-12', d), {
    kind: 'order',
    via: 'tote',
    orderId: 77,
    toteCode: 'H-12',
  });
  assert.equal(d.unitScans.length, 0);
});

test('resolvePackScan: a tote that cannot pack is refused with the tote rule', async () => {
  const unlabeled = await resolvePackScan(
    client,
    ORG,
    'H-12',
    deps({ tote: { code: 'H-12', status: 'STAGED', orderId: 77, tracking: null } }),
  );
  assert.equal(unlabeled?.kind, 'refused');
  assert.match(unlabeled?.kind === 'refused' ? unlabeled.error : '', /no shipping label/);

  const empty = await resolvePackScan(
    client,
    ORG,
    'TOTE-A',
    deps({ tote: { code: 'TOTE-A', status: 'OPEN', orderId: null, tracking: null } }),
  );
  assert.deepEqual(empty, { kind: 'refused', error: 'tote TOTE-A is not carrying an order' });
});

test('resolvePackScan: a unit label on an open order names that order', async () => {
  const d = deps({ unit: { serialUnitId: 9, orderId: 42 } });
  assert.deepEqual(await resolvePackScan(client, ORG, 'U-SN123', d), {
    kind: 'order',
    via: 'unit',
    orderId: 42,
    serialUnitId: 9,
  });
  assert.deepEqual(d.unitScans, [{ kind: 'label', key: 'SN123' }]);
});

test('resolvePackScan: a unit label on no open order goes to prepack, never the tracking ladder', async () => {
  assert.deepEqual(await resolvePackScan(client, ORG, 'U-SN123', deps({ unit: { serialUnitId: 9, orderId: null } })), {
    kind: 'unit-not-on-order',
    error: 'Unit SN123 is not on an open order',
  });
  assert.deepEqual(await resolvePackScan(client, ORG, 'U-SN404', deps({})), {
    kind: 'unit-not-on-order',
    error: 'Unit label SN404 not found',
  });
});

test('resolvePackScan: a typed serial on an open order packs; anything else stays a tracking scan', async () => {
  assert.deepEqual(await resolvePackScan(client, ORG, 'SN123', deps({ unit: { serialUnitId: 9, orderId: 42 } })), {
    kind: 'order',
    via: 'unit',
    orderId: 42,
    serialUnitId: 9,
  });
  const tracking = deps({});
  assert.equal(await resolvePackScan(client, ORG, '1Z999AA10123456784', tracking), null);
  assert.deepEqual(tracking.unitScans, [{ kind: 'raw', key: '1Z999AA10123456784' }]);
  assert.equal(await resolvePackScan(client, ORG, 'SN123', deps({ unit: { serialUnitId: 9, orderId: null } })), null);
});
