import assert from 'node:assert/strict';
import test from 'node:test';
import { isPrintPacketIncomplete, parsePaperworkOrderId } from './print-packet';

test('packet is incomplete without a shipping-label document', () => {
  assert.equal(
    isPrintPacketIncomplete({
      hasShippingLabelDocument: false,
      linkedDocumentCount: 4,
      docsNotRequired: true,
    }),
    true,
  );
});

test('packet is incomplete with a label but no G2 docs and no exemption', () => {
  assert.equal(
    isPrintPacketIncomplete({
      hasShippingLabelDocument: true,
      linkedDocumentCount: 0,
      docsNotRequired: false,
    }),
    true,
  );
});

test('packet is complete with a label and G2 docs', () => {
  assert.equal(
    isPrintPacketIncomplete({
      hasShippingLabelDocument: true,
      linkedDocumentCount: 1,
      docsNotRequired: false,
    }),
    false,
  );
});

test('packet is complete with a label and the G2 exemption', () => {
  assert.equal(
    isPrintPacketIncomplete({
      hasShippingLabelDocument: true,
      linkedDocumentCount: 0,
      docsNotRequired: true,
    }),
    false,
  );
});

test('parsePaperworkOrderId rejects junk', () => {
  assert.equal(parsePaperworkOrderId(null), null);
  assert.equal(parsePaperworkOrderId(''), null);
  assert.equal(parsePaperworkOrderId('0'), null);
  assert.equal(parsePaperworkOrderId('abc'), null);
  assert.equal(parsePaperworkOrderId('42'), 42);
});
