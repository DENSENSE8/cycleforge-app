'use client';

/**
 * `/search?sel=order:{id}` — an order rendered in scan-station chrome, PREVIEW.
 *
 * Replaces `search/order-feedback/` (2026-08-20): 1001 lines of a hand-rolled
 * "carton-twin" disposition bar + two-column facts/evidence body that drifted
 * independently from the station face it was imitating. This composes the real
 * one — {@link EntityStationPane}, the same host Support · Orders mounts.
 *
 * **Preview is about the centre, not the edge.** The centre paints the order's
 * fields read-only (no `editableShippingFields`, no dock), because search is a
 * find surface and a commit floor here has no station context behind it. The
 * Displays column still writes: ticket threads, support notes and warranty
 * claims are all live, which is what "edit the details in the right panel"
 * means.
 *
 * Resolve shares the TanStack cache the header find seeds
 * (`setSearchOrderResolveCache`), so a hit paints without a body hold — the
 * header `SearchPendingBar` owns the pulse. On a cold deep link there is no
 * seed, and the page-level `SearchPrimaryPaintShell` covers the plane until
 * this pane says resolve settled — whatever it settled to.
 *
 * **Leaves compose SoTs and load on demand.** The Timeline leaf is
 * `OrderTimelineSection` (the order-record trail, six spines, its own lens and
 * serial-grouping toggles) over `OrderPipelineSection`; `units` is
 * `StationUnitJourneys`, additive because it is each serial's cross-order
 * OPERATIONS journey rather than this order's trail. Both, plus the support hub
 * and the gallery, are `next/dynamic` and warm together the moment Displays
 * opens — the same recipe as `preloadUnboxDisplayLeafChunks`.
 */

import { useCallback, useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Activity, Barcode, Camera, History, Loader2, MessageSquare, Search, ShieldCheck, Ticket } from '@/components/Icons';
import { OrderPipelineSection } from '@/components/shipped/details-panel/OrderPipelineSection';
import { ShippingInformationSection } from '@/components/shipped/details-panel/ShippingInformationSection';
import { OrderCommercialFacts } from '@/components/order-record/OrderCommercialFacts';
import { Button, EmptyState } from '@/design-system/primitives';
import { buildSectionTabs } from '@/components/station/workbench';
import { OrderStationIdentity } from '@/components/station/order';
import {
  EntityStationPane,
  type StationDisplayNav,
} from '@/components/station/entity';
import { SearchOrderCentre } from './SearchOrderCentre';
import { useAutoCollapse } from '@/components/station/collapse';
import { OrderReturnsCard } from '@/components/order-record/OrderReturnsCard';
import { OrderWarrantySummary } from '@/components/order-record/OrderWarrantySummary';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { buildSearchOrderDisplayIndexRows } from './search-order-display-index';
import { useSearchOrderPhotos } from './use-search-order-photos';
import { searchOrderResolveQuery } from '@/lib/search/search-order-resolve-query';
import {
  clearGlobalSearchPending,
  setGlobalSearchPending,
} from '@/lib/global-search-pending';

/**
 * Deferred Displays leaves — the four heaviest bodies on this column.
 *
 * All of them used to be static imports, so opening `/search?sel=order:` paid
 * for the support hub, the gallery, the timeline engine and the warranty dialog
 * before the operator had opened a single leaf. Same recipe as the Unbox bench
 * (`preloadUnboxDisplayLeafChunks` in `line-edit/terminal/unbox-tabs.tsx`):
 * `dynamic()` with the column's OWN loading field, warmed the moment Displays
 * opens, so index→leaf is still a binary cut rather than a cold `import()`.
 */
const loadSupportContextHub = () =>
  import('@/components/support/context').then((m) => m.SupportContextHub);
const loadPhotoGallery = () =>
  import('@/components/shipped/PhotoGallery').then((m) => m.PhotoGallery);
const loadOrderTimelineSection = () =>
  import('@/components/shipped/OrderTimelineSection').then((m) => m.OrderTimelineSection);
