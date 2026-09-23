/**
 * Tasks field catalog — the bindable facts of an **assigned task**, as DATA.
 *
 * ## The store changed; the family did not
 *
 * This catalog mapped `staff_todos` — a staffer's own private list of strings
 * — until R-A (2026-09-22) ruled that *assigned work* is `work_assignments`
 * (`work_type = 'FOLLOW_UP'`). Those are not the same question: a personal
 * to-do has no assigner, no deadline, no priority and no record behind it,
 * which is exactly the field list the operator asked for. Repointing the
 * REGISTERED family (rather than minting a second one) is the clean cutover —
 * a `tasks` table and a `work-assignments` table living side by side is the
 * third task store the plan exists to prevent.
 *
 * ## Every task points at a record
 *
 * `work_assignments.entity_type` / `entity_id` are NOT NULL, so `tasks.record`
 * always resolves to something and `tasks.ticket` resolves only for the
 * SUPPORT_TICKET arm. The ticket is not a second identity — column one prints
 * the task handle (`slot-table-id-header-law`), and the identity-purity law
 * forbids a person's name there, which is why `tasks.assignee` is bindable
 * into the status/subtitle bands and nowhere near `identity`.
 *
 * Nothing here names lateness. Whether a task is past its deadline depends on
 * the clock, and the surface passes ONE `nowMs` to every row for exactly that
 * reason — the compound state cell already reports it from that shared clock,
 * so a bound "overdue" column would be a second author of one fact.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { SlotTableFamily } from '@/lib/tables/slot-table-family';

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

/**
 * The PRODUCT default Tasks layout — COMPOUND morph, nothing bound.
 *
 * Deliberately still empty after the store swap: the compound row already
 * paints the task text, its handle, the state pill and the deadline delay in
 * its FIXED tracks, so a product-default binding would print those facts
 * twice. An org that wants Assignee or Priority as its own track binds it.
 * Guard: `tasks.test.ts` parses this against the catalog.
 */
export const TASKS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'tasks.task',
  statusBindings: [],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Tasks entry. */
export const TASKS_TABLE_LAYOUT_ID = 'tasks';

/**
 * The family RECORD — `tasks`' whole slot-table registration, as DATA.
 *
 * The record shape rather than a `tasks-grid-layout.ts` + `useTasksTableLayout.ts`
 * pair: those two modules were 200 lines that restated the engine's column law
 * in order to supply four strings, and the cohort tripwire
 * (`SLOT_TABLE_COLUMN_MODULE_DEBT`) refuses a new one. Porting `tasks` with
 * the store swap shrinks that debt list by one instead of relocating it.
 */
export const TASKS_FAMILY: SlotTableFamily = {
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
