import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OrderPacket, OrderPacketLine, PacketSlotState } from '@/lib/label-prints/order-packet-contracts';
import { docTabCount, docTabState, firstGapTab } from './doc-tabs';

const line = (state: PacketSlotState, docs = 0): OrderPacketLine =>
  ({ orderLineId: 1, itemNumber: null, skuCatalogId: null, sku: null, title: 't', quantity: 1, photoUrl: null, paperworkNotRequired: false, state, documents: Array.from({ length: docs }, () => ({})) }) as OrderPacketLine;

const packet = (label: PacketSlotState, slip: PacketSlotState, lines: OrderPacketLine[]): OrderPacket =>
  ({
    label: { state: label, labels: [], documents: [], suggestions: [] },
    slip: { state: slip, documents: [] },
    lines,
  }) as unknown as OrderPacket;

test('paperwork tab state is the worst line', () => {
  assert.equal(docTabState(packet('filled', 'filled', [line('filled'), line('missing')]), 'paperwork'), 'missing');
  assert.equal(docTabState(packet('filled', 'filled', [line('not_required'), line('filled')]), 'paperwork'), 'filled');
  assert.equal(docTabState(packet('filled', 'filled', []), 'paperwork'), 'not_required');
});

test('firstGapTab opens the first owed tab, else the asked one', () => {
  assert.equal(firstGapTab(packet('filled', 'missing', [line('missing')]), 'label'), 'slip');
  assert.equal(firstGapTab(packet('filled', 'filled', [line('filled')]), 'paperwork'), 'paperwork');
});

test('paperwork count sums every line', () => {
  assert.equal(docTabCount(packet('filled', 'filled', [line('filled', 2), line('filled', 1)]), 'paperwork'), 3);
});
