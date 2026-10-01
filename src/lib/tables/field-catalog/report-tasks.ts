/** Completed-tasks report field catalog — the bindable facts of ONE finished `work_assignments` row (`work_type = 'FOLLOW_UP'`), as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableFamily } from '@/lib/tables/data-table-family';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

export const REPORT_TASKS_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact — the assignment's own row id, and the ONLY thing column
   * one prints (machine handles only, and
   * a task's two people are two person tracks, never the Id chip).
   */
  {
    id: 'report-tasks.id',
    family: 'report-tasks',
    label: 'Task',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'id' },
  },
  /** What somebody typed when they threw the task — the row's title. */
  {
    id: 'report-tasks.note',
    family: 'report-tasks',
    label: 'Task',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'note' },
  },
  /** The record the task is about, as an operator names it (`Ticket 77`), with the ticket's cached subject when there is one. */
  {
    id: 'report-tasks.record',
    family: 'report-tasks',
    label: 'Linked record',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { type: 'entityType', id: 'entityId', subject: 'ticket.subject' },
  },
  {
    id: 'report-tasks.assignee',
    family: 'report-tasks',
    label: 'Assignee',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { staffId: 'assignee.id', name: 'assignee.name' },
  },
  {
    id: 'report-tasks.assigned_by',
    family: 'report-tasks',
    label: 'Assigned by',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { staffId: 'assignedBy.id', name: 'assignedBy.name' },
  },
  /**
   * The stored `priority` int read back through `taskUrgencyFromPriority` —
   * the threshold lives in `task-vocabulary.ts` and is not re-derived here.
   */
  {
    id: 'report-tasks.urgency',
    family: 'report-tasks',
    label: 'Priority',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'priority' },
  },
  /** The report's ordering fact: when the work actually landed. */
  {
    id: 'report-tasks.completed',
    family: 'report-tasks',
    label: 'Completed',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'completedAtMs' },
  },
  /** The day it was promised for — the Calendar line. Often absent. */
  {
    id: 'report-tasks.deadline',
    family: 'report-tasks',
    label: 'Deadline',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'deadlineAtMs' },
  },
  /**
   * The lifecycle word, from `workStatusLabel` — the same SoT the work-order
   * chips read, so `Done` and `Canceled` cannot be spelled two ways.
   */
  {
    id: 'report-tasks.status',
    family: 'report-tasks',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'status' },
  },
];

/** The PRODUCT default: */
export const REPORT_TASKS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'report-tasks.id',
  statusBindings: [
    { fieldId: 'report-tasks.assignee' },
    { fieldId: 'report-tasks.assigned_by' },
    { fieldId: 'report-tasks.urgency' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Tasks report entry. */
export const REPORT_TASKS_TABLE_LAYOUT_ID = 'report-tasks';

/** The FAMILY RECORD — everything the engine needs to mount this tab, as data. */
export const REPORT_TASKS_FAMILY: DataTableFamily = {
  tableId: REPORT_TASKS_TABLE_LAYOUT_ID,
  catalog: REPORT_TASKS_FIELD_CATALOG,
  productLayout: REPORT_TASKS_PRODUCT_LAYOUT,
  /**
   * Compound only: a stored `sheet` layout would open `subtitle:N` tracks the
   * compound item cell paints inline — `paintMorph` coerces, and the org write
   * gate (`slotMorphsFor('report-tasks')`) refuses the foreign morph.
   */
  paintMorph: 'compound',
  identityFallbackLabel: 'Task',
  bandLabels: { status: 'Task columns', subtitle: 'Under the task' },
  chrome: {
    /** The header word is the engine's `Id`; this names only the FACT. */
    fulfillment: { field: 'report-tasks.id' },
    item: { field: 'report-tasks.note', label: 'Task', gridLabel: 'Task' },
    /** Hash = when it landed; the Calendar line under it is the deadline. */
    dates: { field: 'report-tasks.completed', label: 'Completed', gridLabel: 'Completed' },
    state: { field: 'report-tasks.status', label: 'Status', gridLabel: 'Status' },
  },
};
