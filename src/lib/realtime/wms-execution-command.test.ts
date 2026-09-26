import assert from 'node:assert/strict';
import test from 'node:test';
import { executeWmsExecutionCommand } from './wms-execution-command';

const ORG = '00000000-0000-4000-8000-000000000001';
const identity = { organizationId: ORG, staffId: 7 };

function base(name: 'pick.confirm' | 'pick.short') {
  return {
    v: 1 as const,
    commandId: `command-${name}`,
    organizationId: ORG,
    staffId: 7,
    issuedAt: '2027-01-15T08:00:00.000Z',
    name,
  };
}

test('executes a final pick and completes its session through domain functions', async () => {
  const calls: string[] = [];
  const receipt = await executeWmsExecutionCommand({
    ...base('pick.confirm'),
    input: { sessionId: 4, allocationId: 9, toteScan: 'H-12', completeSession: true },
  }, identity, {
    confirmPick: async (input, orgId) => {
      calls.push(`confirm:${orgId}:${input.clientEventId}:${input.toteScan}`);
      return { ok: true, serialUnitId: 33, pickedAt: '2027-01-15T08:00:01.000Z', toteCode: 'H-12' };
    },
    completeSession: async () => {
      calls.push('complete');
      return { ok: true, stagedTotes: ['H-12'] };
    },
    recordShortPick: async () => ({ ok: true, releasedUnitId: null }),
    executePutawayAdjust: async () => ({ data: {} as never, replayed: false }),
    executePackVerification: async () => ({ data: {} as never, replayed: false }),
  });

  assert.deepEqual(calls, [`confirm:${ORG}:wms:command-pick.confirm:H-12`, 'complete']);
  assert.equal(receipt.name, 'pick.confirm');
  assert.deepEqual(receipt.data.stagedTotes, ['H-12']);
});

test('rejects command identity substitution before domain execution', async () => {
  let called = false;
  await assert.rejects(() => executeWmsExecutionCommand({
    ...base('pick.confirm'),
    staffId: 8,
    input: { sessionId: 4, allocationId: 9, toteScan: 'H-12', completeSession: false },
  }, identity, {
    confirmPick: async () => {
      called = true;
      return { ok: true, serialUnitId: 33, pickedAt: new Date().toISOString() };
    },
    completeSession: async () => ({ ok: true, stagedTotes: [] }),
    recordShortPick: async () => ({ ok: true, releasedUnitId: null }),
    executePutawayAdjust: async () => ({ data: {} as never, replayed: false }),
    executePackVerification: async () => ({ data: {} as never, replayed: false }),
  }), /identity does not match/i);
  assert.equal(called, false);
});

test('validates short-pick quantity and OTHER note at the wire boundary', async () => {
  await assert.rejects(() => executeWmsExecutionCommand({
    ...base('pick.short'),
    input: {
      sessionId: 4,
      allocationId: 9,
      pickedQty: 1,
      plannedQty: 1,
      reason: 'OTHER',
      note: '',
    },
  }, identity), /pickedQty must be less than plannedQty|reason OTHER requires a note/);
});

test('routes a tenant-authenticated putaway adjustment and preserves replay status', async () => {
  const receipt = await executeWmsExecutionCommand({
    ...base('pick.confirm'),
    name: 'putaway.adjust',
    commandId: 'putaway-command-1',
    input: {
      barcode: 'B02',
      sku: 'SKU-1',
      direction: 'put',
      qty: 2,
      reason: 'BIN_ADD',
      reasonCodeId: null,
      notes: null,
    },
  }, identity, {
    confirmPick: async () => ({ ok: true, serialUnitId: 1, pickedAt: new Date().toISOString() }),
    completeSession: async () => ({ ok: true, stagedTotes: [] }),
    recordShortPick: async () => ({ ok: true, releasedUnitId: null }),
    executePutawayAdjust: async (command) => {
      assert.equal(command.organizationId, ORG);
      assert.equal(command.staffId, 7);
      return {
        replayed: true,
        data: { success: true, binQty: 3, totalStock: 10, ledgerId: 99, binId: 4 },
      };
    },
    executePackVerification: async () => ({ data: {} as never, replayed: false }),
  });
  assert.equal(receipt.name, 'putaway.adjust');
  assert.equal(receipt.status, 'replayed');
  assert.equal(receipt.data.binQty, 3);
});

test('accepts the seeded tenant ids, which are not RFC-versioned UUIDs', async () => {
  // The dogfood and QA orgs are `00000000-0000-0000-0000-00000000000{1,2}`.
  // A strict RFC `uuid()` check refused every phone putaway for them.
  for (const organizationId of ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002']) {
    const receipt = await executeWmsExecutionCommand({
      ...base('pick.confirm'),
      organizationId,
      name: 'putaway.adjust',
      commandId: `putaway-seeded-${organizationId}`,
      input: { barcode: 'B02', sku: 'TMP-ABC', direction: 'put', qty: 1, reason: 'BIN_ADD', reasonCodeId: null, notes: null },
    }, { organizationId, staffId: 7 }, {
      confirmPick: async () => ({ ok: true, serialUnitId: 1, pickedAt: new Date().toISOString() }),
      completeSession: async () => ({ ok: true, stagedTotes: [] }),
      recordShortPick: async () => ({ ok: true, releasedUnitId: null }),
      executePutawayAdjust: async () => ({
        replayed: false,
        data: { success: true, binQty: 1, totalStock: 1, ledgerId: 1, binId: 1 },
      }),
      executePackVerification: async () => ({ data: {} as never, replayed: false }),
    });
    assert.equal(receipt.name, 'putaway.adjust');
  }
});

test('routes an idempotent mobile pack verification through the domain writer', async () => {
  const receipt = await executeWmsExecutionCommand({
    ...base('pick.confirm'),
    name: 'pack.verify',
    commandId: '1f40d7d6-b579-49f0-9111-966db082d5b2',
    input: {
      packerLogId: 42,
      outcome: 'VERIFIED',
      detectedTracking: '1Z999AA10123456784',
      detectedOrderId: 'ECWID-123',
      ocrConfidence: null,
      meta: null,
    },
  }, identity, {
    confirmPick: async () => ({ ok: true, serialUnitId: 1, pickedAt: new Date().toISOString() }),
    completeSession: async () => ({ ok: true, stagedTotes: [] }),
    recordShortPick: async () => ({ ok: true, releasedUnitId: null }),
    executePutawayAdjust: async () => ({ data: {} as never, replayed: false }),
    executePackVerification: async (command) => {
      assert.equal(command.packerLogId, 42);
      assert.equal(command.staffId, 7);
      return {
        replayed: true,
        data: { success: true, id: 91, outcome: 'VERIFIED' },
      };
    },
  });
  assert.equal(receipt.name, 'pack.verify');
  assert.equal(receipt.status, 'replayed');
  assert.equal(receipt.data.id, 91);
});
