/**
 * The audit-log ROW SHAPE, as it crosses the server → client boundary.
 *
 * Every field is a string or a number: `/settings/audit` is a React Server
 * Component that queries `audit_logs` directly, and the table it hands the rows
 * to is a client island. `created_at` is an ISO string rather than a `Date` for
 * that reason — the resolver and the engine's age face both take the instant as
 * text, and a `Date` across the boundary is one more thing that can arrive as
 * something else.
 *
 * Deliberately NOT the SQL row type: the query selects `before_data` /
 * `after_data` JSON blobs that no column paints, and shipping them to the client
 * for every row would be the page's largest payload by an order of magnitude.
 */
export interface AuditLogRow {
  id: number;
  /** ISO instant. See the module docblock for why this is not a `Date`. */
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
