import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { resolveAiProviderOrder, type AiProviderOrder } from './provider-order';

/** Read this org's AI provider order preference. */
export async function resolveAiProviderOrderForOrg(orgId: OrgId): Promise<AiProviderOrder> {
  let orgOrder: string | null = null;
  try {
    const { rows } = await tenantQuery<{ settings: unknown }>(
      orgId,
      `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId],
    );
    const settings =
      rows[0]?.settings && typeof rows[0].settings === 'object'
        ? (rows[0].settings as Record<string, unknown>)
        : {};
    const ai =
      settings.ai && typeof settings.ai === 'object'
        ? (settings.ai as Record<string, unknown>)
        : {};
    orgOrder = typeof ai.providerOrder === 'string' ? ai.providerOrder : null;
  } catch {
    return resolveAiProviderOrder({ orgOrder: null, envOrder: process.env.AI_PROVIDER_ORDER });
  }
  return resolveAiProviderOrder({ orgOrder, envOrder: process.env.AI_PROVIDER_ORDER });
}
