/**
 * Daily field catalog — the bindable shift-checklist facts, as DATA. Wave 1.3's
 * third family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `daily` row: "a checklist
 * painted as a unique grid. It is still an information table; org 'what we
 * check on the shift board' is layout, not a new column file.").
 *
 * Every entry names a fact `DailyTaskRow` already carries — a view model the
 * report assembles once, never re-derived per cell. Resolution is
 * `./daily-resolve.ts`, kept separate so this module stays a LEAF.
 *
 * Daily is a COMPOUND morph. `daily.item` is the identity fact — the
 * `daily_check_items.id` handle. It is deliberately INERT on the painted row:
 * the compound adapter sets `orderId: null` because a checklist item has no
 * order and no carrier, and two honest dashes are the right answer there. The
 * identity binding still has to name a real handle, and this is the one the row
 * actually has.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const DAILY_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'daily.item',
    family: 'daily',
    label: 'Item',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { id: 'id' },
  },
  {
    id: 'daily.status',
    family: 'daily',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'done' },
  },
  // The one fact a checklist row cannot answer about itself: whether *I* did it
  // is the state pill, whether the SHIFT did it is a different question. It
  // rides the note line by default; an org that wants it as its own track binds
  // it here — which is exactly what the flat model's `team` column was for.
  {
    id: 'daily.team',
    family: 'daily',
    label: 'Team',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { done: 'teamDone', total: 'teamTotal' },
  },
  {
    id: 'daily.marked',
    family: 'daily',
    label: 'Checked',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'markedAt' },
  },
  {
    // Cadence, not subject — the exception marker. Only `once` resolves a
    // word; `recurring` says nothing ("only the exception is marked", the
    // same law as the state pill: a hundred loud rows leave no signal).
    id: 'daily.kind',
    family: 'daily',
    label: 'Kind',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'kind' },
  },
  {
    // Who a `once` item belongs to. Person face = StaffAvatar + name; null on
    // recurring and unowned rows paints the honest dash.
    id: 'daily.owner',
    family: 'daily',
    label: 'Owner',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { display: 'assignedStaffName', name: 'assignedStaffName', value: 'assignedStaffId' },
  },
];

/**
 * The PRODUCT default Daily layout — COMPOUND morph. The owner track is the
 * one product binding: acceptance says an owned one-off paints that staffer's
 * avatar on the desk by default, and the bound person track is the engine's
 * one way to paint a StaffAvatar on a compound row (kiosk-devices' enrolled_by
 * precedent). Everything else stays unbound — `daily.kind` paints its word in
 * the note line with no binding, and an org that wants a Kind column binds it.
 * Guard: `daily.test.ts` parses this against the catalog.
 */
export const DAILY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'daily.item',
  statusBindings: [{ fieldId: 'daily.owner' }],
  subtitleBindings: [],
  amountFieldId: null,
};


/** The one tableId this catalog serves — `PRODUCT_TABLES`' Daily entry. */
export const DAILY_TABLE_LAYOUT_ID = 'daily';
