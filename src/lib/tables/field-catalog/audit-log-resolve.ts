/**
 * Audit-log slot resolvers — pure.
 *
 * `when` resolves to the ABSOLUTE INSTANT, never to a pre-formatted or
 * relative face: the engine turns a `date` display type into the cell face and
 * keeps the instant behind it, and a resolver whose text depends on `now`
 * would sort and search differently on every render.
 *
 * The actor is a PERSON value, not a string. The retired cell printed
 * `actor_name ?? #actor_staff_id`; the `#id` half was a placeholder for a name
 * the join could not find, and the person face already draws that case
 * honestly from the id alone.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { AuditLogRow } from '@/lib/audit/audit-log-row';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveAuditLogSlotValue(
  row: AuditLogRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'audit-log.entity_id':
      return { kind: 'value', text: str(row.entity_id) };
    case 'audit-log.entity_type':
      return { kind: 'value', text: str(row.entity_type) };
    case 'audit-log.action':
      return { kind: 'value', text: str(row.action) };
    case 'audit-log.source':
      return { kind: 'value', text: str(row.source) };
    case 'audit-log.actor': {
      const name = str(row.actor_name);
      return { kind: 'person', staffId: row.actor_staff_id ?? null, name };
    }
    case 'audit-log.actor_role':
      return { kind: 'value', text: str(row.actor_role) };
    case 'audit-log.when':
      return { kind: 'value', text: str(row.created_at) };
    case 'audit-log.ip':
      return { kind: 'value', text: str(row.ip_address) };
    default:
      return null;
  }
}
