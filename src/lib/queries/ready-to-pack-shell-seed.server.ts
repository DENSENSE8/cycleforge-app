/**
 * Shell-level paint seed for the Testing station's default landing —
 * **Ready to Pack** (`/test`, no `?view=`).
 *
 * ## What it seeds, and why each piece is here
 *
 * | Key | Paints | Was |
 * |---|---|---|
 * | `dashboard-table / unshipped` | the grid rows — the LCP element | `/api/orders?listShape=queue` at **13.0s** under this surface's ~17 concurrent shell fetches |
 * | `dashboard-table / unshipped-counts` | Band-2 lifecycle tiles | a client fetch |
 * | `orders / pack-placement` | Band-2 per-bench tiles + the rail's armed-bench chip | a client fetch |
 * | `units / pack-placement` | the per-bench units strip under Band 2 | a client fetch |
 * | `ops-roi` | the ROI tile | a client fetch |
 *
 * The grid seed is the LCP fix. The other four are a **CLS** fix, and they are
 * not optional once the grid paints: `ShippingKpiStrip` shows a four-slot
 * skeleton until all of its inputs settle, while the loaded band is data-sized
 * (four lifecycle tiles PLUS one per packing bench, wrapping to a second row)
 * and is followed by a units strip that renders `null` while pending. That swap
 * is a ~80px height change in the band directly above the work surface. With an
 * empty grid it cost nothing; with rows under it, it moved every one of them.
 * A taller skeleton cannot fix it — the loaded height depends on how many
 * benches the org has.
 *
 * ROI is seeded for a second reason: `useGatedOperationsRoi` is disabled until
 * client auth resolves, so it is not pending during SSR and then becomes
 * `isLoading` a moment later — which would send an already-painted band back to
 * its skeleton and shift the grid twice.
 *
 * ## Why this is a SHELL seed and not a page seed
 *
 * `ShippingScanBand` lives in the left rail, which `ResponsiveLayout` renders as
 * a sibling of `children` — so it mounts `packPlacementQuery` **before** the
 * page renders. `HydrationBoundary` hydrates immediately only for keys the cache
 * does not already hold; a key the rail already created goes to its deferred
 * effect path, which does not run during SSR. Seeded from the page, the KPI band
 * therefore server-rendered its skeleton anyway and swapped at hydration — the
 * same shift, just earlier. Above the shell it lands in the first HTML.
 *
 * Every failure is soft and logged: an unseeded key is fetched by the client
 * exactly as it was before.
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
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
  // The staffer's saved column widths — **this is the CLS**, and it is not a
  // KPI-band problem the way it first looked. `tableColumns.orders.widths.title`
  // is 654px for the dogfood operator, while the SoT track is a hard
  // `minmax(12rem, 12rem)` = 192px with the trailing `_fill` absorbing the
  // slack. The server has no preferences, so it renders 192px + a 486px filler;
  // the client loads them and Product jumps to 654px, collapsing that filler to
  // 24px. Measured under 4x CPU / Slow 4G: one shift, **0.1179**, every cell in
  // every row moving 462px sideways at t≈3.2s.
  //
  // `useStaffPreferences` unwraps `{ prefs }` and falls back to `{}`, so seed
  // the same shape rather than the envelope.
  if (prefs != null) {
    queryClient.setQueryData(
      STAFF_PREFERENCES_KEY,
      (prefs as { prefs?: unknown }).prefs ?? {},
    );
  }

  return dehydrate(queryClient);
}
