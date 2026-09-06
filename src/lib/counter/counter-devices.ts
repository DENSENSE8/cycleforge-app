/**
 * Which tablet the desk may put this visit on.
 *
 * The counter needs a *different* answer than Settings → Kiosk devices does.
 * Settings manages a fleet: enrol, revoke, pair a card reader — a manager act,
 * gated on `walk_in.enroll_kiosk`. A staffer standing at the counter asks one
 * question instead — *which iPad is in front of me, and is it free?* — and they
 * hold `walk_in.intake`, not the manager permission. Reusing the management
 * list would have meant either widening it (handing every counter staffer
 * enrolment reach) or leaving the picker unbuildable. So this is a narrower
 * read of the same rows: label, presence, and whether another open visit
 * already owns the tablet. No token, no code hash, no enrolment metadata.
 *
 * **Presence is inferred, deliberately.** There is no realtime presence signal
 * for a kiosk device — `kiosk_devices.last_seen_at` is stamped by
 * `withKioskAuth` on every device-authed request, and the tablet polls
 * `/api/kiosk/session` every 3s while awake (30s once its socket is live). A
 * tablet heard from inside {@link COUNTER_DEVICE_ONLINE_WINDOW_MS} is therefore
 * awake and reachable; one outside it is asleep, off, or on dead Wi-Fi. Ably
 * presence would be a second source of truth for the same fact, and it would
 * disagree with the row the moment a socket lingered after a sleep.
 *
 * **An `enrolled` (never-paired) or `revoked` tablet is not offerable.** Both
 * would bind fine at the DB and then show nothing, because neither can hold a
 * device cookie — a bind that paints a session onto a screen nobody can see is
 * worse than a picker that omits it.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P5, the device picker).
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import { listKioskDevices } from '@/lib/auth/kiosk-device';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * How recently a tablet must have spoken to count as online.
 *
 * Two minutes: four missed 30s live polls, or forty missed degraded ones. Wide
 * enough that a single dropped request does not grey out a tablet a staffer is
 * looking at; narrow enough that a tablet carried to the back room stops
 * claiming to be at the counter within one customer.
 */
export const COUNTER_DEVICE_ONLINE_WINDOW_MS = 120_000;

/** One enrolled tablet, as the fleet row reads before presence is applied. */
export interface CounterDeviceRow {
  id: number;
  label: string;
  status: 'enrolled' | 'active' | 'revoked';
  lastSeenAtMs: number | null;
}

/** One tablet, as the desk picker offers it. */
export interface CounterDevice {
  id: number;
  label: string;
  /** Heard from inside the presence window. */
  online: boolean;
  lastSeenAtMs: number | null;
  /**
   * The OTHER open visit holding this tablet, or null when it is free.
   *
   * Never this session: a tablet already bound here is not "in use", it is
   * *the* tablet, and offering it as busy would tell a staffer their own
   * counter is taken.
   */
  heldByOtherVisit: boolean;
}

export interface CounterDeviceDeps {
  listDevices(orgId: OrgId): Promise<CounterDeviceRow[]>;
  /** Open sessions with a tablet bound — `deviceId → sessionId`. */
  listOpenBindings(orgId: OrgId): Promise<Array<{ deviceId: number; sessionId: number }>>;
  now(): number;
}

/**
 * Fold rows + open bindings into what the picker paints.
 *
 * Ordering is what a staffer scans: free-and-awake first (the tablet they are
 * about to use), then awake-but-taken, then everything asleep, each group by
 * label so the list does not reshuffle under a click when a poll lands.
 */
export function projectCounterDevices(args: {
  devices: readonly CounterDeviceRow[];
  bindings: readonly { deviceId: number; sessionId: number }[];
  nowMs: number;
  /** The visit doing the asking, so its own tablet is not reported as busy. */
  sessionId?: number | null;
}): CounterDevice[] {
  const { devices, bindings, nowMs } = args;
  const currentSessionId = args.sessionId ?? null;

  const heldBy = new Map<number, number>();
  for (const binding of bindings) heldBy.set(binding.deviceId, binding.sessionId);

  const projected = devices
    .filter((device) => device.status === 'active')
    .map<CounterDevice>((device) => {
      const holder = heldBy.get(device.id) ?? null;
      return {
        id: device.id,
        label: device.label,
        online:
          device.lastSeenAtMs !== null &&
          nowMs - device.lastSeenAtMs <= COUNTER_DEVICE_ONLINE_WINDOW_MS,
        lastSeenAtMs: device.lastSeenAtMs,
        heldByOtherVisit: holder !== null && holder !== currentSessionId,
      };
    });

  return projected.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.heldByOtherVisit !== b.heldByOtherVisit) return a.heldByOtherVisit ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
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
