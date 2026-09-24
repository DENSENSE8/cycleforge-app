/**
 * Readers over `repair_service.status_history` — the server-stamped state
 * trail. The mobile workbench screens (hub, bench log, record) all need the
 * same two answers, so they live here once.
 *
 * Timestamps are PST wall-clock strings written by the server
 * (`formatPSTTimestamp`); format them with `formatMonthDayTimePST`.
 */
import type { RepairStatusHistoryEntry, RSRecord } from '@/lib/neon/repair-service-queries';

/** Latest entry that put the repair into its CURRENT status — the stamp for "since when". */
export function currentStatusEntry(repair: RSRecord): RepairStatusHistoryEntry | null {
  const history = repair.status_history ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].status === repair.status) return history[i];
  }
  return null;
}

/** The pickup write (`/api/repair-service/pickup`) tags its entry with a `picked_up_*` action. */
export function pickupEntry(repair: RSRecord): RepairStatusHistoryEntry | null {
  const history = repair.status_history ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const action = history[i].metadata?.action;
    if (typeof action === 'string' && action.startsWith('picked_up')) return history[i];
  }
  return null;
}
