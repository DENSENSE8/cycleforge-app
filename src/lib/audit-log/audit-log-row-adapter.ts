/**
 * `AuditLogRow → CompoundRowView` — the audit-log adapter.
 *
 * The family's ONLY contribution to how a row paints. Pure, strings and enums,
 * no JSX. Every fact it does not name here is a bound SLOT resolved by
 * `audit-log-resolve.ts` through the engine.
 *
 * ## What the compound row says about an audit entry
 *
 * - TITLE — the ACTION, because that is the thing an admin scans for
 *   ("permission_denied", "mark_received").
 * - the note line — what it touched (`order 4182`), which is the sentence the
 *   retired AdminTable split across two stacked `<div>`s in one cell.
 * - IDS — the entity id. It is the identity fact, so on a compound row it is
 *   the `fulfillment` track (`materialize-tracks.ts`).
 * - STATE — the SOURCE (which subsystem wrote the row), with the actor's role
 *   at write time on the hover.
 *
 * An audit entry has no money, no deadline and no photo; all three stay null and
 * the shared cells paint the honest empty face rather than a zero.
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { AuditLogRow } from '@/lib/audit-log/audit-log-row';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Tone from the ACTION, not from the source.
 *
 * `alert` is reserved for the entries an admin opens this page to find — a
 * denial, a failure, a deletion. Everything else is ordinary privileged work
 * and stays neutral, because a log where every row is loud is a log nobody
 * reads. Deliberately not a colour: which hue an alert wears is the cell's.
 */
function toneFor(action: string | null): CompoundStateTone {
  const a = (action ?? '').toLowerCase();
  if (!a) return 'neutral';
  if (a.includes('deni') || a.includes('fail') || a.includes('reject') || a.includes('delete')) {
    return 'alert';
  }
  return 'neutral';
}

export function auditLogCompoundView(row: AuditLogRow): CompoundRowView {
  const entityType = str(row.entity_type);
  const entityId = str(row.entity_id);
  return {
    id: String(row.id),
    // An audit entry has no photo; the shared cell paints the typed placeholder.
    thumbUrl: null,
    title: str(row.action) ?? 'unknown action',
    note: entityType && entityId ? `${entityType} ${entityId}` : (entityType ?? entityId),
    // The IDENTITY fact — `audit-log.entity_id`. On a compound row the identity
    // slot IS the fulfillment track, so this is the cell that resolves it.
    orderId: entityId,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: str(row.source) ?? '—',
    stateTone: toneFor(row.action),
    // The role they held WHEN they acted. The pill has room for the subsystem;
    // who they were is the detail behind it.
    stateTip: str(row.actor_role) ?? undefined,
    // An audit entry already happened: no deadline it can miss, no money on it.
    delay: null,
    amount: null,
  };
}
