/**
 * Where a shipped package is — ONE `FULFILLED_BUCKETS` id per package, first
 * match wins in the declared precedence (`bucket-precedence.ts`), and the one
 * id a line / order paints from its packages. This is the CARRIER half of the
 * journey; the order's check-in replaces / competes with it in `./journey.ts`.
 * Pure: the statement (`./sql.ts`) reads the facts, this decides, so the rule
 * is tested without a database.
 *
 * MOVED = a real carrier scan: an ACCEPTED / IN_TRANSIT / OUT_FOR_DELIVERY /
 * DELIVERED event, or the package row's own stamps (accepted, first in
 * transit, out for delivery, or that category) — except a `source_system =
 * 'scan'` stamp with no MOVING event and no successful poll: that is a
 * synthetic stamp (751 USPS rows, 2026-08/09; FedEx rows whose only event is
 * "Label created"), not carrier evidence. Judged on moving events, not on any
 * event, so the list and the shipment record agree whatever events each read sees.
 *
 * TRACKING STALE = we stopped asking: a polled carrier whose last SUCCESSFUL
 * poll (`lastCheckedAt`, stamped only on success) — or, never polled ok, the
 * hand-off — is older than {@link POLL_STALE_HOURS}. It is checked before the
 * movement buckets so a silent carrier is never blamed while we are not
 * asking it. LATE = undelivered past the carrier's FIRST promise
 * (`promisedAt`).
 */

import { fulfilledPrimaryBucket, type FulfilledBucketId } from '@/lib/nav/locate/bucket-precedence';
import type { FulfilledPackageRow } from '@/lib/nav/fulfilled/sql';
import { pickupWindowElapsed } from '@/lib/shipping/carrier-pickup-window';
import { isCarrierSyncEnabled } from '@/lib/shipping/enabled-carriers';
import { isStalled } from '@/lib/shipping/shipment-status';

/** Hours since the last successful carrier poll before a polled package reads "tracking stale". */
export const POLL_STALE_HOURS = 24;
const HOUR_MS = 3_600_000;

const MOVED_CATEGORIES: Readonly<Record<string, true>> = { ACCEPTED: true, IN_TRANSIT: true, OUT_FOR_DELIVERY: true };

type PackageFacts = Omit<FulfilledPackageRow, 'orderRowId' | 'orderKey'>;

/** What a package's movement stamps are judged from (the shipment record reads this shape too). */
type CarrierScanFacts = Pick<
  PackageFacts,
  | 'firstMoveEventAt'
  | 'sourceSystem'
  | 'eventCount'
  | 'lastCheckedAt'
  | 'consecutiveErrors'
  | 'lastError'
  | 'carrierAcceptedAt'
  | 'firstInTransitAt'
  | 'outForDeliveryAt'
  | 'deliveredAt'
>;

/** A carrier poll answered without error (the error columns clear on success). */
export function polledOk(pkg: Pick<PackageFacts, 'lastCheckedAt' | 'consecutiveErrors' | 'lastError'>): boolean {
  return pkg.lastCheckedAt !== null && pkg.consecutiveErrors === 0 && pkg.lastError === null;
}

/** The package row's movement stamps are not carrier evidence: a scan-written stamp no moving event or good poll confirmed. */
function syntheticStamps(pkg: CarrierScanFacts): boolean {
  return pkg.sourceSystem?.toLowerCase() === 'scan' && pkg.firstMoveEventAt === null && !polledOk(pkg);
}

/** When our view of a polled package was last refreshed: the last successful poll, else the hand-off. */
export function trackingFreshSince(pkg: Pick<PackageFacts, 'lastCheckedAt' | 'handOffAt'>): string | null {
  return pkg.lastCheckedAt ?? pkg.handOffAt;
}

/** A polled (sync-enabled), non-terminal package nobody has successfully polled for {@link POLL_STALE_HOURS}. */
function trackingStale(pkg: PackageFacts, now: Date): boolean {
  if (!isCarrierSyncEnabled(pkg.carrier) || pkg.isTerminal) return false;
  const since = trackingFreshSince(pkg);
  const sinceMs = since ? Date.parse(since) : Number.NaN;
  return Number.isFinite(sinceMs) && now.getTime() - sinceMs > POLL_STALE_HOURS * HOUR_MS;
}

/** The first real carrier scan, or null when the carrier never moved it (synthetic stamps ignored). */
export function firstCarrierScanAt(pkg: CarrierScanFacts): string | null {
  if (pkg.firstMoveEventAt) return pkg.firstMoveEventAt;
  if (syntheticStamps(pkg)) return null;
  const stamps = [pkg.carrierAcceptedAt, pkg.firstInTransitAt, pkg.outForDeliveryAt, pkg.deliveredAt].filter(
    (at): at is string => at !== null,
  );
  if (stamps.length > 0) return stamps.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));
  return null;
}

/** Did a carrier physically scan it? */
export function packageMoved(pkg: PackageFacts): boolean {
  if (firstCarrierScanAt(pkg)) return true;
  return !syntheticStamps(pkg) && pkg.category !== null && MOVED_CATEGORIES[pkg.category] === true;
}

/** The package's one bucket as of `now`. */
export function fulfilledPackageBucket(pkg: PackageFacts, now: Date): FulfilledBucketId {
  if (pkg.shipmentId === null || !pkg.tracking) return 'no_tracking';
  if (pkg.category === 'RETURNED' || pkg.returnToSenderEvent) return 'returned';
  if (pkg.deliveredAt !== null || pkg.isDelivered || pkg.category === 'DELIVERED') return 'delivered';
  if (pkg.category === 'EXCEPTION' || pkg.hasException) return 'exception';
  if (!isCarrierSyncEnabled(pkg.carrier) && pkg.eventCount === 0) return 'untracked';
  if (trackingStale(pkg, now)) return 'tracking_stale';
  if (!packageMoved(pkg)) {
    return pkg.handOffAt && pickupWindowElapsed(new Date(pkg.handOffAt), now) ? 'no_movement' : 'awaiting';
  }
  if (isStalled({ isTerminal: pkg.isTerminal, category: pkg.category, latestEventAt: pkg.latestEventAt, now: now.getTime() })) {
    return 'stalled';
  }
  // Late: past the carrier's FIRST promise (delivered packages returned above).
  const promisedMs = pkg.promisedAt ? Date.parse(pkg.promisedAt) : Number.NaN;
  if (Number.isFinite(promisedMs) && now.getTime() > promisedMs) return 'late';
  if (pkg.category === 'OUT_FOR_DELIVERY') return 'out_for_delivery';
  return 'in_transit';
}

/**
 * A line's / order's one bucket from its packages' (none = no tracking): it is
 * delivered only when EVERY package is; otherwise the precedence over its
 * packages that are not delivered (a delivered box never hides one in transit).
 */
export function fulfilledGroupBucket(packageBuckets: readonly FulfilledBucketId[]): FulfilledBucketId {
  if (packageBuckets.length === 0) return 'no_tracking';
  if (packageBuckets.every((id) => id === 'delivered')) return 'delivered';
  return fulfilledPrimaryBucket(packageBuckets.filter((id) => id !== 'delivered')) ?? 'no_tracking';
}
