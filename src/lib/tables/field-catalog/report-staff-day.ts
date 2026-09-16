/**
 * Staff-day report field catalog — the bindable facts of ONE (staffer × task)
 * row of a shift report (`/reports?tab=staff`).
 *
 * Sibling of `report-dead-stock` / `report-velocity`, built the same way:
 * facts first, then the PRODUCT layout that binds the ones the compound
 * skeleton does not already paint.
 *
 * ## Where the six facts land
 *
 * | fact         | home on the compound row              |
 * |--------------|---------------------------------------|
 * | `staff`      | the IDENTITY handle                   |
 * | `title`      | the row TITLE (item cell)             |
 * | `checked_at` | the DATES chrome's Hash line          |
 * | (checked?)   | the STATE pill — `Checked` / `Not checked` (adapter chrome) |
 * | `kind`       | a status track                        |
 * | `ticket`     | a status track                        |
 *
 * `checked_at` resolves to the ABSOLUTE INSTANT (never a formatted face), so
 * the engine's date cell owns the face and the header sorts by time — the
 * instant is the entire point of this report ("checked off at this time",
 * operator 2026-09-15).
 *
 * An unchecked task resolves `checked_at` to null TEXT: the engine's blank
 * rule sinks it under both sort directions, and "not done yet" is exactly the
 * row a manager scrolling this table is looking for — the pill keeps saying so
 * in words while the date column stays honestly empty.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const REPORT_STAFF_DAY_FIELD_CATALOG: FieldCatalog = [
  /** Staff attribution — a person, bound to status or subtitle tracks. */
  {
    id: 'report-staff-day.staff',
    family: 'report-staff-day',
    label: 'Staff',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'staffName' },
  },
  {
    id: 'report-staff-day.task',
    family: 'report-staff-day',
    label: 'Task',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'title' },
  },
  /** The compound DATES chrome's fact — the instant the check happened. */
  {
    id: 'report-staff-day.checked_at',
    family: 'report-staff-day',
    label: 'Checked at',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'checkedAt' },
  },
  {
    id: 'report-staff-day.kind',
    family: 'report-staff-day',
    label: 'Cadence',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'kind' },
  },
  /** Ticket / item ID — the machine identifier for the task. */
  {
    id: 'report-staff-day.ticket',
    family: 'report-staff-day',
    label: 'Ticket',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'ticketId' },
  },
  /** Sort/search fact for the roster's own ordering — not a painted track. */
  {
    id: 'report-staff-day.order',
    family: 'report-staff-day',
    label: 'Roster order',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'order' },
  },
];

/**
 * The PRODUCT default: the whole day, least-done staffer first.
 *
 * The skeleton mounts whole, and four of the six facts are painted by chrome
 * it already carries — `staff` (identity chip), `task` (the TITLE), the state
 * pill (adapter), `checked_at` (DATES Hash). The desk binds the two the chrome
 * cannot reach: cadence and ticket.
 *
 * `amountFieldId: null` — no money on a checklist.
 */
export const REPORT_STAFF_DAY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'report-staff-day.ticket',
  statusBindings: [{ fieldId: 'report-staff-day.staff' }, { fieldId: 'report-staff-day.kind' }],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Staff-day entry. */
export const REPORT_STAFF_DAY_TABLE_LAYOUT_ID = 'report-staff-day';
