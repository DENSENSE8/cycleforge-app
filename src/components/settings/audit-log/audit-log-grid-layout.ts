/**
 * Audit-log column model — MATERIALIZED from a {@link SlotLayout} onto the
 * SHARED compound skeleton, never a hand array.
 *
 * It replaced five hand-written `AdminTableColumn` objects carrying JSX — a
 * second table engine's column type, with no header sort, no Fields picker and
 * no org binding, because that engine never grew them.
 *
 * The skeleton mounts WHOLE — no `.filter`. The photo gutter has no photo on
 * an audit row and paints the typed placeholder, exactly as `kiosk-slot-events`
 * already does: `COMPOUND_SKELETON_FILTER_DEBT` is documented shrink-only, and
 * a new desk cutting chrome to taste is the fork the law names. Chrome headers
 * are RENAMED into this family's vocabulary instead (Entity id · Action ·
 * When · Entity) — a label is family data, geometry is the engine's.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  AUDITLOG_FIELD_CATALOG,
  AUDITLOG_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/audit-log';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type AuditLogGridColumnKey =
  /** Shared compound chrome tracks — see `COMPOUND_COLUMN_KEYS`. */
  | 'select'
  | 'fulfillment'
  | 'thumb'
  | 'item'
  | 'dates'
  | 'state'
  | '_fill'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

export interface AuditLogGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: AuditLogGridColumnKey;
}

/**
 * Materialize the mounted columns from an effective layout. Tracks this family
 * has no fact for are filtered off the MOUNT — never removed from
 * `COMPOUND_TRACKS`.
 */
export function auditLogCompoundColumnsFor(
  layout: SlotLayout,
): readonly AuditLogGridColumn[] {
  const tracks = materializeTracks<AuditLogGridColumn>({
    layout,
    catalog: AUDITLOG_FIELD_CATALOG,
    base: compoundColumnsFor<AuditLogGridColumn>(),
  });
  // The identity slot IS the shared `fulfillment` chrome track. Its WORD is
  // the engine's `Id` on every peer (`slot-table-family.ts`); this
  // family supplies only the FACT the chip paints and its header sorts by.
  const identity = AUDITLOG_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
  return tracks.map((t) => {
    if (t.key === 'fulfillment' && identity) {
      return {
        ...t,
        type: 'id' as const,
        fieldId: identity.id,
        slotDisplayType: identity.displayType,
      };
    }
    // The title line is WHAT HAPPENED, not an item. (The retired header read
    // "Source · Action" while the cell rendered action over source; the render
    // order won — see the catalog docblock.)
    if (t.key === 'item') return { ...t, label: 'Action', gridLabel: 'Action' };
    // One temporal fact on this desk: when the write landed.
    if (t.key === 'dates') return { ...t, label: 'When', gridLabel: 'When' };
    // The pill the old two-line `entity` cell carried on its first line.
    if (t.key === 'state') return { ...t, label: 'Entity', gridLabel: 'Entity' };
    return t;
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const AUDITLOG_COMPOUND_COLUMNS: readonly AuditLogGridColumn[] =
  auditLogCompoundColumnsFor(AUDITLOG_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Every painted DATA track answers, including the four chrome tracks this
 * family paints facts into — a painted DATA header with a dead sort fails
 * `SLOT_TABLE_PAINT_LAW.headerSort`. Chrome that carries no fact (`select`,
 * `thumb`, `_fill`) has no `fieldId` and falls through to null.
 */
export function auditLogSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'audit-log.entity_id';
  if (col.key === 'item') return 'audit-log.action';
  if (col.key === 'state') return 'audit-log.entity_type';
  // The Dates chrome paints the write's stamp, so its header sorts that fact —
  // and sorting an audit log by time is the first thing anybody does with it.
  if (col.key === 'dates') return 'audit-log.when';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isAuditLogColumnSortable(
  columns: readonly AuditLogGridColumn[],
  key: string,
): key is AuditLogGridColumnKey {
  return columns.some((c) => c.key === key && auditLogSortFactFor(c) !== null);
}

/** Dates and counts read newest/highest first; names and ids alphabetically. */
export function defaultDirForAuditLogColumn(
  columns: readonly AuditLogGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
