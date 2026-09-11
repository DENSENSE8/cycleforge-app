/**
 * Which tablet the desk may put this visit on — **server** read.
 *
 * The projection, types, and spoken copy live in
 * {@link ./counter-devices-model.ts} so the `/counter` client CTA can import
 * them without pulling `db.ts` (`server-only`) into the station/desk bundle.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P5) ·
 * `docs/todo/kiosk-counter-consult-PLAN.md` (Phase 0).
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import { listKioskDevices } from '@/lib/auth/kiosk-device';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  projectCounterDevices,
  type CounterDevice,
  type CounterDeviceRow,
} from './counter-devices-model';

export {
  COUNTER_DEVICE_ONLINE_WINDOW_MS,
  deviceAvailabilityCopy,
  projectCounterDevices,
  type CounterDevice,
  type CounterDeviceRow,
} from './counter-devices-model';

export interface CounterDeviceDeps {
  listDevices(orgId: OrgId): Promise<CounterDeviceRow[]>;
  /** Open sessions with a tablet bound — `deviceId → sessionId`. */
  listOpenBindings(orgId: OrgId): Promise<Array<{ deviceId: number; sessionId: number }>>;
  now(): number;
}

export async function listCounterDevices(
  orgId: OrgId,
  sessionId: number | null,
  deps: CounterDeviceDeps = defaultDeps,
): Promise<CounterDevice[]> {
  const [devices, bindings] = await Promise.all([
    deps.listDevices(orgId),
    deps.listOpenBindings(orgId),
  ]);
  return projectCounterDevices({ devices, bindings, nowMs: deps.now(), sessionId });
}

const defaultDeps: CounterDeviceDeps = {
  async listDevices(orgId) {
    const rows = await listKioskDevices(orgId);
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      status: row.status,
      lastSeenAtMs: row.lastSeenAt === null ? null : Date.parse(row.lastSeenAt),
    }));
  },

  async listOpenBindings(orgId) {
    return withTenantTransaction(orgId, async (client) => {
      const r = await client.query(
        `SELECT id, kiosk_device_id
           FROM counter_sessions
          WHERE organization_id = $1
            AND status = 'open'
            AND kiosk_device_id IS NOT NULL`,
        [orgId],
      );
      return (r.rows as Array<{ id: string | number; kiosk_device_id: string | number }>).map(
        (row) => ({ deviceId: Number(row.kiosk_device_id), sessionId: Number(row.id) }),
      );
    });
  },

  now: () => Date.now(),
};
