/**
 * "Tell me when this tracking number lands" — and "stop" — for ONE staffer.
 *
 * The tracking arm of the Today Watch rail (`POST /api/my-day/watch`) and the
 * chat's `watch_tracking` both land here, so a watch set in either place is
 * the same row and shows in the same watcher list
 * (`listReceivingWatchesForStaff`). A number with a carton follows the carton
 * (entity subscription); a number that has not landed yet is a PRE-ARRIVAL
 * rule the arrival event fires. Stop mutes both arms.
 *
 * Callers own the gates: `home.subscriptions.manage` and the home-inbox flag.
 */

import { ApiError } from '@/lib/api';
import { NOTIFIABLE_EVENTS } from '@/lib/notifications/event-vocabulary';
import {
  stopTrackingPreArrivalWatch,
  toggleEntitySubscription,
  watchTrackingPreArrival,
} from '@/lib/notifications/subscriptions';
import type { SubscriptionDto } from '@/lib/notifications/types';
import { resolveShipmentForScan } from '@/lib/receiving/resolve-shipment-for-scan';
import type { OrgId } from '@/lib/tenancy/constants';
import { extractCanonicalTracking } from '@/lib/tracking-format';

/**
 * The arrival a pre-arrival watch waits on — named from the vocabulary rather
 * than typed as a literal, so a rename of the event key cannot leave watches
 * silently listening for an event nobody emits.
 */
const RECEIVING_CARTON_ARRIVED_EVENT_KEY = NOTIFIABLE_EVENTS['receiving.carton.arrived'].key;

export type TrackingWatchResult =
  | { kind: 'stopped'; tracking: string; stopped: boolean }
  | { kind: 'pre_arrival'; tracking: string; created: boolean }
  | {
      kind: 'carton';
      tracking: string;
      receivingId: number;
      shipmentId: number | null;
      subscription: SubscriptionDto | null;
    };

export async function setTrackingWatch(args: {
  orgId: OrgId;
  staffId: number;
  permissions: readonly string[];
  /** The number as typed or scanned. */
  value: string;
  desired: 'subscribed' | 'muted';
  clientEventId?: string | null;
}): Promise<TrackingWatchResult> {
  const canonical = extractCanonicalTracking(args.value) || args.value.trim();
  if (canonical.length < 6) throw ApiError.badRequest('Enter a full tracking number');

  const resolved = await resolveShipmentForScan(canonical, args.orgId);

  if (args.desired === 'muted') {
    const { stopped } = await stopTrackingPreArrivalWatch({ orgId: args.orgId, staffId: args.staffId, trackingNormalized: canonical });
    let entityStopped = false;
    if (resolved.receivingId) {
      const muted = await toggleEntitySubscription({
        orgId: args.orgId,
        staffId: args.staffId,
        entityType: 'receiving',
        entityId: resolved.receivingId,
        desired: 'muted',
        permissions: args.permissions,
        clientEventId: args.clientEventId ?? null,
      });
      entityStopped = muted.outcome === 'muted';
    }
    return { kind: 'stopped', tracking: canonical, stopped: stopped > 0 || entityStopped };
  }

  if (!resolved.receivingId) {
    const { created } = await watchTrackingPreArrival({
      orgId: args.orgId,
      staffId: args.staffId,
      trackingNormalized: canonical,
      eventKey: RECEIVING_CARTON_ARRIVED_EVENT_KEY,
    });
    return { kind: 'pre_arrival', tracking: canonical, created };
  }

  const result = await toggleEntitySubscription({
    orgId: args.orgId,
    staffId: args.staffId,
    entityType: 'receiving',
    entityId: resolved.receivingId,
    desired: 'subscribed',
    permissions: args.permissions,
    clientEventId: args.clientEventId ?? null,
  });
  if (result.outcome === 'forbidden') throw new ApiError(403, 'You cannot watch this carton');
  if (result.outcome === 'invalid_entity') throw ApiError.badRequest('Unknown entity type');
  return {
    kind: 'carton',
    tracking: canonical,
    receivingId: resolved.receivingId,
    shipmentId: resolved.shipmentId ?? null,
    subscription: result.subscription,
  };
}
