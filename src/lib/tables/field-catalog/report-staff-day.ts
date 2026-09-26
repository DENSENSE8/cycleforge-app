/**
 * Staff-day report field catalog — the bindable facts of ONE (staffer × task) row of a shift report (`/reports?tab=staff`).
 * operator 2026-09-15).
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

/** The PRODUCT default: */
export const REPORT_STAFF_DAY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'report-staff-day.ticket',
  statusBindings: [{ fieldId: 'report-staff-day.staff' }, { fieldId: 'report-staff-day.kind' }],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Staff-day entry. */
export const REPORT_STAFF_DAY_TABLE_LAYOUT_ID = 'report-staff-day';
