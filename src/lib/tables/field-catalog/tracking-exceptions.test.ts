/**
 * Tracking-exception catalog guards + resolver behaviour — wave 1.4's ninth
 * family. The kill list's line for this row was that "a frozen exception grid
 * cannot be tenant-captured"; these guards pin what replaced it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TRACKING_EXCEPTIONS_SHEET_COLUMNS,
  trackingExceptionsSheetColumnsFor,
  trackingExceptionsSortFactFor,
} from '@/components/tracking-exceptions/grid/tracking-exceptions-grid-layout';
import type { TrackingExceptionRow } from '@/components/tracking-exceptions/types';
import {
  TRACKING_EXCEPTIONS_FIELD_CATALOG,
  TRACKING_EXCEPTIONS_PRODUCT_LAYOUT,
} from './tracking-exceptions';
import { resolveTrackingExceptionSlotValue } from './tracking-exceptions-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<TrackingExceptionRow> = {}): TrackingExceptionRow {
  return {
    id: 77,
    tracking_number: '1Z999AA10123456784',
    domain: 'receiving',
    source_station: 'UNBOX',
    staff_id: 7,
    staff_name: 'dana',
    staff_display_name: 'Dana Vo',
    exception_reason: 'NO_MATCH',
    notes: null,
    status: 'open',
    shipment_id: null,
    receiving_id: 88,
    last_zoho_check_at: null,
    zoho_check_count: 0,
    last_error: null,
    domain_metadata: null,
    resolved_at: null,
    created_at: '2026-08-28T09:00:00.000Z',
    updated_at: '2026-08-30T09:00:00.000Z',
    receiving_source: null,
    receiving_zoho_po_id: null,
    receiving_carrier: 'UPS',
    ...overrides,
  };
}

describe('tracking-exceptions catalog', () => {
  it('has unique ids, all family-qualified, each bindable somewhere', () => {
    const ids = TRACKING_EXCEPTIONS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of TRACKING_EXCEPTIONS_FIELD_CATALOG) {
      assert.equal(field.family, 'tracking-exceptions', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(
        field.id.startsWith('tracking-exceptions.'),
        `${field.id} is not family-qualified`,
      );
    }
  });

  it('product default parses against the catalog (sheet morph; the core view)', () => {
    const parsed = parseSlotLayout(
      TRACKING_EXCEPTIONS_PRODUCT_LAYOUT,
      TRACKING_EXCEPTIONS_FIELD_CATALOG,
    );
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'tracking-exceptions.tracking');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'tracking-exceptions.carrier' },
      { fieldId: 'tracking-exceptions.reason' },
      { fieldId: 'tracking-exceptions.status' },
      { fieldId: 'tracking-exceptions.created' },
    ]);
  });

  it('the investigation facts ship UNBOUND — useful on one row, not down a queue', () => {
    const bound = new Set(
      TRACKING_EXCEPTIONS_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
    );
    for (const id of [
      'tracking-exceptions.source',
      'tracking-exceptions.staff',
      'tracking-exceptions.retries',
      'tracking-exceptions.last_check',
      'tracking-exceptions.notes',
    ]) {
      assert.ok(TRACKING_EXCEPTIONS_FIELD_CATALOG.some((f) => f.id === id), `${id} is offered`);
      assert.ok(!bound.has(id), `${id} is not bound by default`);
    }
  });
});

describe('trackingExceptionsSheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the retired hand model's CORE view scan order", () => {
    assert.deepEqual(
      TRACKING_EXCEPTIONS_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['title', null],
        ['status:1', 'tracking-exceptions.carrier'],
        ['status:2', 'tracking-exceptions.reason'],
        ['status:3', 'tracking-exceptions.status'],
        ['status:4', 'tracking-exceptions.created'],
        ['actions', null],
      ],
    );
  });

  it('the actions track stays last and never sorts', () => {
    const columns = trackingExceptionsSheetColumnsFor({
      ...TRACKING_EXCEPTIONS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'tracking-exceptions.retries' }],
      subtitleBindings: [{ fieldId: 'tracking-exceptions.notes' }],
    });
    const actions = columns.at(-1);
    assert.equal(actions?.key, 'actions');
    assert.equal(trackingExceptionsSortFactFor(actions!), null);
  });
});

describe('resolveTrackingExceptionSlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolveTrackingExceptionSlotValue(r, 'tracking-exceptions.tracking'), {
      kind: 'value',
      text: '1Z999AA10123456784',
    });
    assert.deepEqual(resolveTrackingExceptionSlotValue(r, 'tracking-exceptions.carrier'), {
      kind: 'value',
      text: 'UPS',
    });
    assert.deepEqual(resolveTrackingExceptionSlotValue(r, 'tracking-exceptions.staff'), {
      kind: 'value',
      text: 'Dana Vo',
    });
    assert.ok(
      (resolveTrackingExceptionSlotValue(r, 'tracking-exceptions.created') as { text: string | null })
        .text,
    );
  });

  it('never retried is the ordinary state — blank, never a 0', () => {
    assert.deepEqual(resolveTrackingExceptionSlotValue(row(), 'tracking-exceptions.retries'), {
      kind: 'value',
      text: null,
    });
    assert.deepEqual(
      resolveTrackingExceptionSlotValue(row({ zoho_check_count: 4 }), 'tracking-exceptions.retries'),
      { kind: 'value', text: '4' },
    );
  });

  it('honest absence: an unchecked, unannotated row resolves null', () => {
    const bare = row({ last_zoho_check_at: null, notes: null });
    assert.deepEqual(
      resolveTrackingExceptionSlotValue(bare, 'tracking-exceptions.last_check'),
      { kind: 'value', text: null },
    );
    assert.deepEqual(resolveTrackingExceptionSlotValue(bare, 'tracking-exceptions.notes'), {
      kind: 'value',
      text: null,
    });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveTrackingExceptionSlotValue(row(), 'tracking-exceptions.ghost'), null);
  });
});
