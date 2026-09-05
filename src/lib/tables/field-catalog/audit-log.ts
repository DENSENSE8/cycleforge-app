/**
 * Audit-log field catalog — the bindable facts of one audit entry, as DATA.
 *
 * `/settings/audit` was the last admin surface on `AdminTable`, a SECOND table
 * engine with its own column type, its own cells and its own empty states. Its
 * columns were five hand-written `AdminTableColumn` objects carrying JSX, which
 * is the fork the one-table SoT exists to refuse — the audit log had no header
 * sort, no Fields picker, no org binding and no search, because the second
 * engine never grew them.
 *
 * Every fact that display painted is named here instead, so the SAME engine
 * paints it and an admin can bind, hide or reorder the tracks like any other
 * family.
 *
 * The IDENTITY fact is `audit-log.entity_id` — WHAT was written to, and the only
 * fact here that is an `id`, which is what the engine requires of an identity
 * binding (`parseSlotLayout`). `when` is a STATUS track rather than the
 * identity: a log is ordered by time, and a sortable date track orders it where
 * a frozen identity column would only anchor it.
 *
 * COMPOUND morph, like every family that reaches the shared row today. A log
 * reads naturally as a sheet, but sheet morph has no shared row — `CompoundRow`
 * paints compound cell keys only, so a sheet family must supply its own
 * `*GridRow.tsx`. Choosing compound is what keeps this port at zero new row
 * components. (That gap is the one blocking full convergence; see
 * `docs/todo/table-fork-port-PROMPT.md`.)
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const AUDIT_LOG_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'audit-log.when',
    family: 'audit-log',
    label: 'When',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'created_at' },
  },
  {
    id: 'audit-log.actor',
    family: 'audit-log',
    label: 'Actor',
    displayType: 'person',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'actor_name', id: 'actor_staff_id' },
  },
  {
    id: 'audit-log.actor_role',
    family: 'audit-log',
    label: 'Role',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    // Cached at WRITE time on the audit row — the role they held when they
    // acted, not the role they hold now. That is the whole point of an audit.
    paths: { value: 'actor_role' },
  },
  {
    id: 'audit-log.action',
    family: 'audit-log',
    label: 'Action',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'action' },
  },
  {
    id: 'audit-log.source',
    family: 'audit-log',
    label: 'Source',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'source' },
  },
  {
    id: 'audit-log.entity_type',
    family: 'audit-log',
    label: 'Entity',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'entity_type' },
  },
  {
    id: 'audit-log.entity_id',
    family: 'audit-log',
    label: 'Entity id',
    displayType: 'id',
    slotKinds: ['identity', 'status', 'subtitle'],
    paths: { value: 'entity_id' },
  },
  {
    id: 'audit-log.ip',
    family: 'audit-log',
    label: 'IP',
    displayType: 'id',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'ip_address' },
  },
];

/**
 * The PRODUCT default — the retired `AdminTable` columns' own reading order:
 * when · who · what · where it came from · what it touched · from where.
 *
 * `entity_type` and `action` are NOT bound as tracks: on a compound row the
 * shared chrome already paints them (the action is the row TITLE, the entity
 * type is its note), and a fact printed twice on one row is the repetition the
 * column contract refuses. Both stay bindable — an admin who wants the columns
 * back can have them, which the hand-written array never allowed.
 */
export const AUDIT_LOG_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'audit-log.entity_id',
  statusBindings: [
    { fieldId: 'audit-log.when' },
    { fieldId: 'audit-log.actor' },
    { fieldId: 'audit-log.actor_role' },
    { fieldId: 'audit-log.source' },
    { fieldId: 'audit-log.ip' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Audit log entry. */
export const AUDIT_LOG_TABLE_LAYOUT_ID = 'audit-log';
