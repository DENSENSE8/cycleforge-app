import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';

import type { UrgencyDeps, UrgencyWriteArgs, UrgencyWriteOutcome } from './promote-urgency-core';

/**
 * Real storage bindings for the cross-entity urgency SoT.
 *
 * Held apart from `promote-urgency-core.ts` so the routing and refusal rules
 * test with zero database and zero helpdesk network, per
 * Dependency injection for testability.
 *
 * ## Every binding is COMPARE-AND-SET, and that is load-bearing twice over
 *
 * 1. **Idempotency.** The caller fans out a notification on `changed`, so a
 *    blind write would report `updated` on a re-promotion and throw a second
 *    "this is urgent now" at an operator who already saw the first.
 *
 * 2. **It must not clobber a richer scale it did not set.** Two of the three
 *    storages carry more levels than the shared binary rung. Clearing urgency
 *    therefore only ever moves a record OUT OF the urgent state — a carton
 *    sitting at manual tier 1 (High) or a ticket at `high` is already `normal`
 *    by this module's vocabulary, so clearing reports `unchanged` and writes
 *    nothing. A naive `SET priority_tier = NULL` would silently demote a
 *    deliberate High to Auto on behalf of a caller that only asked about
 *    urgency.
 */
export function createUrgencyDeps(organizationId: OrgId): UrgencyDeps {
  return {
    /** `orders.is_urgent` — a genuine boolean, so the rung maps 1:1. */
    async setOrderUrgency({ entityId, level }: UrgencyWriteArgs): Promise<UrgencyWriteOutcome> {
      return withTenantTransaction<UrgencyWriteOutcome>(organizationId, async (client) => {
        const current = await client.query<{ is_urgent: boolean | null }>(
          'SELECT is_urgent FROM orders WHERE id = $1 LIMIT 1',
          [entityId],
        );
        if (current.rowCount === 0) return 'not_found';

        const isUrgent = current.rows[0].is_urgent === true;
        const want = level === 'urgent';
        if (isUrgent === want) return 'unchanged';

        await client.query('UPDATE orders SET is_urgent = $2 WHERE id = $1', [entityId, want]);
        return 'updated';
      });
    },

    /**
     * `receiving_carton.priority_tier` + `receiving_carton.is_priority`.
     *
     * **The table is `receiving_carton`; the entity type is `receiving`.** They
     * differ on purpose — the type string matches the `staff_inbox_items`
     * entity vocabulary so a task, its inbox row and its urgency all name the
     * record identically. Do not "fix" one to match the other; the bare
     * `receiving` compat view was dropped.
     *
     * The two columns move together or a promoted carton is invisible to the
     * queues that still read only the boolean — the same lockstep
     * `PATCH /api/receiving-logs` enforces (`is_priority ⇔ tier === 0`).
     * Either signal being set counts as urgent on read, so a carton promoted
     * by the older boolean-only path is recognised rather than promoted twice.
     */
    async setCartonUrgency({ entityId, level }: UrgencyWriteArgs): Promise<UrgencyWriteOutcome> {
      return withTenantTransaction<UrgencyWriteOutcome>(organizationId, async (client) => {
        const current = await client.query<{
          priority_tier: number | null;
          is_priority: boolean | null;
        }>('SELECT priority_tier, is_priority FROM receiving_carton WHERE id = $1 LIMIT 1', [
          entityId,
        ]);
        if (current.rowCount === 0) return 'not_found';

        const row = current.rows[0];
        const isUrgent = row.priority_tier === 0 || row.is_priority === true;
        const want = level === 'urgent';
        if (isUrgent === want) return 'unchanged';

        // Promote to the top manual tier; clear back to Auto (null) so the
        // platform-derived rank takes over again rather than pinning the carton
        // to an arbitrary explicit tier.
        await client.query(
          'UPDATE receiving_carton SET priority_tier = $2, is_priority = $3, updated_at = NOW() WHERE id = $1',
          [entityId, want ? 0 : null, want],
        );
        return 'updated';
      });
    },

    /**
     * Helpdesk ticket priority. The provider is already org-bound, so no orgId
     * is threaded here — resolved lazily so an org with no helpdesk connected
     * pays nothing until a ticket is actually promoted.
     *
     * A missing/unconfigured provider reports `not_found` rather than throwing:
     * from the caller's position an unreachable ticket and an absent one are
     * the same actionable outcome, and a thrown task must not fail because the
     * urgency half could not land.
     */
    async setTicketUrgency({ entityId, level }: UrgencyWriteArgs): Promise<UrgencyWriteOutcome> {
      const helpdesk = await getHelpdeskProvider(organizationId);
      if (!helpdesk || !(await helpdesk.isConfigured())) return 'not_found';

      const ticket = await helpdesk.getTicket(entityId);
      if (!ticket) return 'not_found';

      const isUrgent = String(ticket.priority ?? '').toLowerCase() === 'urgent';
      const want = level === 'urgent';
      if (isUrgent === want) return 'unchanged';

      // Clearing lands on `normal`, never on `low` — this module's rung says
      // nothing about how un-urgent a ticket is, and guessing `low` would be
      // inventing a judgement the operator did not make.
      const updated = await helpdesk.updateTicket(entityId, {
        priority: want ? 'urgent' : 'normal',
      });
      return updated ? 'updated' : 'not_found';
    },
  };
}
