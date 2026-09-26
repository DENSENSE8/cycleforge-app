/** Which Square Terminal serves this counter — the ONE place that answers it. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

interface TerminalDeviceResolution {
  deviceId: string;
  source: 'lane' | 'env';
}

export interface ResolveTerminalDeviceDeps {
  /**
   * The stand paired to the kiosk device this session is bound to.
   *
   * Returns `null` when the session has no bound tablet or the lane has no
   * stand — both are "ask the fallback", and neither is an error.
   */
  findLaneTerminalId(orgId: OrgId, sessionId: number): Promise<string | null>;
  readEnvTerminalId(): string;
}

const defaultDeps: ResolveTerminalDeviceDeps = {
  async findLaneTerminalId(orgId, sessionId) {
    const res = await tenantQuery<{ square_terminal_device_id: string | null }>(
      orgId,
      `SELECT kd.square_terminal_device_id
         FROM counter_sessions cs
         JOIN kiosk_devices kd ON kd.id = cs.kiosk_device_id
        WHERE cs.id = $2 AND cs.organization_id = $1
        LIMIT 1`,
      [orgId, sessionId],
    );
    const raw = res.rows[0]?.square_terminal_device_id ?? null;
    const trimmed = String(raw ?? '').trim();
    return trimmed || null;
  },

  readEnvTerminalId() {
    return (
      process.env.SQUARE_TERMINAL_DEVICE_ID?.trim() ||
      process.env.SQUARE_DEVICE_ID?.trim() ||
      ''
    );
  },
};

/** Resolve the stand for a counter session. */
export async function resolveTerminalDeviceId(
  orgId: OrgId,
  sessionId: number,
  override?: string | null,
  deps: ResolveTerminalDeviceDeps = defaultDeps,
): Promise<TerminalDeviceResolution | null> {
  const explicit = String(override ?? '').trim();
  if (explicit) return { deviceId: explicit, source: 'lane' };

  const lane = await deps.findLaneTerminalId(orgId, sessionId);
  if (lane) return { deviceId: lane, source: 'lane' };

  const env = deps.readEnvTerminalId();
  return env ? { deviceId: env, source: 'env' } : null;
}
