import 'server-only';

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { QueryResult, QueryResultRow } from 'pg';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import { NOTIFIABLE_EVENTS } from '@/lib/notifications/event-vocabulary';
import { markReceivingPriority } from '@/lib/receiving/mark-priority';

/** What the door learned about a carton somebody was waiting for. */
interface WatchedArrival {
  /** At least one staffer had a live watch on this number or this carton. */
  watched: boolean;
  /** How many staffers were waiting — the toast says "2 people are waiting". */
  watcherCount: number;
  /**
   * True only when THIS scan promoted the carton. A re-scan of an already
   * urgent carton reports false, so the door does not celebrate twice.
   */
  promotedUrgent: boolean;
}

/** The answer for every scan that is not a watched door arrival. */
const NOT_WATCHED: WatchedArrival = {
  watched: false,
  watcherCount: 0,
  promotedUrgent: false,
};

export interface WatchedArrivalDeps {
  query: <T extends QueryResultRow = QueryResultRow>(
    orgId: OrgId,
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<QueryResult<T>>;
  markUrgent: (receivingId: number, orgId: string) => Promise<boolean>;
  /** Tell the operator holding the box, on their own inbox channel. */
  alertScanner: (args: {
    orgId: string;
    staffId: number;
    receivingId: number;
    trackingNumber: string;
    watcherCount: number;
  }) => Promise<void>;
}

const defaultWatchedArrivalDeps: WatchedArrivalDeps = {
  query: tenantQuery,
  markUrgent: markReceivingPriority,
  // Dynamic import for the same reason the fan-out worker uses one: the
  // realtime publisher pulls the Ably server SDK, and this module is imported
  // by DB-free unit tests.
  alertScanner: async (args) => {
    const { publishWatchedArrival } = await import('@/lib/realtime/publish');
    await publishWatchedArrival({
      organizationId: args.orgId,
      staffId: args.staffId,
      receivingId: args.receivingId,
      trackingNumber: args.trackingNumber,
      watcherCount: args.watcherCount,
    });
  },
};

/** "Somebody is waiting for this box" — resolved at the door, acted on at once. */
export async function promoteWatchedArrival(
  args: {
    orgId: OrgId;
    receivingId: number;
    trackingNumber: string;
    /** Who scanned it — the one person the fan-out will never notify. */
    scannedByStaffId: number | null;
  },
  deps: WatchedArrivalDeps = defaultWatchedArrivalDeps,
): Promise<WatchedArrival> {
  const canonical = extractCanonicalTracking(args.trackingNumber) || args.trackingNumber.trim();
  if (!canonical) return NOT_WATCHED;

  const res = await deps.query<{ watchers: string | number }>(
    args.orgId,
    `SELECT COUNT(DISTINCT staff_id)::int AS watchers
       FROM staff_subscriptions
      WHERE organization_id = $1
        AND state <> 'muted'
        AND (
          (subscription_kind = 'rule'
             AND match_tracking_normalized = $2
             AND $4 = ANY(match_event_keys))
          OR
          (subscription_kind = 'entity'
             AND entity_type = 'receiving'
             AND entity_id = $3)
        )`,
    [args.orgId, canonical, args.receivingId, NOTIFIABLE_EVENTS['receiving.carton.arrived'].key],
  );

  const watcherCount = Number(res.rows[0]?.watchers ?? 0);
  if (watcherCount <= 0) return NOT_WATCHED;

  const promotedUrgent = await deps.markUrgent(args.receivingId, args.orgId);

  // The scanner's own alert. Sent even when the carton was ALREADY urgent — the
  // operator is holding the box now, and "someone is waiting for this" is news
  // about this scan, not about the flag's history.
  if (args.scannedByStaffId != null) {
    await deps.alertScanner({
      orgId: args.orgId,
      staffId: args.scannedByStaffId,
      receivingId: args.receivingId,
      trackingNumber: canonical,
      watcherCount,
    });
  }

  return { watched: true, watcherCount, promotedUrgent };
}
