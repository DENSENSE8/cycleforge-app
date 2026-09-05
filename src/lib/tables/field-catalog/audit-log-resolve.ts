/**
 * Audit-log slot resolvers — row + fieldId → the resolved fact a slot cell
 * paints. Pure functions; no React, no hooks.
 *
 * `audit-log.when` resolves to the ABSOLUTE instant rather than a relative age
 * ("16m ago"): a resolver that read the clock would make one row's answer depend
 * on when it happened to be called, and an audit log is the last place that is
 * acceptable. The age FACE is the engine's, chosen from the field's `date`
 * display type (`compound-slot-face.ts`) — the resolver says what happened, the
 * cell says how long ago.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { AuditLogRow } from '@/lib/audit-log/audit-log-row';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * The actor's display name, falling back to the staff id.
 *
 * A deleted staff row must not erase who acted — the audit row keeps
 * `actor_staff_id` even when the JOIN finds no name, and `#41` is a worse
 * answer than a name but a far better one than blank.
 */
function actorText(row: AuditLogRow): string | null {
  const name = str(row.actor_name);
  if (name) return name;
  return row.actor_staff_id != null ? `#${row.actor_staff_id}` : null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveAuditLogSlotValue(
  row: AuditLogRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'audit-log.when':
      return { kind: 'value', text: str(row.created_at) };
    case 'audit-log.actor':
      return { kind: 'value', text: actorText(row) };
    case 'audit-log.actor_role':
      return { kind: 'value', text: str(row.actor_role) };
    case 'audit-log.action':
      return { kind: 'value', text: str(row.action) };
    case 'audit-log.source':
      return { kind: 'value', text: str(row.source) };
    case 'audit-log.entity_type':
      return { kind: 'value', text: str(row.entity_type) };
    case 'audit-log.entity_id':
      return { kind: 'value', text: str(row.entity_id) };
    case 'audit-log.ip':
      return { kind: 'value', text: str(row.ip_address) };
    default:
      return null;
  }
}
