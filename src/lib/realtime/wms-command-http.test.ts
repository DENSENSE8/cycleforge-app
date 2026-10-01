import assert from 'node:assert/strict';
import test from 'node:test';
import { executeWmsExecutionCommand } from './wms-execution-command';
import { runWmsCommandOverHttp, type WmsCommandHttpIdentity } from './wms-command-http';
import { signLocationScanProof } from '@/lib/inventory/location-scan-proof';

const ORG = '00000000-0000-0000-0000-000000000002';
const TEST_SECRET = 'test-wms-location-secret-at-least-thirty-two-chars';
process.env.WMS_GATEWAY_SECRET = TEST_SECRET;

function identity(overrides: Partial<WmsCommandHttpIdentity> = {}): WmsCommandHttpIdentity {
  return { organizationId: ORG, staffId: 67, can: () => true, ...overrides };
}

function take(commandId: string, staffId = 67) {
  return {
    v: 1 as const,
    commandId,
    organizationId: ORG,
    staffId,
    issuedAt: '2026-09-25T08:00:00.000Z',
    name: 'putaway.adjust' as const,
    input: {
      barcode: 'A-01-01',
      sku: 'SKU-1',
      direction: 'take' as const,
      qty: 1,
      reason: 'TAKE_FBA',
      reasonCodeId: null,
      notes: null,
      locationVerificationToken: signLocationScanProof({ organizationId: ORG, staffId, locationCode: 'A-01-01' }, { secret: TEST_SECRET }).token,
    },
  };
}

/** Kernel wired to an in-memory ledger keyed by commandId, like the real writer. */
function kernel() {
  const ledger = new Map<string, number>();
  let domainCalls = 0;
  const execute = (raw: unknown, who: { organizationId: string; staffId: number }) =>
    executeWmsExecutionCommand(raw, who, {
      confirmPick: async () => { throw new Error('unused'); },
      completeSession: async () => { throw new Error('unused'); },
      recordShortPick: async () => { throw new Error('unused'); },
      executePackVerification: async () => { throw new Error('unused'); },
      executePutawayAdjust: async (command) => {
        domainCalls += 1;
        const replayed = ledger.has(command.commandId);
        if (!replayed) ledger.set(command.commandId, ledger.size + 1);
        return {
          replayed,
          data: { success: true, binQty: 4, totalStock: 9, ledgerId: ledger.get(command.commandId)!, binId: 1 },
        };
      },
    });
  return { execute, ledger, calls: () => domainCalls };
}

test('a retried commandId replays instead of writing a second ledger row', async () => {
  const k = kernel();
  const first = await runWmsCommandOverHttp(take('cmd-1'), identity(), k);
  const retry = await runWmsCommandOverHttp(take('cmd-1'), identity(), k);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(first.status === 200 && first.body.status, 'committed');
  assert.equal(retry.status === 200 && retry.body.status, 'replayed');
  assert.equal(k.ledger.size, 1);
});

test('a body claiming another staff is refused before the domain runs', async () => {
  const k = kernel();
  const result = await runWmsCommandOverHttp(take('cmd-2', 999), identity(), k);
  assert.equal(result.status, 403);
  assert.match(result.status === 403 ? result.body.error : '', /identity does not match/i);
  assert.equal(k.calls(), 0);
});

test('putaway motion keeps the bin.adjust permission of the REST route', async () => {
  const k = kernel();
  const result = await runWmsCommandOverHttp(take('cmd-3'), identity({ can: () => false }), k);
  assert.equal(result.status, 403);
  assert.equal(k.calls(), 0);
});

test('a malformed command is a 400 with the schema message, not a 500', async () => {
  const k = kernel();
  const result = await runWmsCommandOverHttp({ ...take('cmd-4'), input: { qty: -1 } }, identity(), k);
  assert.equal(result.status, 400);
  assert.equal(k.calls(), 0);
});

test('a domain rejection reaches the operator with its message', async () => {
  const result = await runWmsCommandOverHttp(take('cmd-5'), identity(), {
    execute: async () => { throw new Error('Cannot take 1: only 0 in A-01-01'); },
  });
  assert.deepEqual(result, { status: 422, body: { error: 'Cannot take 1: only 0 in A-01-01' } });
});
