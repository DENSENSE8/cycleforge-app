/**
 * DB-backed deps for {@link listOrderSyncMenuSources}. Kept off the pure
 * module so unit tests never import the Neon pool.
 */
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { listConnections } from '@/lib/integrations/connectors/connections';
import { EBAY_PLATFORM_PREDICATE, EBAY_SELLER_ROLE_PREDICATE } from '@/lib/ebay/account-predicates';
import {
  listOrderSyncMenuSources,
  type NamedAccount,
  type OrderSyncMenuDeps,
} from '@/lib/integrations/order-sync-menu';
import type { PermissionString } from '@/lib/auth/permissions';

async function listEbaySellerAccounts(orgId: OrgId): Promise<NamedAccount[]> {
  const r = await tenantQuery<{ account_name: string }>(
    orgId,
    `SELECT account_name FROM ebay_accounts
      WHERE organization_id = $1 AND is_active = true
        AND ${EBAY_PLATFORM_PREDICATE}
        AND ${EBAY_SELLER_ROLE_PREDICATE}
      ORDER BY account_name`,
    [orgId],
  );
  return r.rows.map((row) => ({ accountName: row.account_name }));
}

async function listAmazonAccounts(orgId: OrgId): Promise<NamedAccount[]> {
  const r = await tenantQuery<{ account_name: string }>(
    orgId,
    `SELECT account_name FROM amazon_accounts
      WHERE organization_id = $1 AND is_active = true
      ORDER BY account_name`,
    [orgId],
  );
  return r.rows.map((row) => ({ accountName: row.account_name }));
}

const orderSyncMenuDeps: OrderSyncMenuDeps = {
  listConnections,
  listEbaySellerAccounts,
  listAmazonAccounts,
};

export function loadOrderSyncMenuSources(
  orgId: OrgId,
  hasPermission: (permission: PermissionString) => boolean,
) {
  return listOrderSyncMenuSources(orgId, hasPermission, orderSyncMenuDeps);
}
