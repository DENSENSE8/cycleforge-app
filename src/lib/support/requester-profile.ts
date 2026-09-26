import type { OrgId } from '@/lib/tenancy/constants';

/** Who is asking, and what has already happened to them. */

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
