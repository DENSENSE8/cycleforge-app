import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPoIntakeReply,
  addPoIntakeLine,
  buildPoIntakeImportBodies,
  canConfirmPoIntake,
  countReadyPoIntakeOrders,
  EMPTY_PO_INTAKE_DRAFT,
  missingPoIntakeFields,
  parseExplicitQuantity,
  poIntakeMissingPrompt,
  poIntakeOrderChipLabel,
  removePoIntakeLine,
} from './po-intake-draft';
import { draftFromExtractArgs } from './extract-po-llm';

describe('po-intake-draft completeness', () => {
  it('refuses silent qty=1 — empty quantity is missing', () => {
    const draft = {
      ...EMPTY_PO_INTAKE_DRAFT(),
      orderId: '111-222-333',
      platform: 'amazon',
      trackingNumber: '1Z999',
      lines: [{ sku: 'SKU-1', itemName: '', quantity: '', lineItemId: '', catalogId: null, listingUrl: '' }],
    };
    assert.deepEqual(missingPoIntakeFields(draft), ['quantity']);
    assert.equal(canConfirmPoIntake(draft), false);
  });

  it('requires order id and at least one line', () => {
    const draft = EMPTY_PO_INTAKE_DRAFT();
    const missing = missingPoIntakeFields(draft);
    assert.ok(missing.includes('order_id'));
    assert.ok(missing.includes('empty_lines'));
  });

  it('is ready when all required fields are explicit', () => {
    const draft = {
      ...EMPTY_PO_INTAKE_DRAFT(),
      orderId: 'PO-9',
      platform: 'ebay',
      trackingNumber: '940011189922',
      lines: [{ sku: 'A', itemName: 'Dock', quantity: '2', lineItemId: 'L1', catalogId: null, listingUrl: '' }],
    };
    assert.deepEqual(missingPoIntakeFields(draft), []);
    assert.equal(canConfirmPoIntake(draft), true);
  });

  it('parseExplicitQuantity rejects non-integers and zero', () => {
    assert.equal(parseExplicitQuantity(''), null);
    assert.equal(parseExplicitQuantity('0'), null);
    assert.equal(parseExplicitQuantity('1.5'), null);
    assert.equal(parseExplicitQuantity('3'), 3);
  });

  it('applyPoIntakeReply fills the first missing slot', () => {
    const draft = {
      ...EMPTY_PO_INTAKE_DRAFT(),
      platform: 'amazon',
      trackingNumber: '1Z',
      lines: [{ sku: 'S', itemName: '', quantity: '1', lineItemId: '', catalogId: null, listingUrl: '' }],
    };
    const next = applyPoIntakeReply(draft, '111-000', missingPoIntakeFields(draft));
    assert.equal(next.orderId, '111-000');
  });

  it('poIntakeMissingPrompt lists human labels', () => {
    assert.match(poIntakeMissingPrompt(['quantity', 'tracking_number']), /quantity/);
    assert.match(poIntakeMissingPrompt(['quantity', 'tracking_number']), /tracking/);
  });

  it('buildPoIntakeImportBodies preserves return type and return metadata', () => {
    const bodies = buildPoIntakeImportBodies(
      {
        ...EMPTY_PO_INTAKE_DRAFT(),
        kind: 'return',
        orderId: 'R-1',
        trackingNumber: 'T1',
        returnReason: 'Damaged',
        rmaId: 'RMA-1',
        lines: [{ sku: 'A', itemName: '', quantity: '1', lineItemId: '', catalogId: null, listingUrl: '' }],
      },
      () => ({ sourceType: 'amazon', sourcePlatform: 'amazon' }),
    );
    assert.deepEqual(bodies[0], {
      kind: 'return',
      source_type: 'amazon',
      source_platform: 'amazon',
      receiving_type: 'RETURN',
      priority_tier: null,
      order_id: 'R-1',
      quantity: 1,
      sku: 'A',
      tracking_number: 'T1',
      return_reason: 'Damaged',
      rma_id: 'RMA-1',
    });
  });

  it('buildPoIntakeImportBodies emits one body per line', () => {
    const bodies = buildPoIntakeImportBodies(
      {
        ...EMPTY_PO_INTAKE_DRAFT(),
        orderId: 'O1',
        platform: 'amazon',
        trackingNumber: 'T1',
        lines: [
          { sku: 'A', itemName: '', quantity: '1', lineItemId: '', catalogId: 9, listingUrl: 'https://a.example/x' },
          { sku: '', itemName: 'Cable', quantity: '4', lineItemId: 'x', catalogId: null, listingUrl: '' },
        ],
      },
      (platform) => ({
        sourceType: platform === 'amazon' ? 'amazon' : 'manual',
        sourcePlatform: platform,
      }),
    );
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0]?.quantity, 1);
    assert.equal(bodies[1]?.quantity, 4);
    assert.equal(bodies[1]?.item_name, 'Cable');
    assert.equal(bodies[0]?.sku_catalog_id, 9);
    assert.equal(bodies[0]?.listing_url, 'https://a.example/x');
  });

  it('add/remove line helpers keep at least one blank line', () => {
    const withTwo = addPoIntakeLine(EMPTY_PO_INTAKE_DRAFT());
    assert.equal(withTwo.lines.length, 2);
    const back = removePoIntakeLine(withTwo, 1);
    assert.equal(back.lines.length, 1);
    const stillOne = removePoIntakeLine(back, 0);
    assert.equal(stillOne.lines.length, 1);
    assert.equal(stillOne.lines[0]?.sku, '');
  });

  it('countReadyPoIntakeOrders and chip labels', () => {
    const ready = {
      ...EMPTY_PO_INTAKE_DRAFT(),
      orderId: '111-222-33344455',
      trackingNumber: '1Z',
      lines: [{ sku: 'A', itemName: '', quantity: '1', lineItemId: '', catalogId: null, listingUrl: '' }],
    };
    const incomplete = EMPTY_PO_INTAKE_DRAFT();
    assert.equal(countReadyPoIntakeOrders([ready, incomplete]), 1);
    assert.equal(poIntakeOrderChipLabel(ready, 0), '…222-33344455');
    assert.equal(poIntakeOrderChipLabel(incomplete, 2), 'Order 3');
  });
});

describe('draftFromExtractArgs', () => {
  it('leaves quantity blank when the model omitted it', () => {
    const draft = draftFromExtractArgs({
      order_id: { value: '111', confidence: 'high' },
      platform: { value: 'amazon', confidence: 'high' },
      line_items: [{ sku: 'X', item_name: 'Thing' }],
    });
    assert.equal(draft.orderId, '111');
    assert.equal(draft.lines[0]?.quantity, '');
    assert.equal(canConfirmPoIntake({
      ...draft,
      trackingNumber: '1Z',
    }), false);
  });
});
