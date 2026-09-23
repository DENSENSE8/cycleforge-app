/**
 * Completed-tasks report field catalog — the bindable facts of ONE finished
 * `work_assignments` row (`work_type = 'FOLLOW_UP'`), as DATA.
 *
 * Sibling of `report-staff-day` / `report-packer-day`, built the same way:
 * facts first, then the PRODUCT layout that binds the ones the compound
 * skeleton does not already paint.
 *
 * ## Why this is NOT the registered `tasks` family
 *
 * `tasks` is a CHECKLIST one staffer works: its rows are OPEN work, its
 * gutter checkbox is a verb, and its layout document is tuned for deciding
 * what to do next. This family is the RECORD of work already finished — no
 * verbs, no checkbox, and the facts an operator reads are the two people and
 * the two dates, not the next action. One document over both would mean
 * hiding `Deadline` on the report densified the working desk, which is the
 * same reason `report-packer-day` is not the `packer` bench history.
 *
 * ## Where each fact lands on the compound row
 *
 * | fact            | home                                             |
 * |-----------------|--------------------------------------------------|
 * | `id`            | the IDENTITY chip — `#<work_assignments.id>`      |
 * | `note`          | the row TITLE (item cell)                         |
 * | `record`        | the note line under the title, + the title href   |
 * | `assignee`      | `status:1`                                        |
 * | `assigned_by`   | `status:2`                                        |
 * | `urgency`       | `status:3`                                        |
 * | `completed`     | the DATES chrome, Hash line                       |
 * | `deadline`      | the DATES chrome, Calendar line                   |
 * | `status`        | the STATE pill                                    |
 *
 * **Both dates ride the one DATES chrome**, which is what that cell is for:
 * Hash = when the work landed, Calendar = the day it was promised for. A
 * completed task is the one row where those two are worth reading together —
 * the report's whole question is "did it land by the deadline" — and binding
 * `deadline` into a track beside the chrome would print the same instant
 * twice. It stays a catalog FACT, so its header sorts, the search box matches
 * it, and a staffer who wants it as an explicit column has a free slot to
 * bind it into (the house form of the retired `tier: 'optional'`).
 *
 * `amountFieldId: null` — a task has no money fact, and inventing one from the
 * record it points at would be a new query, not a report.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotTableFamily } from '@/lib/tables/slot-table-family';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const REPORT_TASKS_FIELD_CATALOG: FieldCatalog = [
  /**
   * The IDENTITY fact — the assignment's own row id, and the ONLY thing column
   * one prints (`slot-table-identity-purity-law.ts`: machine handles only, and
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
  /**
   * The record the task is about, as an operator names it (`Ticket 77`), with
   * the ticket's cached subject when there is one. The noun comes from
   * `TASK_DESK_RECORD_NOUN` — a fifth spelling of "Carton" is how two surfaces
   * come to disagree.
   */
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

/**
 * The PRODUCT default: WHO, and how urgent it was.
 *
 * The skeleton mounts WHOLE, so `select · fulfillment · thumb · item · dates ·
 * state · status:N · _fill` leaves four status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS` (10). This report spends THREE, because five of
 * its nine facts are painted by chrome the skeleton already mounts (`id`,
 * `note`, `record`, `completed` + `deadline`, `status`).
 *
 * The two PEOPLE lead because a completed-task record is read to answer "who
 * did this, and who asked for it" — and because they are the two facts the
 * identity column may never carry.
 *
 * Guard: `report-tasks.test.ts` parses this against the catalog.
 */
export const REPORT_TASKS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'report-tasks.id',
  statusBindings: [
    { fieldId: 'report-tasks.assignee' },
    { fieldId: 'report-tasks.assigned_by' },
    { fieldId: 'report-tasks.urgency' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Tasks report entry. */
export const REPORT_TASKS_TABLE_LAYOUT_ID = 'report-tasks';

/**
 * The FAMILY RECORD — everything the engine needs to mount this tab, as data.
 *
 * No `use{Family}TableLayout.ts` and no `{family}-grid-layout.ts`: those are
 * `SLOT_TABLE_COLUMN_MODULE_DEBT`, which is documented shrink-only, and this
 * family is new. The four chrome headers BIND catalog facts, so their word and
 * the fact their click sorts by come from the same place.
 */
export const REPORT_TASKS_FAMILY: SlotTableFamily = {
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
