/**
 * Daily field catalog — the bindable facts of ONE **agenda row**, as DATA.
 *
 * ## One display, two stores
 *
 * Operator 2026-09-22: *"consolidate the tasks into one display just under a
 * type, like type daily checklist and type task."* The page used to run two
 * tabs over two feeds; it now runs ONE table banded by TYPE. The stores stay
 * separate (`daily_check_items` is the org's shift checklist with a roster
 * behind every row; `work_assignments` is work handed from one person to
 * another with a deadline) — only the DISPLAY merged, so this catalog names
 * the facts of {@link DailyAgendaRow}, the union view model, and every `paths`
 * entry below is a real property on it.
 *
 * ## A fact one half does not carry DASHES
 *
 * That is the whole discipline of a union row. A checklist item has no
 * deadline and a task has no roster fraction; the resolver answers
 * `{ kind: 'value', text: null }` for those and the cell paints a dash. It
 * never borrows the other half's fact to fill a cell, which is how a task
 * would end up claiming a team fraction it has no denominator for.
 *
 * ## What may NOT reach column one
 *
 * `daily.owner` and `daily.assignedBy` carry a person's name, which the
 * identity-purity law (operator 2026-09-15) keeps out of the identity slot.
 * `daily.type` is barred for a different reason: a type word is not a handle —
 * "Task" identifies nothing, and a hundred rows would print it twice over
 * anyway, once in the band caption the operator is reading under.
 *
 * Resolution is `./daily-resolve.ts`, kept separate so this module stays a
 * LEAF.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { SlotTableFamily } from '@/lib/tables/slot-table-family';

export const DAILY_FIELD_CATALOG: FieldCatalog = [
  {
    // The store's own handle, scoped by `type`. The ROW id is `key`
    // (`<type>:<id>`) because two stores number independently — but a lead
    // quotes the bare number to another staffer, and that is what column one
    // prints.
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
  // The one fact a checklist row cannot answer about itself: whether *I* did it
  // is the state pill, whether the SHIFT did it is a different question. It
  // rides the note line by default; an org that wants it as its own track binds
  // it here — which is exactly what the flat model's `team` column was for.
  // A task has no roster and dashes.
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

/**
 * The PRODUCT default Daily layout — COMPOUND morph. The owner track is the
 * one product binding: acceptance says an owned one-off paints that staffer's
 * avatar on the desk by default, and the bound person track is the engine's
 * one way to paint a StaffAvatar on a compound row (kiosk-devices' enrolled_by
 * precedent). It survives the merge because `ownerName` is a fact BOTH halves
 * carry — the checklist item's assignee, the task's.
 *
 * `daily.type` is deliberately NOT bound: the band caption above the rows
 * already says which half you are reading, and a Type column would print that
 * word once per row underneath it. Everything else stays unbound —
 * `daily.kind` paints its word in the note line with no binding, and an org
 * that wants a Kind column binds it. Guard: `daily.test.ts` parses this
 * against the catalog.
 */
export const DAILY_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'daily.item',
  statusBindings: [{ fieldId: 'daily.owner' }],
  subtitleBindings: [],
  amountFieldId: null,
};

/**
 * The one tableId this catalog serves — `PRODUCT_TABLES`' Daily entry.
 *
 * Declared BEFORE {@link DAILY_FAMILY} so the record can read it at module
 * init; a `const` referenced from above its own declaration is a TDZ throw,
 * not a hoist.
 */
export const DAILY_TABLE_LAYOUT_ID = 'daily';

/**
 * The family RECORD — `daily`'s whole slot-table registration, as DATA.
 *
 * Replaces the `daily-grid-layout.ts` + `useDailyTableLayout.ts` pair: those
 * two modules were ~230 lines that restated the engine's column law and its
 * four sort functions in order to supply a handful of strings, and the cohort
 * tripwire (`SLOT_TABLE_COLUMN_MODULE_DEBT`) refuses a new one. Porting
 * `daily` with the union shrinks that debt list by one.
 */
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
    /**
     * DATES binds the DEADLINE, and the checklist half dashes there.
     *
     * Neither half's date is on both: a checklist row has `markedAtMs`, a task
     * has `deadlineAtMs`. The DATES track is not a generic date column — it
     * paints the delay face ("how late is this"), which is a question only a
     * deadline answers. Binding `marked` here would put a "when I ticked it"
     * stamp in the header of a track painting another row's lateness: one
     * header, two facts, and a sort that orders the list by whichever fact the
     * row happened to carry. The stamp keeps its own bindable fact
     * (`daily.marked`) for an org that wants it as a track.
     */
    dates: { field: 'daily.deadline', label: 'Deadline', gridLabel: 'Due' },
    state: { field: 'daily.status', label: 'Status' },
  },
};
