/** Zoho credential scope (Wave 5). */

import { withCredentialScope } from '@/lib/integrations/credential-scope';
import type { CredentialOperation } from '@/lib/integrations/credential-allowlist';
import type { OrgId } from '@/lib/tenancy/constants';
import { withZohoOrg } from './tenant-context';

/** Operations the Zoho integration may perform (subset of the zoho allowlist). */
type ZohoOperation =
  | 'purchaseorders.read'
  | 'purchaseorders.write'
  | 'purchasereceives.read'
  | 'purchasereceives.write'
  | 'bills.read'
  | 'organizations.read';

export function withZohoCredential<T>(
  orgId: OrgId,
  operation: ZohoOperation,
  fn: () => Promise<T>,
): Promise<T> {
  return withCredentialScope(
    { orgId, provider: 'zoho', operation: operation as CredentialOperation },
    () => withZohoOrg(orgId, fn),
  );
}
