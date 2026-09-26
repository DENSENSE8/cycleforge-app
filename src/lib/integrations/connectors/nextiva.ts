/** Nextiva connector sync — the CATCH-UP / reconciliation path. */

import { getIntegrationCredentials, type NextivaCredentials } from '@/lib/integrations/credentials';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SyncOutcome } from './types';

export async function nextivaSync(
  orgId: OrgId,
  _opts?: { full?: boolean; cursor?: unknown },
): Promise<SyncOutcome> {
  const creds = await getIntegrationCredentials<NextivaCredentials>(orgId, 'nextiva');
  if (!creds || !creds.apiKey) {
    return { ok: false, error: 'nextiva not connected' };
  }

  // TODO(spike §9.3):
  // TODO(spike §9.3): page the call-log + voicemail list endpoints since
  return { ok: true, imported: 0, updated: 0, cursor: _opts?.cursor ?? null };
}
