/** One row of the audit desk — an `audit_logs` row joined to its actor, made wire-safe. */

/** The raw `SELECT` shape the audit page reads out of `audit_logs`. */
export interface AuditLogQueryRow {
  id: number;
  created_at: Date | string;
  actor_staff_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  source: string;
  action: string;
  entity_type: string;
  entity_id: string;
  ip_address: string | null;
  /** Selected, never painted — see the module docblock. */
  metadata: unknown;
  /** Selected, never painted — see the module docblock. */
  before_data: unknown;
  /** Selected, never painted — see the module docblock. */
  after_data: unknown;
}

/** The desk row — what the client island and the family resolver read. */
export interface AuditLogRow {
  id: number;
  /** Absolute instant, ISO-8601. */
  created_at: string;
  actor_staff_id: number | null;
  actor_name: string | null;
  actor_role: string | null;
  source: string | null;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
}

/** Query row → desk row. Pure; the only place a `Date` is read on this desk. */
export function toAuditLogRow(raw: AuditLogQueryRow): AuditLogRow {
  const created = raw.created_at;
  return {
    id: raw.id,
    created_at:
      created instanceof Date ? created.toISOString() : String(created ?? '').trim(),
    actor_staff_id: raw.actor_staff_id ?? null,
    actor_name: raw.actor_name ?? null,
    actor_role: raw.actor_role ?? null,
    source: raw.source ?? null,
    action: raw.action ?? null,
    entity_type: raw.entity_type ?? null,
    entity_id: raw.entity_id ?? null,
    ip_address: raw.ip_address ?? null,
  };
}
