import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  orderDossierFindings,
  orderDossierHandoffs,
} from './search-dossier-model';

describe('order dossier findings', () => {
  it('surfaces unpaired and missing item number with an exceptions handoff', () => {
    const findings = orderDossierFindings({ id: 77, item_number: null, sku: 'ABC', sku_catalog_id: null });
    assert.equal(findings.some((f) => f.key === 'unpaired'), true);
    assert.equal(findings.some((f) => f.key === 'no_item_number'), true);
    assert.equal(findings[0]?.href, '/exceptions?order=77');
  });

  it('makes exceptions the primary handoff when findings exist', () => {
    const handoffs = orderDossierHandoffs(77, true);
    assert.equal(handoffs[0]?.primary, true);
    assert.match(handoffs[0]?.href ?? '', /exceptions/);
  });

  it('hands a clean order to To-ship', () => {
    const findings = orderDossierFindings({
      id: 3,
      item_number: '111',
      sku: 'SKU',
      sku_catalog_id: 9,
    });
    assert.equal(findings.length, 0);
    const handoffs = orderDossierHandoffs(3, false);
    assert.equal(handoffs[0]?.label, 'Open on To-ship');
    assert.equal(handoffs[0]?.primary, true);
  });
});
