/**
 *   node --import tsx --test src/lib/kiosk/consult-proposal.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMPTY_CONSULT_PRESENTATION } from '@/lib/counter/consult-stance';
import type { KioskCartLine } from '@/lib/kiosk/cart-line';
import { resolveConsultProposal } from './consult-proposal';

function line(overrides: Partial<KioskCartLine> = {}): KioskCartLine {
  return {
    id: 'l1',
    type: 'REPAIR',
    title: 'Galaxy S24 screen',
    quantity: 1,
    unitAmountCents: 12900,
    payload: { productModel: 'S24', serialNumber: 'SN-88', price: '129' },
    ...overrides,
  };
}

describe('resolveConsultProposal', () => {
  it('paints the focused line title + paperwork identifier, not an internal id', () => {
    const proposal = resolveConsultProposal([line()], {
      lineId: 'l1',
      catalog: null,
    });
    assert.equal(proposal?.title, 'Galaxy S24 screen');
    assert.equal(proposal?.identifierLabel, 'Serial');
    assert.equal(proposal?.identifierValue, 'SN-88');
    assert.equal(proposal?.lineType, 'REPAIR');
    assert.equal(proposal?.unitAmountCents, 12900);
  });

  it('falls back to the catalog ref when no line is focused', () => {
    const proposal = resolveConsultProposal([], {
      lineId: null,
      catalog: {
        title: 'OtterBox Commuter',
        lineType: 'RETAIL',
        identifierLabel: 'SKU',
        identifierValue: 'OTB-1',
        unitAmountCents: 4999,
      },
    });
    assert.equal(proposal?.title, 'OtterBox Commuter');
    assert.equal(proposal?.identifierValue, 'OTB-1');
    assert.equal(proposal?.source, 'catalog');
  });

  it('is empty when nothing is presented — Show is not a failed kiosk', () => {
    assert.equal(resolveConsultProposal([line()], EMPTY_CONSULT_PRESENTATION), null);
  });
});
