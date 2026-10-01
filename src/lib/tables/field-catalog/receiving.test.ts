/** Receiving catalog guards + resolver behaviour — wave 1.3's mirror of `pickup.test.ts` / `ready.test.ts`, and the first COMPOUND port… */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  RECEIVING_COMPOUND_COLUMNS,
  receivingCompoundColumnsFor,
} from '@/lib/receiving/receiving-grid-layout';
import { RECEIVING_FIELD_CATALOG, RECEIVING_PRODUCT_LAYOUT } from './receiving';
import { receivingSlotValuesFor, resolveReceivingSlotValue } from './receiving-resolve';


function row(overrides: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 512,
    receiving_id: 88,
    tracking_number: '1Z999AA10123456784',
    carrier: 'UPS',
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: 'PO-2201',
    zoho_reference_number: 'REF-9',
    item_name: 'Bose Wave Radio IV',
    sku: 'BOSE-WAVE-IV',
    quantity_received: 2,
    quantity_expected: 2,
    qa_status: 'PENDING',
    workflow_status: 'UNBOXED',
    disposition_code: 'STOCK',
    condition_grade: 'USED_A',
    disposition_audit: [],
    needs_test: true,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: 'PO',
    notes: null,
    unit_price: '42.50',
    staging_location_label: 'BIN A-12',
    serials: [],
    ...overrides,
  } as unknown as ReceivingLineRow;
}

describe('receiving catalog', () => {
  it('has unique ids, all receiving-family, each bindable somewhere', () => {
    const ids = RECEIVING_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of RECEIVING_FIELD_CATALOG) {
      assert.equal(field.family, 'receiving', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('receiving.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog — compound morph, NOTHING bound', () => {
    const parsed = RECEIVING_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'receiving.order');
    // The empty band IS the port's parity guarantee — see the catalog docblock.
    assert.deepEqual(parsed.statusBindings, []);
    assert.deepEqual(parsed.subtitleBindings, []);
  });

  it('names no fact whose resolution needs the rail (the activity stamp) or a derivation it does not own (the Zoho chip)', () => {
    const ids = RECEIVING_FIELD_CATALOG.map((f) => f.id);
    assert.ok(!ids.includes('receiving.date'), 'the activity stamp is axis-dependent');
    assert.ok(!ids.includes('receiving.zoho'), 'the sync chip derives from several columns');
  });
});

describe('receivingCompoundColumnsFor — the compound materialization', () => {
  it('the product default IS the shared compound skeleton, in order', () => {
    assert.deepEqual(
      RECEIVING_COMPOUND_COLUMNS.map((c) => c.key),
      [...COMPOUND_COLUMN_KEYS],
    );
    assert.ok(RECEIVING_COMPOUND_COLUMNS.every((c) => c.fieldId === undefined));
  });

  it('a bound fact opens a status track after the state pill, ahead of the slack track', () => {
    const columns = receivingCompoundColumnsFor({
      ...RECEIVING_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'receiving.location' }, { fieldId: 'receiving.tracking' }],
    });
    // Derived from the shared skeleton on purpose:
    const chrome = [...COMPOUND_COLUMN_KEYS];
    const slack = chrome.pop();
    assert.deepEqual(
      columns.map((c) => c.key),
      [...chrome, 'status:1', 'status:2', slack],
    );
    assert.equal(columns.find((c) => c.key === 'status:1')?.fieldId, 'receiving.location');
  });

  it('compound morph opens NO subtitle tracks — subtitles paint inside the item cell', () => {
    const columns = receivingCompoundColumnsFor({
      ...RECEIVING_PRODUCT_LAYOUT,
      subtitleBindings: [{ fieldId: 'receiving.qty' }],
    });
    assert.ok(!columns.some((c) => c.key.startsWith('subtitle:')));
  });
});

describe('resolveReceivingSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveReceivingSlotValue(r, 'receiving.order'), {
      kind: 'value',
      text: 'PO-2201',
    });
    assert.deepEqual(resolveReceivingSlotValue(r, 'receiving.qty'), { kind: 'value', text: '2' });
    assert.deepEqual(resolveReceivingSlotValue(r, 'receiving.price'), {
      kind: 'value',
      text: '$42.50',
    });
    assert.deepEqual(resolveReceivingSlotValue(r, 'receiving.location'), {
      kind: 'value',
      text: 'BIN A-12',
    });
    assert.deepEqual(resolveReceivingSlotValue(r, 'receiving.tracking'), {
      kind: 'value',
      text: '1Z999AA10123456784',
    });
    assert.equal(resolveReceivingSlotValue(r, 'receiving.status')?.kind, 'value');
    assert.equal(resolveReceivingSlotValue(r, 'receiving.condition')?.kind, 'value');
  });

  it('honest absence: no price is null, never $0.00', () => {
    for (const raw of [null, '', '0', '0.00']) {
      assert.deepEqual(
        resolveReceivingSlotValue(row({ unit_price: raw }), 'receiving.price'),
        { kind: 'value', text: null },
        `unit_price ${JSON.stringify(raw)}`,
      );
    }
  });

  it('the order handle falls back to the Zoho reference before blanking', () => {
    assert.deepEqual(
      resolveReceivingSlotValue(row({ zoho_purchaseorder_number: null }), 'receiving.order'),
      { kind: 'value', text: 'REF-9' },
    );
    assert.deepEqual(
      resolveReceivingSlotValue(
        row({ zoho_purchaseorder_number: null, zoho_reference_number: null }),
        'receiving.order',
      ),
      { kind: 'value', text: null },
    );
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveReceivingSlotValue(row(), 'receiving.ghost'), null);
  });
});

describe('receivingSlotValuesFor', () => {
  it('keys resolved values by TRACK key, so a rebind re-points the cell', () => {
    const columns = receivingCompoundColumnsFor({
      ...RECEIVING_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'receiving.location' }],
    });
    assert.deepEqual(receivingSlotValuesFor(row(), columns), {
      'status:1': { kind: 'value', text: 'BIN A-12' },
    });
  });

  it('the product default resolves no slots at all', () => {
    assert.equal(receivingSlotValuesFor(row(), RECEIVING_COMPOUND_COLUMNS), undefined);
  });
});
