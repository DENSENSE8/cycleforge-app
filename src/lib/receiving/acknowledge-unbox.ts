/**
 * Unbox acknowledgement — the "operator handled it" → stamp the Unboxed milestone rule.
 *
 * Industry-standard receiving treats "Unboxed" as a set-once milestone marking
 * the first moment a human physically opened and acknowledged the carton — not a
 * last-touched field. A genuine operator action on a carton's line is that
 * evidence:
 *   • editing the condition grade (the condition PATCH endpoints are only ever
 *     reached by an operator gesture — the auto-default grade is written at
 *     scan/intake, never through a PATCH), or
 *   • entering a serial (already stamped by serial-attach), or
 *   • the explicit Receive commit (already stamped by mark-received).
 *
 * This helper is the shared seam for the condition case. It funnels through the
 * same COALESCE-once writer the serial/receive paths use
 * ({@link upsertReceivingUnbox} on the carton-grain `receiving_unbox` street
 * table), so the FIRST qualifying action wins and every later edit is a no-op —
 * the milestone never re-stamps or overwrites. Attribution rides on the stamp
 * itself: `unboxed_by` + `unboxed_at` record who acknowledged and when. Later
 * edits change the underlying fact (condition/serial), never this milestone.
 *
 * Must be called with a tenant-scoped client (inside `withTenantTransaction`) so
 * the write is org-scoped; `upsertReceivingUnbox` also passes `organization_id`
 * explicitly as a backstop.
 */

import type { PoolClient } from 'pg';
import { upsertReceivingUnbox } from '@/lib/receiving/streets/carton-street-write';

type UnboxClient = Pick<PoolClient, 'query'>;

export interface AcknowledgeUnboxDeps {
  upsertUnbox: typeof upsertReceivingUnbox;
}

const defaultDeps: AcknowledgeUnboxDeps = { upsertUnbox: upsertReceivingUnbox };

/**
 * Set-once stamp of the carton's Unboxed milestone from an operator acknowledgement.
 * No-op when `receivingId` is missing (a line not attached to a carton).
 */
export async function acknowledgeUnbox(
  client: UnboxClient,
  orgId: string,
  receivingId: number | null | undefined,
  staffId: number | null | undefined,
  deps: AcknowledgeUnboxDeps = defaultDeps,
): Promise<void> {
  if (receivingId == null) return;
  await deps.upsertUnbox(client, orgId, receivingId, {
    unboxedAt: 'now',
    unboxedBy: staffId ?? null,
    deriveIntakePath: true,
  });
}
