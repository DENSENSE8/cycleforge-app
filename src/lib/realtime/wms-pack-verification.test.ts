import assert from 'node:assert/strict';
import test from 'node:test';
import { executeWmsPackVerification } from './wms-pack-verification';

const input = {
  commandId: '1f40d7d6-b579-49f0-9111-966db082d5b2',
  organizationId: '00000000-0000-4000-8000-000000000001',
  staffId: 7,
  packerLogId: 42,
  outcome: 'VERIFIED' as const,
  detectedTracking: '1Z999AA10123456784',
  detectedOrderId: 'ECWID-123',
  ocrConfidence: null,
  meta: null,
};

test('authorizes, records, and audits a new pack verification', async () => {
  const calls: string[] = [];
  const result = await executeWmsPackVerification(input, {
    assertPermission: async (staffId, organizationId) => {
      calls.push(`permission:${staffId}:${organizationId}`);
    },
    record: async (event) => {
      calls.push(`record:${event.clientEventId}:${event.verifiedByStaffId}`);
      return { ok: true, id: 91, outcome: 'VERIFIED', duplicate: false };
    },
    audit: async (_command, data) => {
      calls.push(`audit:${data.id}`);
    },
  });

  assert.equal(result.replayed, false);
  assert.equal(result.data.id, 91);
  assert.deepEqual(calls, [
    `permission:7:${input.organizationId}`,
    `record:${input.commandId}:7`,
    'audit:91',
  ]);
});

test('does not duplicate audit on idempotent replay', async () => {
  let audited = false;
  const result = await executeWmsPackVerification(input, {
    assertPermission: async () => {},
    record: async () => ({ ok: true, id: 91, outcome: 'VERIFIED', duplicate: true }),
    audit: async () => { audited = true; },
  });

  assert.equal(result.replayed, true);
  assert.equal(audited, false);
});

test('propagates the domain state-machine rejection', async () => {
  await assert.rejects(() => executeWmsPackVerification(input, {
    assertPermission: async () => {},
    record: async () => ({
      ok: false,
      code: 'CONFLICT',
      error: 'cannot record VERIFIED when latest outcome is REVIEW_APPROVED',
      latest: 'REVIEW_APPROVED',
    }),
    audit: async () => {},
  }), /cannot record VERIFIED/);
});
