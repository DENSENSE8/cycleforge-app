/**
 * DB-backed deps for {@link listOrderSyncMenuSources}. Kept off the pure
 * module so unit tests never import the Neon pool.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import { listConnections } from '@/lib/integrations/connectors/connections';
import { listOrderSyncMenuSources } from '@/lib/integrations/order-sync-menu';
import type { PermissionString } from '@/lib/auth/permissions';

export function loadOrderSyncMenuSources(
  orgId: OrgId,
  hasPermission: (permission: PermissionString) => boolean,
) {
  return listOrderSyncMenuSources(orgId, hasPermission, { listConnections });
}
