import { runDueShipments } from '@/lib/shipping/scheduler';
import { emitOverdueOrderAlerts } from '@/lib/shipping/overdue-order-alerts';
import { carrierConfigFaults, type CarrierConfigFault } from '@/lib/shipping/carrier-credentials';
import { ENABLED_SYNC_CARRIERS } from '@/lib/shipping/enabled-carriers';
import type { CarrierCode } from '@/lib/shipping/types';

export interface ShippingSyncDuePayload {
  limit?: unknown;
  concurrency?: unknown;
  carrier?: unknown;
  carriers?: unknown;
}

export interface ShippingSyncDueJobResult {
  /** False when any requested carrier could not be polled for a configuration fault. */
  ok: boolean;
  synced: number;
  terminal: number;
  errors: number;
  durationMs: number;
  overdueCandidates: number;
  alertSubscriptionsAdded: number;
  /** Carriers skipped before the sweep (no row touched), one entry each. */
  configFaults: CarrierConfigFault[];
}

/** What the job reaches outside itself (tests swap them). */
export interface ShippingSyncDueDeps {
  runDueShipments: typeof runDueShipments;
  emitOverdueOrderAlerts: typeof emitOverdueOrderAlerts;
  env: Readonly<Record<string, string | undefined>>;
}

const shippingSyncDueDeps: ShippingSyncDueDeps = { runDueShipments, emitOverdueOrderAlerts, env: process.env };

export function normalizeShippingSyncDuePayload(
  payload: ShippingSyncDuePayload = {}
): { limit: number; concurrency: number; carriers?: CarrierCode[] } {
  let limit = 50;
  let concurrency = 5;
  let carriers: CarrierCode[] | undefined;

  if (payload.limit) limit = Math.min(Number(payload.limit), 200);
  if (payload.concurrency) concurrency = Math.min(Number(payload.concurrency), 10);

  const carrierInput = payload.carrier ?? payload.carriers;
  if (carrierInput) {
    const values = Array.isArray(carrierInput) ? carrierInput : [carrierInput];
    const normalized = values
      .map((value) => String(value).toUpperCase())
      .filter((value): value is CarrierCode => ['UPS', 'USPS', 'FEDEX'].includes(value));
    if (normalized.length > 0) carriers = normalized;
  }

  return { limit, concurrency, carriers };
}

export async function runShippingSyncDueJob(
  payload: ShippingSyncDuePayload = {},
  deps: ShippingSyncDueDeps = shippingSyncDueDeps,
): Promise<ShippingSyncDueJobResult> {
  const { limit, concurrency, carriers } = normalizeShippingSyncDuePayload(payload);
  const start = Date.now();
  // Credentials are checked ONCE, before the sweep: a carrier without them is
  // left out of the due query entirely, so none of its rows is polled, errored
  // or backed off for what is a deployment fault.
  const requested = (carriers ?? ENABLED_SYNC_CARRIERS).filter((c) => ENABLED_SYNC_CARRIERS.includes(c));
  const configFaults = carrierConfigFaults(requested, deps.env);
  const pollable = requested.filter((c) => !configFaults.some((fault) => fault.carrier === c));
  const result = pollable.length > 0
    ? await deps.runDueShipments({ limit, concurrency, carriers: pollable })
    : { synced: 0, terminal: 0, errors: 0, durationMs: Date.now() - start };
  // Carrier truth lands first; the alert payload then carries the freshest
  // status available for each internally-unfulfilled overdue order.
  const alerts = await deps.emitOverdueOrderAlerts({ limit: 250 });
  return {
    ok: configFaults.length === 0,
    ...result,
    overdueCandidates: alerts.candidates,
    alertSubscriptionsAdded: alerts.subscriptionsAdded,
    configFaults,
  };
}
