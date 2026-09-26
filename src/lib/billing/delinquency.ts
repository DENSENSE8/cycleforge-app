/** Dunning read helper — is this org's subscription in a delinquent state? */

import type { OrgId } from '@/lib/tenancy/constants';
import { getSubscription } from './subscriptions';

/** Stripe subscription statuses we treat as "payment is owed and collection is failing". */
export const DELINQUENT_STATUSES = ['past_due', 'unpaid', 'incomplete_expired'] as const;

export interface DelinquencyDeps {
  /** Reads the local Stripe mirror row — see ./subscriptions.ts. */
  getSubscription: (orgId: OrgId) => Promise<{ status: string } | null>;
}

const defaultDeps: DelinquencyDeps = { getSubscription };

/** True when the org's mirrored subscription status is delinquent (past_due / unpaid / incomplete_expired). */
export async function isBillingDelinquent(
  orgId: OrgId,
  deps: DelinquencyDeps = defaultDeps,
): Promise<boolean> {
  const sub = await deps.getSubscription(orgId);
  if (!sub) return false;
  return (DELINQUENT_STATUSES as readonly string[]).includes(sub.status);
}
