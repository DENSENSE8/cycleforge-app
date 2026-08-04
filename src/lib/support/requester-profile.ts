import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Who is asking, and what has already happened to them.
 *
 * Backs the `RequesterDetailBand` at the head of the ticket thread. Everything
 * here is a fact that EXISTS — deliberately so.
 *
 * **There is no LTV and no return rate, and neither is invented.** The ruling
 * that produced this band asked for both; nothing in this schema derives
 * either, and a placeholder number on a customer record is worse than a missing
 * one (an agent quotes it to a customer). When they are genuinely wanted they
 * arrive as a reviewed aggregate with a stated query and cache, not as a `0`.
 *
 * Every fact resolves INDEPENDENTLY and degrades to `null` on failure — the
 * band renders `—` for that fact and keeps the rest. A helpdesk outage must not
 * take the customer's name off the screen. This is the same degrade-not-fail
 * discipline the ticket bundle already follows.
 *
 * The linked order / tracking / serials are NOT here: they arrive on the
 * `SupportContextBundle` the thread already fetches, and re-querying them would
 * be a second reader of one fact.
 *
 * This module is the PURE core — no DB, no network, no `server-only` — so it is
 * unit-testable the way the house tests every DI'd domain helper. The real
 * collaborators live in `requester-profile-deps.ts`; the route composes them.
 */

export interface RequesterCustomer {
  id: number;
  displayName: string | null;
  email: string | null;
}

export interface RequesterProfile {
  /** Identity as the helpdesk knows it. Either half may be absent. */
  name: string | null;
  email: string | null;
  /** Our own customer row, when the requester's email matches one. */
  customer: RequesterCustomer | null;
  /** Orders on that customer row. `null` = not resolvable, never a fake `0`. */
  orderCount: number | null;
  /** Tickets this requester has opened, per the helpdesk. `null` = unknown. */
  ticketCount: number | null;
}

interface RequesterProfileInput {
  /** Requester identity read off the ticket (`requesterFrom`). */
  name: string | null;
  email: string | null;
}

export interface RequesterProfileDeps {
  /** Our `customers` row for an email, org-scoped. */
  findCustomerByEmail: (orgId: OrgId, email: string) => Promise<RequesterCustomer | null>;
  /** How many orders that customer has placed. */
  countOrdersForCustomer: (orgId: OrgId, customerId: number) => Promise<number>;
  /** How many tickets this email has opened, per the helpdesk. */
  countTicketsForRequester: (orgId: OrgId, email: string) => Promise<number | null>;
}

export async function resolveRequesterProfile(
  orgId: OrgId,
  input: RequesterProfileInput,
  deps: RequesterProfileDeps,
): Promise<RequesterProfile> {
  const email = input.email?.trim() || null;
  const base: RequesterProfile = {
    name: input.name?.trim() || null,
    email,
    customer: null,
    orderCount: null,
    ticketCount: null,
  };

  // No email is not a failure — it is the common shape of a ticket opened from
  // a web form. The band still renders the name and the linkage.
  if (!email) return base;

  const [customer, ticketCount] = await Promise.all([
    deps.findCustomerByEmail(orgId, email).catch(() => null),
    deps.countTicketsForRequester(orgId, email).catch(() => null),
  ]);

  const orderCount = customer
    ? await deps.countOrdersForCustomer(orgId, customer.id).catch(() => null)
    : null;

  return { ...base, customer, orderCount, ticketCount };
}
