/** Warranty catalog guards + resolver behaviour — wave 1.4's third family. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  WARRANTY_SHEET_COLUMNS,
  warrantySheetColumnsFor,
  warrantySortFactFor,
} from '@/components/warranty/grid/warranty-grid-layout';
import type { WarrantyClaimListRow } from '@/lib/warranty/types';
import { WARRANTY_FIELD_CATALOG, WARRANTY_PRODUCT_LAYOUT } from './warranty';
import { resolveWarrantySlotValue, warrantyClockLabel } from './warranty-resolve';


function claim(overrides: Partial<WarrantyClaimListRow> = {}): WarrantyClaimListRow {
  return {
    id: 21,
    claimNumber: 'WC-000481',
    serialNumber: '9M52B2C4',
    sku: 'BOSE-WAVE-IV',
    productTitle: 'Bose Wave Radio IV',
    orderId: null,
    customerId: null,
    customerName: 'Dana Vo',
    status: 'OPEN',
    clockBasis: 'DELIVERED',
    warrantyStartsAt: '2026-06-01T00:00:00.000Z',
    warrantyExpiresAt: '2026-12-01T00:00:00.000Z',
    warrantyDays: 183,
    daysRemaining: 14,
    denialReasonCode: null,
    rmaId: null,
    repairServiceId: null,
    zendeskTicketId: 5512,
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-30T12:00:00.000Z',
    ...overrides,
  } as WarrantyClaimListRow;
}

describe('warranty catalog', () => {
  it('has unique ids, all warranty-family, each bindable somewhere', () => {
    const ids = WARRANTY_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of WARRANTY_FIELD_CATALOG) {
      assert.equal(field.family, 'warranty', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('warranty.'), `${field.id} is not family-qualified`);
    }
  });

  it('the identity fact is bound NOWHERE else — the write gate counts it as a binding', () => {
    const parsed = WARRANTY_PRODUCT_LAYOUT;
    assert.equal(parsed.identityFieldId, 'warranty.claim');
    assert.ok(!parsed.statusBindings.some((b) => b.fieldId === 'warranty.claim'));
    assert.ok(!parsed.subtitleBindings.some((b) => b.fieldId === 'warranty.claim'));
  });

  it('product default parses against the catalog (sheet morph; the core view bound)', () => {
    const parsed = WARRANTY_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'sheet');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'warranty.customer' },
      { fieldId: 'warranty.status' },
      { fieldId: 'warranty.clock' },
      { fieldId: 'warranty.logged' },
    ]);
  });

  it('the support-ticket CONTROL is structural; only the linked-ticket FACT is bindable', () => {
    // The action track is never a catalog field — a row-scoped control must not
    // be something a staffer can hide and then wonder where it went.
    assert.ok(!WARRANTY_FIELD_CATALOG.some((f) => f.id === 'warranty.ticket_action'));
    assert.ok(!WARRANTY_SHEET_COLUMNS.some((c) => c.key === 'ticket' && c.fieldId));
    assert.ok(WARRANTY_SHEET_COLUMNS.some((c) => c.key === 'ticket'));

    // …and the fact IS offered, unbound by default.
    const ticket = WARRANTY_FIELD_CATALOG.find((f) => f.id === 'warranty.ticket');
    assert.ok(ticket, 'the linked-ticket fact is bindable');
    assert.ok(!WARRANTY_PRODUCT_LAYOUT.statusBindings.some((b) => b.fieldId === 'warranty.ticket'));
  });
});

describe('warrantySheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the retired hand model's CORE view scan order", () => {
    assert.deepEqual(
      WARRANTY_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['title', null],
        ['claim', null],
        ['status:1', 'warranty.customer'],
        ['status:2', 'warranty.status'],
        ['status:3', 'warranty.clock'],
        ['status:4', 'warranty.logged'],
        ['ticket', null],
      ],
    );
  });

  it('the structural ticket action stays last however many facts are bound', () => {
    const columns = warrantySheetColumnsFor({
      ...WARRANTY_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'warranty.serial' }, { fieldId: 'warranty.ticket' }],
      subtitleBindings: [{ fieldId: 'warranty.customer' }],
    });
    assert.equal(columns.at(-1)?.key, 'ticket');
    assert.deepEqual(
      columns.map((c) => c.key),
      ['select', 'title', 'claim', 'subtitle:1', 'status:1', 'status:2', 'ticket'],
    );
  });

  it('sort facts: structural tracks map to their own facts, the action never sorts', () => {
    const byKey = new Map(WARRANTY_SHEET_COLUMNS.map((c) => [c.key, warrantySortFactFor(c)]));
    assert.equal(byKey.get('select'), null);
    assert.equal(byKey.get('ticket'), null);
    assert.equal(byKey.get('title'), 'title');
    assert.equal(byKey.get('claim'), 'warranty.claim');
    assert.equal(byKey.get('status:3'), 'warranty.clock');
  });
});

describe('resolveWarrantySlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const c = claim();
    assert.deepEqual(resolveWarrantySlotValue(c, 'warranty.claim'), {
      kind: 'value',
      text: 'WC-000481',
    });
    assert.deepEqual(resolveWarrantySlotValue(c, 'warranty.customer'), {
      kind: 'value',
      text: 'Dana Vo',
    });
    assert.deepEqual(resolveWarrantySlotValue(c, 'warranty.clock'), {
      kind: 'value',
      text: '14d left',
    });
    assert.deepEqual(resolveWarrantySlotValue(c, 'warranty.ticket'), {
      kind: 'value',
      text: '#5512',
    });
  });

  it('a claim with no ticket has not gone to support — a dash, never a 0', () => {
    assert.deepEqual(resolveWarrantySlotValue(claim({ zendeskTicketId: null }), 'warranty.ticket'), {
      kind: 'value',
      text: null,
    });
  });

  it('the countdown face distinguishes no-clock from no-cover', () => {
    assert.equal(warrantyClockLabel(null), 'No date');
    assert.equal(warrantyClockLabel(-3), 'Expired');
    assert.equal(warrantyClockLabel(0), 'Last day');
    assert.equal(warrantyClockLabel(9), '9d left');
  });

  it('honest absence: no serial and no customer resolve null', () => {
    const bare = claim({ serialNumber: null, customerName: null });
    assert.deepEqual(resolveWarrantySlotValue(bare, 'warranty.serial'), { kind: 'value', text: null });
    assert.deepEqual(resolveWarrantySlotValue(bare, 'warranty.customer'), {
      kind: 'value',
      text: null,
    });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveWarrantySlotValue(claim(), 'warranty.ghost'), null);
  });
});
