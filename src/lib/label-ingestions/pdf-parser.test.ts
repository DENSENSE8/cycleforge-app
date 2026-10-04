import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLabelPdf } from './pdf-parser';
const bytes = Buffer.from('%PDF- fake');
const loader = async () => ({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: 'Marketplace: ebay Marketplace Order ID: EB-42 Tracking Number: 1Z999AA10123456784' }] }) }) });
test('parser extracts only explicitly labelled evidence', async () => {
  const result = await parseLabelPdf(bytes, loader); assert.equal(result.accountSource, 'ebay'); assert.equal(result.marketplaceOrderId, 'EB-42'); assert.equal(result.carrier, 'UPS');
});
test('parser records explicit multi-package evidence for quarantine', async () => {
  const result = await parseLabelPdf(bytes, async () => ({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: 'Package 1 of 2' }] }) }) })); assert.equal(result.multiPackageEvidence, true);
});
