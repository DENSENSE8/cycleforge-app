/**
 * Aggregator store → catalog placement (`integration_store_links`, migration
 * 2026-09-25_integration_store_links.sql).
 *
 * A ShipStation store sells on ONE existing platform and, optionally, as one
 * of that platform's existing storefront accounts (eBay Dragonhn → eBay ·
 * DRAGON). The link is the single answer to "where does this store's order
 * go": the connector's attribution reads it, the store mirror never creates a
 * platform or account for a linked store, and the order platform picker lists
 * an account only when a store is linked to it.
 *
 * Not `platform_accounts.integration_scope`: an eBay account's scope already
 * holds its eBay vault scope, read by the eBay credential lookup.
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** The only aggregator that links stores today. */
export const SHIPSTATION_STORE_PROVIDER = 'shipstation';

export interface StoreLinkRow {
  id: number;
  provider: string;
  external_store_id: string;
  platform_id: number;
  /** null = the store is the platform itself. */
  platform_account_id: number | null;
}

/** The operator named a platform/account that is not this org's. */
export class StoreLinkTargetError extends Error {}

const LINK_COLUMNS = `id::int AS id, provider, external_store_id,
  platform_id::int AS platform_id, platform_account_id::int AS platform_account_id`;

export async function listStoreLinks(orgId: OrgId, provider?: string): Promise<StoreLinkRow[]> {
  const res = await tenantQuery<StoreLinkRow>(
    orgId,
    `SELECT ${LINK_COLUMNS}
       FROM integration_store_links
      WHERE organization_id = $1
        AND ($2::text IS NULL OR provider = $2)
      ORDER BY provider, external_store_id`,
    [orgId, provider ?? null],
  );
  return res.rows;
}

/**
 * Point a store at an existing platform (and optionally one of its accounts).
 * Never creates a platform or account: a target outside this org, or an
 * account on another platform, is refused with {@link StoreLinkTargetError}.
 */
export async function upsertStoreLink(
  orgId: OrgId,
  input: { provider: string; externalStoreId: string; platformId: number; platformAccountId: number | null },
): Promise<StoreLinkRow> {
  return withTenantTransaction(orgId, async (client) => {
    const platform = await client.query(
      `SELECT 1 FROM platforms WHERE organization_id = $1 AND id = $2`,
      [orgId, input.platformId],
    );
    if (platform.rows.length === 0) throw new StoreLinkTargetError('Platform not found');
    if (input.platformAccountId != null) {
      const account = await client.query(
        `SELECT 1 FROM platform_accounts WHERE organization_id = $1 AND id = $2 AND platform_id = $3`,
        [orgId, input.platformAccountId, input.platformId],
      );
      if (account.rows.length === 0) throw new StoreLinkTargetError('Account is not on that platform');
    }
    const res = await client.query<StoreLinkRow>(
      `INSERT INTO integration_store_links
         (organization_id, provider, external_store_id, platform_id, platform_account_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, provider, external_store_id)
       DO UPDATE SET platform_id = EXCLUDED.platform_id,
                     platform_account_id = EXCLUDED.platform_account_id
       RETURNING ${LINK_COLUMNS}`,
      [orgId, input.provider, input.externalStoreId, input.platformId, input.platformAccountId],
    );
    return res.rows[0];
  });
}
