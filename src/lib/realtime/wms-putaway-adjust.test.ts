import assert from 'node:assert/strict';
import test from 'node:test';
import { executeWmsPutawayAdjust, type WmsPutawayAdjustInput } from './wms-putaway-adjust';

const input: WmsPutawayAdjustInput = {
  commandId: 'putaway-1',
  organizationId: '00000000-0000-4000-8000-000000000001',
  staffId: 7,
  barcode: 'B02',
  sku: 'SKU-1',
  direction: 'put',
  qty: 2,
  reason: 'BIN_ADD',
  reasonCodeId: null,
  notes: null,
};

function deps(capacity = 5, total = 1) {
  let adjusted = 0;
  return {
    get adjusted() { return adjusted; },
    value: {
      assertPermission: async () => {},
      getBin: async () => ({
        location: { id: 4, capacity },
        contents: total > 0 ? [{ sku: 'SKU-1', qty: total }] : [],
      } as never),
      adjust: async ({ delta }: { delta: number }) => {
        adjusted += 1;
        return {
          binContent: { qty: total + delta },
          newStockQty: 10 + delta,
          ledgerId: 99,
        } as never;
      },
      claim: async (_input: WmsPutawayAdjustInput, produce: () => Promise<never>) => ({
        data: await produce(),
        replayed: false,
      }),
      audit: async () => {},
    },
  };
}

test('commits a capacity-valid putaway adjustment', async () => {
  const fake = deps();
  const result = await executeWmsPutawayAdjust(input, fake.value as never);
  assert.equal(result.data.binQty, 3);
  assert.equal(fake.adjusted, 1);
});

test('rejects Slot Full before writing the ledger', async () => {
  const fake = deps(2, 1);
  await assert.rejects(() => executeWmsPutawayAdjust(input, fake.value as never), /Slot Full/);
  assert.equal(fake.adjusted, 0);
});

test('rejects a take larger than SKU on-hand before writing', async () => {
  const fake = deps(10, 1);
  await assert.rejects(() => executeWmsPutawayAdjust({
    ...input,
    direction: 'take',
    qty: 2,
  }, fake.value as never), /cannot take/);
  assert.equal(fake.adjusted, 0);
});

