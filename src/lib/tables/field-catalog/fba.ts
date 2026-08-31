/**
 * FBA field catalog — the bindable Amazon-Prep board facts, as DATA. The THIRD
 * family on the slot engine (kill-list 07 — the `fba` row of the Wave-3 table,
 * executed early on the operator's order to remove the board's forked table):
 * same kernel as orders and pickup, different vocabulary.
 *
 * Every entry names a fact the `/api/fba/board` feed already returns on
 * `FbaBoardItem`; nothing here mints a column. `paths` documents the row
 * properties the resolver reads — resolution itself is `./fba-resolve.ts`,
 * kept separate so this module stays a LEAF (the org layout API route imports
 * it server-side).
 *
 * FBA is a SHEET morph. `fba.asin` is the IDENTITY fact; subtitle bindings
 * are line-detail facts after Title; status bindings close the row. The
 * board display that materialised these tracks was torn out 2026-08-30
 * (hanging the Amazon Prep desk) and is being rebuilt.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const FBA_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'fba.asin',
    family: 'fba',
    label: 'ASIN',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { id: 'asin' },
  },
  {
    id: 'fba.fnsku',
    family: 'fba',
    label: 'FNSKU',
    displayType: 'id',
    slotKinds: ['subtitle'],
    paths: { id: 'fnsku' },
  },
  {
    id: 'fba.qty',
    family: 'fba',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['subtitle'],
    paths: { actual: 'actual_qty', expected: 'expected_qty' },
  },
  {
    id: 'fba.condition',
    family: 'fba',
    label: 'Condition',
    displayType: 'tag',
    slotKinds: ['subtitle'],
    paths: { value: 'condition' },
  },
  {
    id: 'fba.notes',
    family: 'fba',
    label: 'Notes',
    displayType: 'note',
    slotKinds: ['subtitle'],
    paths: { text: 'item_notes' },
  },
  {
    id: 'fba.status',
    family: 'fba',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status'],
    paths: { value: 'item_status' },
  },
  {
    id: 'fba.due',
    family: 'fba',
    label: 'Due',
    displayType: 'date',
    slotKinds: ['status'],
    paths: { value: 'due_date' },
  },
  {
    id: 'fba.plan',
    family: 'fba',
    label: 'Plan',
    displayType: 'id',
    slotKinds: ['status'],
    paths: { ref: 'shipment_ref|amazon_shipment_id', destination: 'destination_fc' },
  },
];

/**
 * The PRODUCT default FBA board layout — near-parity with the retired hand
 * model's scan order (`select · asin · title · fnsku · qty · condition ·
 * status · due · plan · details`; the hand model had status before condition,
 * an adjacent swap the bands impose). `fba.notes` stays in the catalog for an
 * org to bind. `amountFieldId` is null — the board carries no money track.
 * Guard: `fba.test.ts` parses this against the catalog.
 */
export const FBA_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'fba.asin',
  statusBindings: [
    { fieldId: 'fba.status' },
    { fieldId: 'fba.due' },
    { fieldId: 'fba.plan' },
  ],
  subtitleBindings: [
    { fieldId: 'fba.fnsku' },
    { fieldId: 'fba.qty' },
    { fieldId: 'fba.condition' },
  ],
  amountFieldId: null,
};

/** The one tableId this catalog serves — Amazon Prep, kept for org layouts. */
export const FBA_TABLE_LAYOUT_ID = 'fba';
