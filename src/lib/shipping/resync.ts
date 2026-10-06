/**
 * Operator resync: re-poll OPEN shipments now, ignoring next_check_at and the
 * error backoff (`scripts/shipping-resync.mts`). Each row goes through
 * `syncShipment` — the cron sweep's own provider + repository writers — under
 * the row's own org, so a success resets consecutive_error_count and sets
 * next_check_at via computeNextCheckAt exactly as the sweep does. Carriers
 * without credentials are reported once and never polled (no row touched).
 */

import { carrierConfigFaults, type CarrierConfigFault } from './carrier-credentials';
import { isCarrierSyncEnabled } from './enabled-carriers';
import { getOpenShipmentsForResync, type ResyncCandidate } from './repository';
import { syncShipment, type SyncShipmentResult } from './sync-shipment';

export interface ResyncOptions {
  carriers: readonly string[];
  onlyFailing: boolean;
  tracking: string | null;
  limit: number;
  concurrency: number;
}

/** The resync's seams: the row selector, the ONE writer (`syncShipment` itself), and where credentials are read. */
export interface ResyncDeps {
  selectOpen: typeof getOpenShipmentsForResync;
  sync: typeof syncShipment;
  env: Readonly<Record<string, string | undefined>>;
}

export const resyncDeps: ResyncDeps = {
  selectOpen: getOpenShipmentsForResync,
  sync: syncShipment,
  env: process.env,
};

export interface ResyncOutcome {
  candidate: ResyncCandidate;
  result: SyncShipmentResult;
}

export interface ResyncSummary {
  /** Carriers left out before selecting rows (credentials missing). */
  configFaults: CarrierConfigFault[];
  /** Requested carriers the sweep does not poll (USPS pending its IP Agreement). */
  disabled: string[];
  selected: number;
  ok: number;
  errors: number;
  eventsInserted: number;
  /** Error message → rows. */
  errorsByMessage: Record<string, number>;
  /** `PREVIOUS → NEW` status → rows (successful polls only). */
  transitions: Record<string, number>;
}

export async function resyncOpenShipments(
  options: ResyncOptions,
  deps: ResyncDeps = resyncDeps,
  onOutcome?: (outcome: ResyncOutcome) => void,
): Promise<ResyncSummary> {
  const requested = [...new Set(options.carriers.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const disabled = requested.filter((c) => !isCarrierSyncEnabled(c));
  const configFaults = carrierConfigFaults(requested.filter((c) => isCarrierSyncEnabled(c)), deps.env);
  const pollable = requested.filter((c) => isCarrierSyncEnabled(c) && !configFaults.some((f) => f.carrier === c));

  const summary: ResyncSummary = {
    configFaults,
    disabled,
    selected: 0,
    ok: 0,
    errors: 0,
    eventsInserted: 0,
    errorsByMessage: {},
    transitions: {},
  };
  if (pollable.length === 0) return summary;

  const candidates = await deps.selectOpen({
    carriers: pollable,
    onlyFailing: options.onlyFailing,
    tracking: options.tracking,
    limit: options.limit,
  });
  summary.selected = candidates.length;

  const concurrency = Math.max(1, options.concurrency);
  for (let i = 0; i < candidates.length; i += concurrency) {
    const chunk = candidates.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      chunk.map((candidate) => deps.sync({ shipmentId: candidate.id }, candidate.organizationId ?? undefined)),
    );
    settled.forEach((s, idx) => {
      const result: SyncShipmentResult =
        s.status === 'fulfilled'
          ? s.value
          : { ok: false, shipmentId: chunk[idx].id, error: s.reason instanceof Error ? s.reason.message : String(s.reason) };
      if (result.ok) {
        summary.ok++;
        summary.eventsInserted += result.eventsInserted ?? 0;
        const key = `${chunk[idx].previousStatus ?? 'NONE'} → ${result.status ?? 'UNKNOWN'}`;
        summary.transitions[key] = (summary.transitions[key] ?? 0) + 1;
      } else {
        summary.errors++;
        const message = (result.error ?? result.errorCode ?? 'sync failed').split('\n')[0].slice(0, 160);
        summary.errorsByMessage[message] = (summary.errorsByMessage[message] ?? 0) + 1;
      }
      onOutcome?.({ candidate: chunk[idx], result });
    });
  }
  return summary;
}
