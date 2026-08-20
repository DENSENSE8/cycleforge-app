import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { resolveSupportVisionLane, type SupportVisionLane } from './vision-lane';
import { isAiConfigured } from '@/lib/ai/provider';

/**
 * Read this org's vision lane for the support assistant.
 *
 * `cloudAvailable` asks whether the PLATFORM has a chat endpoint configured —
 * `isAiConfigured('chat')`, i.e. `AI_CHAT_BASE_URL`.
 *
 * This used to read the env var directly, to avoid `isAiConfigured('chat')`
 * answering true for the legacy `HERMES_API_URL` fallback (a local gateway is
 * precisely what the `local-only` lane already covers, and reporting
 * `cloud-multimodal` for it would tell the operator an image left the building
 * when it did not). That fallback was deleted with hermes-client.ts, so the
 * helper and the raw var are now the same question — and asking through the
 * helper keeps provider.ts the one module that reads an AI endpoint from env.
 *
 * NOTE this is deliberately NOT `resolveOrgAiConfig`: an org's own connected
 * provider may be a self-hosted box, and resolving one here would report
 * `cloud-multimodal` for a model running on the tenant's own hardware.
 *
 * Degrades to `local-only` on a missing org, an unparseable settings blob, or a
 * DB hiccup. There is no failure mode in which guessing "send it to the cloud"
 * is the safer answer.
 */
export async function resolveSupportVisionLaneForOrg(orgId: OrgId): Promise<SupportVisionLane> {
  const cloudAvailable = isAiConfigured('chat');

  let orgLane: string | null = null;
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
    const support =
      settings.support && typeof settings.support === 'object'
        ? (settings.support as Record<string, unknown>)
        : {};
    orgLane = typeof support.visionLane === 'string' ? support.visionLane : null;
  } catch {
    return 'local-only';
  }

  return resolveSupportVisionLane({
    orgLane,
    envLane: process.env.SUPPORT_VISION_LANE,
    cloudAvailable,
  });
}
