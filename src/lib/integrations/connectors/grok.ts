/**
 * Grok (SuperGrok) connector adapters — validate + refresh.
 * Lazy-imported by the registry so the connection reader never pulls OIDC.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { HealthResult, TokenEnvelope } from './types';
import {
  refreshGrokCredentials,
  validateGrokConnection,
} from '@/lib/integrations/grok/oauth';

export async function grokValidate(orgId: OrgId): Promise<HealthResult> {
  return validateGrokConnection(orgId);
}

export async function grokRefresh(orgId: OrgId): Promise<TokenEnvelope | null> {
  return refreshGrokCredentials(orgId);
}
