/**
 * Daily field catalog — the bindable facts of ONE **agenda row**, as DATA.
 * Operator 2026-09-22: *"consolidate the tasks into one display just under a
 * identity-purity law (operator 2026-09-15) keeps out of the identity slot.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { SlotTableFamily } from '@/lib/tables/slot-table-family';

export const DAILY_FIELD_CATALOG: FieldCatalog = [
  {
    // The store's own handle, scoped by `type`.
    id: 'daily.item',
    family: 'daily',
    label: 'Item',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { id: 'id' },
  },
  // What the row is about — the structural title cell's own fact. Without it
  // the Item header would paint a title and click-sort nothing
  // (`SLOT_TABLE_PAINT_LAW.headerSort`); `sku-bins.item` is the precedent.
  {
    id: 'daily.title',
    family: 'daily',
    label: 'Item',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'title' },
  },
  // THE BAND FACT. Bindable as a column for an org that wants it, but never
  // into identity — see the docblock.
  {
    id: 'daily.type',
    family: 'daily',
    label: 'Type',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'type' },
  },
  {
    // One question, two spellings underneath: a checklist row answers "did I
    // tick it" off `done`, an assignment answers with its lifecycle. Both
    // resolve through `workStatusLabel`, so the pill reads one vocabulary.
    id: 'daily.status',
    family: 'daily',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { done: 'done', status: 'status' },
  },
  // The one fact a checklist row cannot answer about itself:
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
    paths: { value: 'markedAtMs' },
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
    paths: { value: 'cadence' },
  },
  {
    // Who the row belongs to: the staffer a `once` item is assigned to, or the
    // assignee of a task. Person face = StaffAvatar + name; null on recurring
    // and unowned rows paints the honest dash.
    id: 'daily.owner',
    family: 'daily',
    label: 'Owner',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { name: 'ownerName', id: 'ownerId' },
  },
  {
    // Task half only — "who handed this over". NULL on every assignment
    // written before `assigned_by_staff_id` existed, and on every checklist
    // row, because the org's shift list is nobody's handoff.
    id: 'daily.assignedBy',
    family: 'daily',
    label: 'Assigned by',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { name: 'assignedByName' },
  },
  {
    id: 'daily.priority',
    family: 'daily',
    label: 'Priority',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'urgency' },
  },
  {
    id: 'daily.deadline',
    family: 'daily',
    label: 'Deadline',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'deadlineAtMs' },
  },
  {
    id: 'daily.completed',
    family: 'daily',
    label: 'Completed',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'completedAtMs' },
  },
  // The record a task points at, in the words of its kind (`Carton 4412`).
  // A checklist item is about the shift, not a record, and dashes.
  {
    id: 'daily.record',
    family: 'daily',
    label: 'Record',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { label: 'recordLabel', href: 'recordHref' },
  },
];

/** The PRODUCT default Daily layout — COMPOUND morph. */
export const DAILY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'daily.item',
  statusBindings: [{ fieldId: 'daily.owner' }],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Daily entry. */
export const DAILY_TABLE_LAYOUT_ID = 'daily';

/** The family RECORD — `daily`'s whole slot-table registration, as DATA. */
export const DAILY_FAMILY: SlotTableFamily = {
  tableId: DAILY_TABLE_LAYOUT_ID,
  catalog: DAILY_FIELD_CATALOG,
  productLayout: DAILY_PRODUCT_LAYOUT,
  /**
   * Compound only: a stored `sheet` layout would open `subtitle:N` tracks the
   * compound item cell paints inline. `paintMorph` coerces, and the org write
   * gate (`slotMorphsFor('daily')`) refuses the foreign morph.
   */
  paintMorph: 'compound',
  identityFallbackLabel: 'Item',
  bandLabels: { status: 'Agenda columns', subtitle: 'Under the title' },
  chrome: {
    // No `field` — the identity header is the engine's `Id`, bound to the
    // layout's identity fact (`daily.item`).
    fulfillment: {},
    item: { field: 'daily.title', label: 'Item' },
    /** DATES binds the DEADLINE, and the checklist half dashes there. */
    dates: { field: 'daily.deadline', label: 'Deadline', gridLabel: 'Due' },
    state: { field: 'daily.status', label: 'Status' },
  },
};
