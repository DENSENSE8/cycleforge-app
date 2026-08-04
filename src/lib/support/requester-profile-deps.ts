import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import type { RequesterCustomer, RequesterProfileDeps } from './requester-profile';

/**
 * The real collaborators behind {@link resolveRequesterProfile}. Kept out of
 * the core module so the core stays DB- and network-free and its unit test
 * needs no fixtures — the same split `analyze-core.ts` / `analyze.ts` uses.
 */

async function findCustomerByEmail(
  orgId: OrgId,
  email: string,
): Promise<RequesterCustomer | null> {
  const { rows } = await tenantQuery<{
    id: number;
    display_name: string | null;
    customer_name: string | null;
    email: string | null;
  }>(
    orgId,
    `SELECT id, display_name, customer_name, email
       FROM customers
      WHERE organization_id = $1
        AND lower(btrim(email)) = lower(btrim($2))
      ORDER BY id
      LIMIT 1`,
    [orgId, email],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name ?? row.customer_name ?? null,
    email: row.email ?? null,
  };
}

async function countOrdersForCustomer(orgId: OrgId, customerId: number): Promise<number> {
  const { rows } = await tenantQuery<{ n: string }>(
    orgId,
    `SELECT count(*)::text AS n
       FROM orders
      WHERE organization_id = $1 AND customer_id = $2`,
    [orgId, customerId],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Ticket cardinality from the helpdesk's own search — `support_tickets` is a
 * link registry and carries no requester, so it cannot answer this.
 */
async function countTicketsForRequester(orgId: OrgId, email: string): Promise<number | null> {
  const provider = await getHelpdeskProvider(orgId);
  if (!provider) return null;
  const quoted = email.replace(/"/g, '');
  const res = await provider.searchTickets(`requester:"${quoted}"`, { perPage: 1 });
  return Number.isFinite(res.count) ? res.count : null;
}

export const requesterProfileDeps: RequesterProfileDeps = {
  findCustomerByEmail,
  countOrdersForCustomer,
  countTicketsForRequester,
};
