import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { resolveSupportVisionLane, type SupportVisionLane } from './vision-lane';

/**
 * Read this org's vision lane for the support assistant.
 *
 * `cloudAvailable` is deliberately keyed on **`AI_CHAT_BASE_URL` alone**, not on
 * `isAiConfigured('chat')`: that helper also answers true for the legacy local
 * `HERMES_API_URL` fallback, and a local gateway is precisely the thing the
 * `local-only` lane already covers. Reporting `cloud-multimodal` because a
 * local box happened to be reachable would tell the operator an image left the
 * building when it did not.
 *
 * Degrades to `local-only` on a missing org, an unparseable settings blob, or a
 * DB hiccup. There is no failure mode in which guessing "send it to the cloud"
 * is the safer answer.
 */
export async function resolveSupportVisionLaneForOrg(orgId: OrgId): Promise<SupportVisionLane> {
  const cloudAvailable = Boolean(String(process.env.AI_CHAT_BASE_URL ?? '').trim());

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
