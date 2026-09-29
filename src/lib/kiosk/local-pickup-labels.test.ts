import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  issueKioskPickupLabels,
  KioskPickupLabelError,
  type KioskPickupLabelDeps,
} from './local-pickup-labels';

const ORG = '00000000-0000-0000-0000-00000000aaaa' as OrgId;

function deps(over: Partial<KioskPickupLabelDeps> = {}): KioskPickupLabelDeps {
  return {
    ownedLineIds: async (_org, _pickup, lineIds) => [...lineIds],
    issue: (async ({ lineId }: { lineId: number }) => ({
      lineId,
      quantity: 1,
      labels: [{
        receivingLineId: lineId,
        receivingLineUnitId: lineId * 10,
        ordinal: 1,
        serialUnitId: lineId * 100,
        unitUid: `CF-U-${lineId}`,
        sku: `SKU-${lineId}`,
        title: `Product ${lineId}`,
        serialNumber: null,
        condition: 'USED_A',
        qrPayload: `CF-U-${lineId}`,
        isReprint: false,
        clientEventId: `receiving-label:${lineId}:${lineId * 10}:batch_1234`,
      }],
    })) as KioskPickupLabelDeps['issue'],
    record: (async () => null) as KioskPickupLabelDeps['record'],
    ...over,
  };
}

test('rejects a foreign receiving line before issuing any unit identity', async () => {
  let issueCalls = 0;
  const d = deps({
    ownedLineIds: async () => [11],
    issue: (async () => {
      issueCalls += 1;
      throw new Error('must not run');
    }) as KioskPickupLabelDeps['issue'],
  });

  await assert.rejects(
    () => issueKioskPickupLabels(
      { localPickupOrderId: 44, lineIds: [11, 12], issuanceVersion: 'batch_1234', staffId: 7 },
      ORG,
      d,
    ),
    (error: unknown) =>
      error instanceof KioskPickupLabelError &&
      error.status === 409 &&
      /do not belong/.test(error.message),
  );
  assert.equal(issueCalls, 0);
});

test('returns printable units while reporting a catalog-missing line', async () => {
  const jobs: Array<Record<string, unknown>> = [];
  const base = deps();
  const d = deps({
    issue: (async (args, orgId) => {
      if (args.lineId === 12) throw new Error('Pair this line to a catalog SKU before issuing item labels');
      return base.issue(args, orgId);
    }) as KioskPickupLabelDeps['issue'],
    record: (async (job: Record<string, unknown>) => {
      jobs.push(job);
      return null;
    }) as unknown as KioskPickupLabelDeps['record'],
  });

  const result = await issueKioskPickupLabels(
    { localPickupOrderId: 44, lineIds: [11, 12], issuanceVersion: 'batch_1234', staffId: 7 },
    ORG,
    d,
  );

  assert.deepEqual(result.labels.map((label) => label.receivingLineId), [11]);
  assert.deepEqual(result.failures, [{
    lineId: 12,
    error: 'Pair this line to a catalog SKU before issuing item labels',
  }]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.serialUnitId, 1100);
  assert.equal(jobs[0]?.actorStaffId, 7);
});
