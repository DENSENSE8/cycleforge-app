import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OrderPacket, PacketLabelDocument } from '@/lib/label-prints/order-packet-contracts';
import { labelBuyPurpose } from './label-buy-purpose';

const bare: Pick<OrderPacket, 'shipment' | 'label'> = { shipment: null, label: { state: 'missing', labels: [], documents: [], suggestions: [] } };

test('an order buys its first label until it has tracking or a label, then a replacement', () => {
  assert.equal(labelBuyPurpose(bare), 'outbound');
  assert.equal(labelBuyPurpose({ ...bare, shipment: { trackingNumber: '1Z', carrier: null } }), 'replacement');
  assert.equal(labelBuyPurpose({ ...bare, label: { ...bare.label, documents: [{ key: 'doc:1' } as PacketLabelDocument] } }), 'replacement');
});
