import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';

import type { UrgencyDeps, UrgencyWriteArgs, UrgencyWriteOutcome } from './promote-urgency-core';

/** Real storage bindings for the cross-entity urgency SoT. */
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

    /** `receiving_carton.priority_tier` + `receiving_carton.is_priority`. */
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

    /** Helpdesk ticket priority. */
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
