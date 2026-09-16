/**
 * Incoming catalog guards + resolver behaviour — wave 1.3's second family, and
 * the pair that proves "two tableIds, one cell map". Incoming and Receiving
 * carry the SAME row type through the SAME compound cells; the tests that
 * matter most here are the ones that pin why they are still two vocabularies.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  INCOMING_COMPOUND_COLUMNS,
  incomingCompoundColumnsFor,
} from '@/lib/receiving/receiving-grid-layout';
import { INCOMING_FIELD_CATALOG, INCOMING_PRODUCT_LAYOUT } from './incoming';
import { incomingSlotValuesFor, resolveIncomingSlotValue } from './incoming-resolve';
import { RECEIVING_FIELD_CATALOG } from './receiving';
import { resolveReceivingSlotValue } from './receiving-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 771,
    receiving_id: null,
    tracking_number: '1Z999AA10123456784',
    carrier: 'UPS',
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: 'PO-3310',
    zoho_reference_number: null,
    item_name: 'Bose Solo 5',
    sku: 'BOSE-SOLO-5',
    quantity_received: 0,
    quantity_expected: 4,
    qa_status: 'PENDING',
    workflow_status: null,
    disposition_code: 'STOCK',
    condition_grade: '',
    disposition_audit: [],
    needs_test: false,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: 'PO',
    notes: null,
    po_date: '2026-09-04',
    source_platform: 'EBAY',
    delivery_state: 'IN_TRANSIT',
    serials: [],
    ...overrides,
  } as unknown as ReceivingLineRow;
}

describe('incoming catalog', () => {
  it('has unique ids, all incoming-family, each bindable somewhere', () => {
    const ids = INCOMING_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of INCOMING_FIELD_CATALOG) {
      assert.equal(field.family, 'incoming', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('incoming.'), `${field.id} is not family-qualified`);
    }
  });

  it('shares NO field id with receiving, though it shares the row type and the cells', () => {
    const receiving = new Set(RECEIVING_FIELD_CATALOG.map((f) => f.id));
    for (const field of INCOMING_FIELD_CATALOG) {
      assert.ok(!receiving.has(field.id), `${field.id} is in both catalogs`);
    }
  });

  it('product default parses against the catalog — compound morph, NOTHING bound', () => {
    const parsed = parseSlotLayout(INCOMING_PRODUCT_LAYOUT, INCOMING_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'incoming.order');
    assert.deepEqual(parsed.statusBindings, []);
    assert.deepEqual(parsed.subtitleBindings, []);
  });

  it('refuses Age (a derivation that moves without the row) and the Zoho chip', () => {
    const ids = INCOMING_FIELD_CATALOG.map((f) => f.id);
    assert.ok(!ids.includes('incoming.age'));
    assert.ok(!ids.includes('incoming.zoho'));
  });
});

describe('incomingCompoundColumnsFor — the compound materialization', () => {
  it('the product default IS the shared compound skeleton, in order', () => {
    assert.deepEqual(
      INCOMING_COMPOUND_COLUMNS.map((c) => c.key),
      [...COMPOUND_COLUMN_KEYS],
    );
    assert.ok(INCOMING_COMPOUND_COLUMNS.every((c) => c.fieldId === undefined));
  });

  it('a bound fact opens a status track after the state pill', () => {
    const columns = incomingCompoundColumnsFor({
      ...INCOMING_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'incoming.expected' }],
    });
    // Derived from the shared skeleton: a hand-typed track list goes stale the
    // next time it gains a chrome track (it already did — this pinned a
    // pre-`dates` order with the retired `amount` / `actions` tracks). The
    // CONTRACT is the position: after the state pill, before the slack track.
    const chrome = [...COMPOUND_COLUMN_KEYS];
    const slack = chrome.pop();
    assert.deepEqual(
      columns.map((c) => c.key),
      [...chrome, 'status:1', slack],
    );
    assert.equal(columns.find((c) => c.key === 'status:1')?.slotDisplayType, 'date');
  });
});

describe('resolveIncomingSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveIncomingSlotValue(r, 'incoming.order'), {
      kind: 'value',
      text: 'PO-3310',
    });
    // The EXPECTED count is the question on this lane — nothing has arrived.
    assert.deepEqual(resolveIncomingSlotValue(r, 'incoming.qty'), { kind: 'value', text: '4' });
    assert.deepEqual(resolveIncomingSlotValue(r, 'incoming.tracking'), {
      kind: 'value',
      text: '1Z999AA10123456784',
    });
    assert.ok((resolveIncomingSlotValue(r, 'incoming.expected') as { text: string | null }).text);
    assert.ok((resolveIncomingSlotValue(r, 'incoming.status') as { text: string | null }).text);
    assert.ok((resolveIncomingSlotValue(r, 'incoming.platform') as { text: string | null }).text);
  });

  it('status answers the CARRIER, where receiving.status answers the warehouse', () => {
    // One row, two families, two different true answers — the whole reason
    // Incoming keeps its own catalog rather than reusing receiving's.
    const r = row({ delivery_state: 'IN_TRANSIT', workflow_status: 'UNBOXED' });
    const carrier = resolveIncomingSlotValue(r, 'incoming.status');
    const warehouse = resolveReceivingSlotValue(r, 'receiving.status');
    assert.equal(carrier?.kind, 'value');
    assert.equal(warehouse?.kind, 'value');
    assert.notDeepEqual(carrier, warehouse);
  });

  it("a row with no carrier signal reads 'Expected', never a blank pill", () => {
    assert.deepEqual(resolveIncomingSlotValue(row({ delivery_state: undefined }), 'incoming.status'), {
      kind: 'value',
      text: 'Expected',
    });
  });

  it('honest absence: a missing expected date, quantity or channel is null', () => {
    const empty = row({
      po_date: null,
      quantity_expected: null,
      source_platform: null,
      inbound_source_type: null,
      condition_grade: '',
    } as Partial<ReceivingLineRow>);
    assert.deepEqual(resolveIncomingSlotValue(empty, 'incoming.expected'), { kind: 'value', text: null });
    assert.deepEqual(resolveIncomingSlotValue(empty, 'incoming.qty'), { kind: 'value', text: null });
    assert.deepEqual(resolveIncomingSlotValue(empty, 'incoming.platform'), { kind: 'value', text: null });
    assert.deepEqual(resolveIncomingSlotValue(empty, 'incoming.condition'), { kind: 'value', text: null });
  });

  it('a receiving field id resolves to nothing here — bindings never cross families', () => {
    assert.equal(resolveIncomingSlotValue(row(), 'receiving.location'), null);
  });
});

describe('incomingSlotValuesFor', () => {
  it('keys resolved values by TRACK key', () => {
    const columns = incomingCompoundColumnsFor({
      ...INCOMING_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'incoming.tracking' }],
    });
    assert.deepEqual(incomingSlotValuesFor(row(), columns), {
      'status:1': { kind: 'value', text: '1Z999AA10123456784' },
    });
  });

  it('the product default resolves no slots at all', () => {
    assert.equal(incomingSlotValuesFor(row(), INCOMING_COMPOUND_COLUMNS), undefined);
  });
});
