/**
 * Which Square Terminal serves this counter — the ONE place that answers it.
 *
 * ### Why this function exists at all
 *
 * The Terminal id used to be `process.env.SQUARE_TERMINAL_DEVICE_ID`, read
 * inline. That is one stand per *deployment*: a shop with two counters cannot
 * run both, and two tenants on one deploy would send each other's customers a
 * card prompt. Which reader sits at which counter is TENANT data, not
 * deployment config, so it lives on `kiosk_devices` beside the tablet that
 * faces the customer across the same counter (SQ3).
 *
 * ### The resolution order, and why the env is last
 *
 * 1. **The lane's own paired stand** (`kiosk_devices.square_terminal_device_id`)
 *    — the only answer that is correct on a multi-counter floor.
 * 2. **The env var**, kept for single-counter deployments that have never
 *    opened the pairing UI. Explicitly a FALLBACK: a lane that has been
 *    configured with no stand must NOT silently inherit the deployment's, or a
 *    cash-only counter starts prompting a card reader in another room.
 *
 * That distinction is why the resolver returns a `source` and why "this lane is
 * deliberately standless" is representable at all: `null` from the lookup means
 * "no row / no session", while an explicitly cleared pairing is a decision.
 *
 * Keeping it in one function is the point — SQ2 deliberately read the env in
 * the route and nowhere else so that this change deletes one fallback rather
 * than hunting env reads through the domain.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export interface TerminalDeviceResolution {
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

/**
 * Resolve the stand for a counter session.
 *
 * An explicit `override` wins over both — that is a staff member standing at a
 * counter saying "use this reader", which outranks configuration.
 *
 * Returns `null` when nothing is paired anywhere: the caller answers "no Square
 * Terminal is paired with this counter" rather than prompting a reader in
 * another room.
 */
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
