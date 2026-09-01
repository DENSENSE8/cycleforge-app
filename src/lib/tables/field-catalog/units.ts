/**
 * Units field catalog — the bindable serialized-unit facts, as DATA. Wave 1.4's
 * first family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `inventory-units` row:
 * "unit browse tracks (serial, SKU, location) as forever keys. Bind into
 * identity/status/subtitle; do not grow another units-only header.").
 *
 * Every entry names a fact `UnitsOverviewRow` already carries. Resolution is
 * `./units-resolve.ts`, kept separate so this module stays a LEAF (the org
 * layout API route imports it server-side; the grid layout module imports it at
 * module scope).
 *
 * Units is a SHEET morph. `units.serial` is the IDENTITY fact — the unit's own
 * scannable handle, which the structural frozen Serial track paints. Status
 * bindings open `status:N` after Product; subtitle bindings would open
 * `subtitle:N` ahead of them.
 *
 * **The SKU is deliberately not its own field.** It is the second line of the
 * Product cell — a unit's title and its SKU are one identity read, and splitting
 * them into two tracks would spend a column on half an answer. The plan's §08
 * "SKU versus item number" question is about the ORDERS row, where the two are
 * genuinely different identifiers.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const UNITS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'units.serial',
    family: 'units',
    label: 'Serial',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'serial_number' },
  },
  {
    id: 'units.status',
    family: 'units',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'current_status' },
  },
  {
    id: 'units.condition',
    family: 'units',
    label: 'Condition',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'condition_grade' },
  },
  // "Where the thing physically is" — the plan's §08 Bin candidate, which this
  // family's feed has carried all along.
  {
    id: 'units.location',
    family: 'units',
    label: 'Location',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'current_location' },
  },
  {
    id: 'units.updated',
    family: 'units',
    label: 'Updated',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'updated_at' },
  },
];

/**
 * The PRODUCT default units layout — visual parity with the retired hand model
 * (`serial · product · status · condition · location · updated`): every track
 * answers a question the operator asks while scanning the unit map — which
 * serial, what item, what lifecycle state, what grade, where it sits, when it
 * last moved. The whole set shipped ON, so the whole set is bound.
 * `amountFieldId` is null — a unit browse carries no money track.
 * Guard: `units.test.ts` parses this against the catalog.
 */
export const UNITS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'units.serial',
  statusBindings: [
    { fieldId: 'units.status' },
    { fieldId: 'units.condition' },
    { fieldId: 'units.location' },
    { fieldId: 'units.updated' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Inventory units entry. */
export const UNITS_TABLE_LAYOUT_ID = 'inventory-units';
