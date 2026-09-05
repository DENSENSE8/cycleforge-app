/**
 * Audit log column model — MATERIALIZED from a {@link SlotLayout} onto the
 * SHARED compound skeleton, never a hand array.
 *
 * It replaced five `AdminTableColumn` objects carrying JSX — a second engine's
 * column type, with no header sort, no Fields picker and no org binding, because
 * that engine never grew them. What is structural here is only which shared
 * tracks the mount drops; everything after that is a catalog fact an admin binds.
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  AUDIT_LOG_FIELD_CATALOG,
  AUDIT_LOG_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/audit-log';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type AuditLogGridColumnKey =
  | 'select'
  | 'fulfillment'
  | 'thumb'
  | 'item'
  | 'dates'
  | 'state'
  | 'amount'
  | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface AuditLogGridColumn
  extends Omit<LedgerGridColumnModel, 'key'>,
    SlotTrackFields {
  key: AuditLogGridColumnKey;
}

/**
 * Materialize the mounted columns from an effective layout.
 *
 * Three shared tracks are filtered off this MOUNT (never removed from
 * `COMPOUND_TRACKS`):
 *
 * - `dates` — an audit entry has no deadline. Its one date, `when`, is a bound
 *   STATUS track: a log is ORDERED by time, and a sortable track orders it
 *   where a chrome cell would only display it.
 * - `select` — the log is a read map (`multiSelect: false`). A checkbox that
 *   selects rows nothing can act on is a control with no verb.
 * - `thumb` — there is no photo of an audit entry, and the placeholder would be
 *   3rem of identical grey on every row.
 */
export function auditLogCompoundColumnsFor(
  layout: SlotLayout,
): readonly AuditLogGridColumn[] {
  const base = compoundColumnsFor<AuditLogGridColumn>().filter(
    (c) => c.key !== 'dates' && c.key !== 'select' && c.key !== 'thumb',
  );
  return materializeTracks<AuditLogGridColumn>({
    layout,
    catalog: AUDIT_LOG_FIELD_CATALOG,
    base,
  });
}

/** The PRODUCT-DEFAULT materialization — the canonical columns and guard SoT. */
export const AUDIT_LOG_COMPOUND_COLUMNS: readonly AuditLogGridColumn[] =
  auditLogCompoundColumnsFor(AUDIT_LOG_PRODUCT_LAYOUT);

/**
 * The FACT a column sorts by, or null when it offers no sort.
 *
 * Chrome tracks (`_fill`) carry no `fieldId` and fall through to null, which is
 * what keeps them out of the header-sort law.
 */
export function auditLogSortFactFor(
  col: { key: string; fieldId?: string; sortable?: boolean },
): string | null {
  if (col.sortable === false) return null;
  // The identity slot IS the shared fulfillment track on a compound row.
  if (col.key === 'fulfillment') return 'audit-log.entity_id';
  if (col.key === 'item') return 'audit-log.action';
  if (col.key === 'state') return 'audit-log.source';
  return col.fieldId ?? null;
}

/** Model-derived sortability — the descriptor's and the URL guard's one answer. */
export function isAuditLogColumnSortable(
  columns: readonly AuditLogGridColumn[],
  key: string,
): key is AuditLogGridColumnKey {
  return columns.some((c) => c.key === key && auditLogSortFactFor(c) !== null);
}

/** A log reads newest first; names and ids alphabetically. */
export function defaultDirForAuditLogColumn(
  columns: readonly AuditLogGridColumn[],
  key: string,
): GridSortDir {
  const dt = columns.find((c) => c.key === key)?.slotDisplayType;
  return dt === 'date' || dt === 'money' || dt === 'number' ? 'desc' : 'asc';
}
