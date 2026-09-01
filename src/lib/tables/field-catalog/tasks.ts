/**
 * Tasks field catalog — the bindable personal-to-do facts, as DATA. Wave 1.3's
 * fourth family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `tasks` row: "sibling of
 * daily (different store) — same slots, different catalog").
 *
 * Tasks joining the compound layout was already the test of the SEAM: every
 * other compound family is a warehouse line with a photo, an order and a
 * carrier, and a personal to-do has none of those, yet it mounts the identical
 * model and the empty tracks read as honest dashes. This port is the test of
 * the VOCABULARY: `staff_todos` and `daily_check_items` look alike and are not
 * the same question — one is a staffer's own list, the other is the org's shift
 * checklist with a roster behind every row — so they get two catalogs over one
 * cell map, exactly as incoming and receiving do.
 *
 * `tasks.task` is the identity fact — the `staff_todos.id` handle. Like
 * `daily.item` it is INERT on the painted row: the adapter sets `orderId: null`
 * because a personal to-do has no order, and an honest dash is the right answer
 * there. The identity binding still has to name a real handle.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

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
    paths: { done: 'done', archived: 'archived' },
  },
  {
    id: 'tasks.kind',
    family: 'tasks',
    label: 'Kind',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'kind' },
  },
  // The task's QUALIFIER — which list this belongs to. It rides the note line
  // by default (`staff_todos` has no note column of its own); an org or staffer
  // who wants it as its own track binds it, which is what the retired flat
  // model's `station` column was.
  {
    id: 'tasks.station',
    family: 'tasks',
    label: 'Station',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'station' },
  },
  // A recurring task has no deadline; it has a PERIOD. "Resets" is the honest
  // word for when the cycle turns over, and a general task reads as a dash
  // rather than inventing a date.
  {
    id: 'tasks.resets',
    family: 'tasks',
    label: 'Resets',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'resetsAtMs' },
  },
  {
    id: 'tasks.checked',
    family: 'tasks',
    label: 'Checked',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'checkedAtMs' },
  },
];

/**
 * The PRODUCT default Tasks layout — COMPOUND morph, nothing bound, which is
 * byte-for-byte what the workbench paints today. Reproduce, then improve.
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
