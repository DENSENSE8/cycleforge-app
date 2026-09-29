/** Webhook org resolution — session-less carrier/marketplace callbacks. */
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { extractCanonicalTracking } from '@/lib/tracking-format';

interface OrgLookupRow {
  organization_id: string | null;
  scope?: string | null;
}

export interface WebhookOrgResolverDeps {
  /** Unscoped read-only query returning organization_id (+ scope for Square). */
  query: (text: string, params: ReadonlyArray<unknown>) => Promise<{ rows: OrgLookupRow[] }>;
  warn: (message: string, meta: Record<string, unknown>) => void;
}

const defaultDeps: WebhookOrgResolverDeps = {
  query: (text, params) => pool.query<OrgLookupRow>(text, params as unknown[]),
  warn: (message, meta) => console.warn(message, meta),
};

function distinctOrgs(rows: OrgLookupRow[]): OrgId[] {
  const orgs = new Set<string>();
  for (const row of rows) {
    if (row.organization_id) orgs.add(row.organization_id);
  }
  return [...orgs] as OrgId[];
}

/**
 * Resolve the owning org for a carrier webhook event by tracking number.
 * Returns null (never a guess) when the number is unknown or owned by more
 * than one org — callers skip that event and let the carrier retry/drop it.
 */
export async function resolveWebhookOrgByTracking(
  trackingNumber: string,
  deps: WebhookOrgResolverDeps = defaultDeps,
): Promise<OrgId | null> {
  const normalized = extractCanonicalTracking(trackingNumber);
  if (!normalized) return null;

  // 1. The registration table the tracking-poll cron reads/writes. The natural
  //    key is global on tracking_number_normalized today, but DISTINCT keeps
  //    this correct if the unique is ever re-scoped per org.
  const registered = await deps.query(
    `SELECT DISTINCT organization_id
       FROM shipping_tracking_numbers
      WHERE tracking_number_normalized = $1
        AND organization_id IS NOT NULL`,
    [normalized],
  );
  const registeredOrgs = distinctOrgs(registered.rows);
  if (registeredOrgs.length === 1) return registeredOrgs[0];
  if (registeredOrgs.length > 1) {
    deps.warn('[webhook-org] ambiguous tracking — multiple owning orgs', {
      tracking: normalized,
      orgCount: registeredOrgs.length,
    });
    return null;
  }

  // 2. Fallback for unstamped (NULL-org) registration rows: the linked orders.
  const linked = await deps.query(
    `SELECT DISTINCT o.organization_id
       FROM orders o
       JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE stn.tracking_number_normalized = $1
        AND o.organization_id IS NOT NULL`,
    [normalized],
  );
  const linkedOrgs = distinctOrgs(linked.rows);
  if (linkedOrgs.length === 1) return linkedOrgs[0];
  if (linkedOrgs.length > 1) {
    deps.warn('[webhook-org] ambiguous tracking — multiple linked-order orgs', {
      tracking: normalized,
      orgCount: linkedOrgs.length,
    });
  }
  return null;
}

/**
 * Resolve the owning org for a Square webhook by the payload's merchant_id.
 * Exact `scope` matches (multi-account orgs store the merchant id there) beat
 * the common single-account NULL-scope connection; ambiguity returns null.
 */
export async function resolveWebhookOrgForSquareMerchant(
  merchantId: string,
  deps: WebhookOrgResolverDeps = defaultDeps,
): Promise<OrgId | null> {
  const trimmed = merchantId.trim();
  if (!trimmed) return null;

  const result = await deps.query(
    `SELECT organization_id, scope
       FROM organization_integrations
      WHERE provider = 'square'
        AND status = 'active'
        AND (scope = $1 OR scope IS NULL)`,
    [trimmed],
  );

  const exactOrgs = distinctOrgs(result.rows.filter((row) => row.scope === trimmed));
  if (exactOrgs.length === 1) return exactOrgs[0];
  if (exactOrgs.length > 1) {
    deps.warn('[webhook-org] ambiguous square merchant — multiple exact-scope orgs', {
      merchantId: trimmed,
      orgCount: exactOrgs.length,
    });
    return null;
  }

  const fallbackOrgs = distinctOrgs(result.rows.filter((row) => row.scope == null));
  if (fallbackOrgs.length === 1) return fallbackOrgs[0];
  if (fallbackOrgs.length > 1) {
    deps.warn('[webhook-org] ambiguous square merchant — multiple NULL-scope orgs', {
      merchantId: trimmed,
      orgCount: fallbackOrgs.length,
    });
  }
  return null;
}