const loadStationUnitJourneys = () =>
  import('@/components/station/workbench/StationUnitJourneys').then((m) => m.StationUnitJourneys);
const loadWarrantyLogClaimDialog = () =>
  import('@/components/warranty/WarrantyLogClaimDialog').then((m) => m.WarrantyLogClaimDialog);

function LeafBodyLoading() {
  return <UniversalLoader isLoading label="Loading display" />;
}

const SupportContextHub = dynamic(loadSupportContextHub, { loading: LeafBodyLoading });
const PhotoGallery = dynamic(loadPhotoGallery, { loading: LeafBodyLoading });
const OrderTimelineSection = dynamic(loadOrderTimelineSection, { loading: LeafBodyLoading });
const StationUnitJourneys = dynamic(loadStationUnitJourneys, { loading: LeafBodyLoading });
// No `loading:` — a dialog has no column to hold a field, and it only mounts
// on the operator's own click.
const WarrantyLogClaimDialog = dynamic(loadWarrantyLogClaimDialog);

/** Warm every deferred leaf chunk once the push column is open. */
function preloadSearchOrderLeafChunks(): void {
  void loadSupportContextHub();
  void loadPhotoGallery();
  void loadOrderTimelineSection();
  void loadStationUnitJourneys();
}

export function SearchOrderStationPane({
  orderId,
  onExit,
}: {
  orderId: string | number;
  /** Identity ◁ — clears `?sel=` back to the results the operator came from. */
  onExit: () => void;
}) {
  const router = useRouter();
  const [activeSideTab, setActiveSideTab] = useState<StationDisplayNav | null>(null);
  const [logWarrantyOpen, setLogWarrantyOpen] = useState(false);
  /**
   * Sticky after the first open, so closing the dialog does not unmount it
   * mid-exit-animation — and so the chunk is still not fetched by an operator
   * who never logs a claim.
   */
  const [warrantyDialogMounted, setWarrantyDialogMounted] = useState(false);
  const collapse = useAutoCollapse();

  const token = String(orderId ?? '').trim();
  // One key shape — header seeds token + numeric-string aliases so
  // `sel=order:{id}` hits memory without a ternary of incompatible options.
  const resolveQuery = useQuery(searchOrderResolveQuery(token));
  const resolved = resolveQuery.data;
  const resolveStatus =
    resolveQuery.isPending || resolveQuery.isLoading
      ? 'loading'
      : resolved?.status === 'ok'
        ? 'ok'
        : resolved?.status === 'fba'
          ? 'fba'
          : resolveQuery.isError
            ? 'notfound'
            : (resolved?.status ?? 'loading');
  const order = resolved?.status === 'ok' ? resolved.order : null;

  // Release the page-level loading field the moment resolve settles, whatever
  // it settled to: a not-found order is a painted answer, not a reason to keep
  // covering the plane.
  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    if (resolveStatus === 'loading') return;
    primaryPaint?.onPrimaryPainted();
  }, [resolveStatus, primaryPaint]);

  // Warm the deferred leaf chunks while the operator is on the Root Index —
  // a cold `import()` on leaf click otherwise paints the loading field over an
  // empty body for the length of the fetch.
  useEffect(() => {
    if (activeSideTab == null) return;
    preloadSearchOrderLeafChunks();
  }, [activeSideTab]);

  // Deep-link without a warm cache: pulse the header, never a gray page shell.
  useEffect(() => {
    const pending = resolveStatus === 'loading';
    setGlobalSearchPending(pending);
    return () => {
      clearGlobalSearchPending();
    };
  }, [resolveStatus]);

  const { photos, settled: photosSettled } = useSearchOrderPhotos(order);

  const orderNumber = String(order?.order_id || '').trim();
  const tracking = String(order?.shipping_tracking_number || '').trim();
  const orderRowId = Number(order?.id ?? 0);
  const hasOrderRow = Number.isFinite(orderRowId) && orderRowId > 0;

  const orderAnchor = useMemo(
    () => ({
      order: orderNumber || undefined,
      tracking: tracking || undefined,
    }),
    [orderNumber, tracking],
  );

  const timelineSerials = useMemo(
    () =>
      String(order?.serial_number || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [order?.serial_number],
  );

  /**
   * Centre = the Search & Details Zone 2 stack: collapsible Status & timeline
   * over the warehouse thread. `editableShippingFields` is deliberately absent
   * from every read path here — preview is the absence of that capability, not
   * a stripped fork.
   */
  const centre = useMemo(
    () =>
      order ? (
        <SearchOrderCentre order={order} collapse={collapse} />
      ) : null,
    [order, collapse],
  );

  const displayTabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'photos',
          label: 'Photos',
          icon: Camera,
          content: (
            <div className="space-y-3 pb-4">
              {photos.length === 0 ? (
                // Honest absence through the house primitive — a leaf that is
                // reachable from the index must land on a real empty state, not
                // a bare sentence that reads like a failed fetch.
                photosSettled ? (
                  <EmptyState
                    icon={<Camera className="h-6 w-6 text-text-faint" />}
                    title="No photos"
                    description="Nothing was captured for this order at arrival, unboxing, testing or packing."
                  />
                ) : (
                  <div
                    className="flex items-center justify-center py-12 text-role-caption text-text-muted"
                    aria-busy
                  >
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading photos…
                  </div>
                )
              ) : (
                <PhotoGallery
                  photos={photos}
                  orderId={orderNumber || undefined}
                  launcherTitle="Photos"
                  launcherTone="neutral"
                  launcherLayout="thumbnails"
                />
              )}
            </div>
          ),
        },
        {
          id: 'status',
          label: 'Status info',
          icon: Activity,
          // Extended status = the shipping facts the centre omits (tracking,
          // carrier state, ship-by, serials) + the commercial facts. NOT the
          // stepper: that moved to the `timeline` leaf, and composing
          // `activeSection="shipping"` here would drag it back in, putting the
          // same three milestones on two leaves of one column.
          content: order ? (
            <div className="space-y-3 pb-4">
              <ShippingInformationSection shipped={order} showSerialNumber />
              <OrderCommercialFacts order={order} />
            </div>
          ) : null,
        },
        {
          id: 'timeline',
          label: 'Timeline',
          icon: History,
          // STATUS LIVES HERE, both halves (operator ruling 2026-08-21): the
          // visual stepper AND the activity rows moved off the centre onto this
          // leaf. Order is deliberate — stepper ("where in the pipeline"), then
          // the trail ("who did what, when").
          //
          // The trail is `OrderTimelineSection`, the order-record SoT, not a
          // local merge of three spines: it already carries carrier scans, RMA
          // rows, thread messages and the lens / serial-grouping toggles this
          // leaf hand-rolled its way around. Its default heading is "Activity"
          // (it passes no `title`), which is why the E2E asserts that word.
          content: order && hasOrderRow ? (
            <div className="space-y-4 pb-4">
              <OrderPipelineSection shipped={order} />
              <OrderTimelineSection orderId={orderRowId} flush />
            </div>
          ) : order ? (
            <div className="space-y-4 pb-4">
              <OrderPipelineSection shipped={order} />
            </div>
          ) : null,
        },
        {
          id: 'units',
          label: 'Units',
          icon: Barcode,
          // Additive to `timeline`, not a duplicate of it: this is the
          // OPERATIONS journey of each serial (everything that unit ever did,
          // across orders, with its stage photos), where the Timeline leaf is
          // the trail of THIS order. `WorkspaceTimelineTab` used to host it,
          // but that host also carries a carrier spine — and the carrier scans
          // are already merged into `OrderTimelineSection`, so keeping it
          // printed every tracking event twice on one column.
          visible: timelineSerials.length > 0,
          count: timelineSerials.length,
          content: <div className="pb-4"><StationUnitJourneys serials={timelineSerials} /></div>,
        },
        {
          id: 'ticket',
          label: 'Customer ticket',
          icon: Ticket,
          content: (
            <div className="space-y-3 pb-4">
              <SupportContextHub
                anchor={orderAnchor}
                variant="station"
                onlySegment="customer"
                hideLinkage={false}
                mergeFloorTimeline
              />
            </div>
          ),
        },
        {
          id: 'support',
          label: 'Support',
          icon: MessageSquare,
          content: (
            <div className="space-y-3 pb-4">
              <SupportContextHub
                anchor={orderAnchor}
                variant="station"
                defaultSegment="team"
                hideCustomerSegment
                hideLinkage={false}
              />
            </div>
          ),
        },
        {
          id: 'warranty',
          label: 'Warranty',
          icon: ShieldCheck,
          content: order ? (
            <div className="space-y-3 pb-4">
              <OrderWarrantySummary order={order} />
              {hasOrderRow ? (
                <OrderReturnsCard orderId={orderRowId} chrome="flush" />
              ) : null}
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setWarrantyDialogMounted(true);
                  setLogWarrantyOpen(true);
                }}
              >
                Log warranty claim
              </Button>
            </div>
          ) : null,
        },
      ]),
    [
      photos,
      photosSettled,
      orderNumber,
      timelineSerials,
      orderAnchor,
      order,
      hasOrderRow,
      orderRowId,
    ],
  );

  const displayIndexRows = useMemo(
    () =>
      buildSearchOrderDisplayIndexRows({
        hasOrderNumber: Boolean(orderNumber),
        photoCount: photosSettled ? photos.length : null,
        photosSettled,
        hasWarrantyOrReturns: hasOrderRow,
        // Lockstep with `buildSectionTabs`: the `units` leaf is `visible` only
        // when the order carries serials, so an index row for it must vanish on
        // the same condition or it would navigate nowhere.
        serialCount: timelineSerials.length,
      }),
    [orderNumber, photos.length, photosSettled, hasOrderRow, timelineSerials.length],
  );

  const handleSideTabChange = useCallback(
    (next: StationDisplayNav | null) => setActiveSideTab(next),
    [],
  );

  if (resolveStatus === 'loading') {
    // The page-level `SearchPrimaryPaintShell` field is covering this plane —
    // hold a transparent box so it has geometry to cover, and never a second
    // loading face stacked under the first.
    return <div className="min-h-0 flex-1" aria-busy />;
  }

  if (resolveStatus === 'fba') {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center bg-surface-card">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="FBA order"
          description="This order is fulfilled by Amazon (FBA). Open the durable record for channel-specific detail."
        />
      </div>
    );
  }

  if (resolveStatus === 'notfound' || !order) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center bg-surface-card">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Order not found"
          description="No order matched this selection. Try another search hit."
        />
      </div>
    );
  }

  return (
    <>
      <EntityStationPane
        entityKey={order.id}
        // Read surface: no dock, centre fields inert. Displays still write.
        stance="preview"
        identity={
          <OrderStationIdentity
            order={order}
            onExitToList={onExit}
            exitLabel="Back to results"
          />
        }
        centre={centre}
        surface="card"
        onCentreScroll={collapse.onScroll}
        displayTabs={displayTabs}
        displayIndexRows={displayIndexRows}
        activeSideTab={activeSideTab}
        onSideTabChange={handleSideTabChange}
        storageKey="search-order-displays-push-width"
        ariaLabel="Search order displays"
        centerTestId="search-order-station-center"
        displaysTestId="search-order-displays-push"
        displaysResizeTestId="search-order-displays-push-resize"
      />

      {warrantyDialogMounted ? (
        <WarrantyLogClaimDialog
          open={logWarrantyOpen}
          onClose={() => setLogWarrantyOpen(false)}
          onCreated={(id) => {
            router.push(`/support?mode=warranty&open=${id}`);
          }}
          initial={{
            orderId: orderRowId || undefined,
            serialNumber: timelineSerials[0],
            sku: order.sku || undefined,
            productTitle: order.product_title || undefined,
          }}
        />
      ) : null}
    </>
  );
}
