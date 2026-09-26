/** Shell-level paint seed for the Testing station's default landing — **Ready to Pack** (`/test`, no `?view=`). */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';
import { serverSelfFetch } from '@/lib/observability/server-self-fetch';
import { normalizeUnshippedOrdersPayload } from '@/lib/orders/order-record-normalize';
import { normalizeQueueCountsPayload } from '@/lib/orders/queue-counts-normalize';

/** Keep in lockstep with `UnshippedTable`'s initial `rowLimit`. */
const UNSHIPPED_SEED_LIMIT = 200;

/** Keys mirror the client hooks named in each comment. */
const UNSHIPPED_LIST_KEY = [
  'dashboard-table',
  'unshipped',
  {
    searchQuery: '',
    packedBy: undefined,
    testedBy: undefined,
    staffId: undefined,
    strictSearchScope: true,
    stage: null,
    limit: UNSHIPPED_SEED_LIMIT,
  },
] as const; // unshippedOrdersQuery
const UNSHIPPED_COUNTS_KEY = ['dashboard-table', 'unshipped-counts', { staffId: null }] as const; // unshippedQueueCountsQuery
// `null` = the no-excludeOrderId read; the pill's own Last-entry variant keys
// on its order id and is never the shell seed's business.
const PACK_PLACEMENT_KEY = ['orders', 'pack-placement', null] as const; // packPlacementQuery
const UNIT_PLACEMENT_KEY = ['units', 'pack-placement'] as const; // unitPackPlacementQuery
const OPS_ROI_KEY = ['ops-roi'] as const; // useOperationsRoi
const STAFF_PREFERENCES_KEY = ['staff-preferences'] as const; // useStaffPreferences

async function getJson(path: string): Promise<unknown | null> {
  try {
    const res = await serverSelfFetch(path);
    if (!res.ok) {
      // Loud on purpose: a silently-skipped key looks exactly like a seed that
      // worked, and the band's whole job here is to not swap after paint.
      console.error(`ready-to-pack seed ${path} -> ${res.status}; client will fetch`);
      return null;
    }
    return await res.json();
  } catch (error) {
    if (isNextDynamicUsage(error)) throw error;
    console.error(`ready-to-pack seed failed for ${path}; client will fetch`, error);
    return null;
  }
}

/**
 * Warm the Ready-to-Pack grid + Band-2 chrome + the staffer's column widths.
 * All six reads are issued together — they are independent, and in series they
 * would each land on TTFB.
 */
export async function seedReadyToPackStation(): Promise<DehydratedState> {
  const queryClient = new QueryClient();

  const [orders, counts, placement, units, roi, prefs] = await Promise.all([
    getJson(
      `/api/orders?${new URLSearchParams({
        fulfillmentScope: 'true',
        listShape: 'queue',
        limit: String(UNSHIPPED_SEED_LIMIT),
      })}`,
    ),
    getJson('/api/orders/queue-counts'),
    getJson('/api/orders/pack-placement'),
    getJson('/api/units/pack-placement'),
    getJson('/api/operations/roi'),
    getJson('/api/staff-preferences'),
  ]);

  if (orders != null) {
    const rows = normalizeUnshippedOrdersPayload((orders as { orders?: unknown[] }).orders || []);
    queryClient.setQueryData(UNSHIPPED_LIST_KEY, rows);
  }
  // Counts go through the shared normalizer for the reason its docblock gives:
  // a hand-narrowed seed once dropped `packPlacement` and the bench chips read
  // zero for the whole `staleTime` on every load.
  if (counts != null) {
    const normalized = normalizeQueueCountsPayload(counts);
    if (normalized != null) queryClient.setQueryData(UNSHIPPED_COUNTS_KEY, normalized);
  }
  if (placement != null) queryClient.setQueryData(PACK_PLACEMENT_KEY, placement);
  if (units != null) queryClient.setQueryData(UNIT_PLACEMENT_KEY, units);
  // `fetchRoi` resolves to `null` for an unsuccessful response, so seed `null`
  // rather than the envelope — otherwise the band reads `hasData` off a shape
  // the hook itself would have discarded.
  if (roi != null) {
    const ok = (roi as { success?: boolean }).success === true;
    queryClient.setQueryData(OPS_ROI_KEY, ok ? roi : null);
  }
  // The staffer's saved column widths — **this is the CLS**, and it is not a KPI-band problem the way it first looked.
  if (prefs != null) {
    queryClient.setQueryData(
      STAFF_PREFERENCES_KEY,
      (prefs as { prefs?: unknown }).prefs ?? {},
    );
  }

  return dehydrate(queryClient);
}
