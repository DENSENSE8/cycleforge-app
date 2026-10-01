/** Tasks field catalog — the bindable facts of an **assigned task**, as DATA. */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';
import type { DataTableFamily } from '@/lib/tables/data-table-family';

export const TASKS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'tasks.task',
    family: 'tasks',
    label: 'Task',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { id: 'id' },
  },
  {
    id: 'tasks.status',
    family: 'tasks',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'status' },
  },
  // Urgency is the EXISTING priority int read through one threshold
  // (`taskUrgencyFromPriority`), never a second boolean beside it.
  {
    id: 'tasks.priority',
    family: 'tasks',
    label: 'Priority',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'urgency', raw: 'priority' },
  },
  {
    id: 'tasks.assignee',
    family: 'tasks',
    label: 'Assignee',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { name: 'assignee.name', id: 'assignee.id' },
  },
  // "Who it's assigned by" — the only non-recipient staff column on
  // `work_assignments`, and the reason "what did I hand off" is answerable.
  {
    id: 'tasks.assignedBy',
    family: 'tasks',
    label: 'Assigned by',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { name: 'assignedBy.name', id: 'assignedBy.id' },
  },
  {
    id: 'tasks.start',
    family: 'tasks',
    label: 'Started',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'startedAtMs' },
  },
  {
    id: 'tasks.deadline',
    family: 'tasks',
    label: 'Deadline',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'deadlineAtMs' },
  },
  {
    id: 'tasks.completed',
    family: 'tasks',
    label: 'Completed',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'completedAtMs' },
  },
  // The record the task is about, in the words of its kind (Order 4412 /
  // Carton 981 / Ticket 77). One fact, so a row never claims two subjects.
  {
    id: 'tasks.record',
    family: 'tasks',
    label: 'Record',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { type: 'entityType', id: 'entityId' },
  },
  {
    id: 'tasks.ticket',
    family: 'tasks',
    label: 'Ticket',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { subject: 'ticket.subject', id: 'ticket.id' },
  },
];

/** The PRODUCT default Tasks layout — COMPOUND morph, nothing bound. */
export const TASKS_PRODUCT_LAYOUT: DataTableColumnLayout = {
  morph: 'compound',
  identityFieldId: 'tasks.task',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
}

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Tasks entry. */
export const TASKS_TABLE_LAYOUT_ID = 'tasks';

/** The family RECORD — `tasks`' whole data-table registration, as DATA. */
export const TASKS_FAMILY: DataTableFamily = {
  tableId: TASKS_TABLE_LAYOUT_ID,
  catalog: TASKS_FIELD_CATALOG,
  productLayout: TASKS_PRODUCT_LAYOUT,
  /**
   * Compound only: a stored `sheet` layout would open `subtitle:N` tracks the
   * compound item cell paints inline. `paintMorph` coerces, and the org write
   * gate (`slotMorphsFor('tasks')`) refuses the foreign morph.
   */
  paintMorph: 'compound',
  identityFallbackLabel: 'Task',
  bandLabels: { status: 'Task columns', subtitle: 'Under the task' },
  chrome: {
    // No `field` — the identity header is the engine's `Id`, bound to the
    // layout's identity fact (`tasks.task`).
    fulfillment: {},
    item: { field: 'tasks.record', label: 'Record' },
    /** "What is due, and how late is it" — the delay track's own question. */
    dates: { field: 'tasks.deadline', label: 'Deadline', gridLabel: 'Due' },
    state: { field: 'tasks.status', label: 'Status' },
  },
};
