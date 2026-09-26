import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { resolveSupportVisionLane, type SupportVisionLane } from './vision-lane';
import { isAiConfigured } from '@/lib/ai/provider';

/** Read this org's vision lane for the support assistant. */
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
