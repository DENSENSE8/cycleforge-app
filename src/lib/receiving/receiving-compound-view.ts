/**
 * Receiving row → {@link CompoundRowView}. Pure; no React, no hooks.
 *
 * One of N family adapters feeding the single compound renderer
 * (`components/tables/compound`). Adding a table means writing one of these,
 * never copying a cell — which is the property that keeps four surfaces on one
 * layout instead of four that drift.
 */

import {
  firstNote,
  type CompoundRowView,
  type CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/**
 * Workflow status → the three-tone vocabulary.
 *
 * Deliberately coarse. The receiving lifecycle has many stages but a compound
 * row answers one question at a glance — "does this need me?" — so the mapping
 * collapses to done / needs-a-human / everything else, and the exact stage name
 * stays in the label beside it.
 */
export function receivingStateTone(status: string | null | undefined): CompoundStateTone {
  const s = String(status || '').toUpperCase();
  if (!s) return 'neutral';
  // Anything an operator has to resolve before the line can move.
  if (
    s.includes('EXCEPTION') ||
    s.includes('HOLD') ||
    s.includes('DAMAGE') ||
    s.includes('MISMATCH') ||
    s.includes('SHORT') ||
    s.includes('MISSING') ||
    s.includes('BLOCK') ||
    s.includes('FAIL')
  ) {
    return 'alert';
  }
  if (s.includes('COMPLETE') || s.includes('DONE') || s.includes('RECEIVED') || s.includes('PASS')) {
    return 'done';
  }
  return 'neutral';
}

export interface ReceivingCompoundParts {
  /** Resolved display title (the caller already owns catalog-vs-vendor choice). */
  title: string;
  /** Resolved stage name for this surface's vocabulary (fine vs coarse). */
  stateLabel: string;
  /** Whole days past this line's deadline; null when it has none. */
  delayDays: number | null;
  delayTip?: string;
  /** Tracking as the surface displays it. */
  tracking: string | null;
  /** PO / order handle. */
  orderId: string | null;
}

/**
 * Build the view. The resolved strings come from the row shell (which already
 * computes them for the flat layout), so this adapter never re-derives display
 * logic that has a SoT elsewhere — it only decides SHAPE.
 */
export function receivingCompoundView(
  row: ReceivingLineRow,
  parts: ReceivingCompoundParts,
): CompoundRowView {
  return {
    id: String(row.id),
    thumbUrl: row.image_url || null,
    title: parts.title,
    // The LINE note first, then the carton-level note it inherits — an operator
    // reading a row wants what was said about THIS line before what was said
    // about the box it came in.
    note: firstNote([row.notes, row.receiving_support_notes]),
    orderId: parts.orderId,
    tracking: parts.tracking,
    platformValue: row.source_platform || row.inbound_source_type || null,
    // Authoritative carrier from the shipment — the tracking dot's brand.
    carrier: row.carrier || null,
    stateLabel: parts.stateLabel,
    stateTone: receivingStateTone(row.workflow_status),
    delay:
      parts.delayDays == null ? null : { days: parts.delayDays, overdue: parts.delayDays > 0 },
    delayTip: parts.delayTip,
  };
}
