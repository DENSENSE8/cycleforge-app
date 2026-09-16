import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CartonInspectorLine, CartonInspectorReceiving } from '@/components/receiving/inspector/carton-inspector-model';
import {
  cartonDossierFindings,
  cartonDossierLines,
  orderDossierFindings,
  orderDossierHandoffs,
} from './search-dossier-model';

describe('order dossier findings', () => {
  it('surfaces unpaired and missing item number with an exceptions handoff', () => {
    const findings = orderDossierFindings({ id: 77, item_number: null, sku: 'ABC', sku_catalog_id: null });
    assert.equal(findings.some((f) => f.key === 'unpaired'), true);
    assert.equal(findings.some((f) => f.key === 'no_item_number'), true);
    assert.equal(findings[0]?.href, '/shipping/exceptions?order=77');
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

describe('carton dossier findings', () => {
  const unmatched: CartonInspectorReceiving = {
    id: 12,
    tracking_number: '1Z',
    source: 'unmatched',
    pairing_state: 'UNFOUND',
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: null,
    is_return: false,
    intake_type: 'INBOUND',
    needs_test: false,
    qa_status: null,
    triage_complete: true,
    unbox_opened_at: null,
    unboxed_at: null,
  } as CartonInspectorReceiving;

  it('leads with no matched PO and points at Unbox', () => {
    const findings = cartonDossierFindings(unmatched, { lines: 1 }, []);
    assert.equal(findings[0]?.key, 'unfound');
    assert.equal(findings[0]?.href, '/unbox');
  });

  it('marks unmatched lines without inventing a PO ledger', () => {
    const lines: CartonInspectorLine[] = [
      {
        id: 1,
        sku: 'SKU-1',
        item_name: 'Remote',
        quantity_expected: 2,
        quantity_received: 0,
        zoho_purchaseorder_number: null,
        qa_status: null,
        disposition_code: null,
        condition_grade: 'A',
        workflow_status: null,
        receiving_type: null,
        location_code: null,
        listing_reference: null,
        notes: null,
        tracking_number: null,
      },
    ];
    const painted = cartonDossierLines(lines, true);
    assert.equal(painted[0]?.finding, 'No matched PO');
    assert.match(painted[0]?.meta ?? '', /SKU-1/);
  });
});
