'use client';

/**
 * `/search?sel=receiving:{id}` — carton read in scan-station preview chrome.
 *
 * Unbox carton identity (`SearchReceivingIdentity` → `CartonContextCard`), centre Status first (order
 * pipeline when linked, inbound pipeline when unmatched), then Items.
 * Never mounts `CartonInspectionPage` or a warehouse thread.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Barcode,
  Camera,
  History,
  Loader2,
  MessageSquare,
  Search,
  ShieldCheck,
  Ticket,
} from '@/components/Icons';
import { OrderPipelineSection } from '@/components/shipped/details-panel/OrderPipelineSection';
import { ShippingInformationSection } from '@/components/shipped/details-panel/ShippingInformationSection';
import { OrderCommercialFacts } from '@/components/order-record/OrderCommercialFacts';
import { Button, EmptyState } from '@/design-system/primitives';
import { buildSectionTabs } from '@/components/station/workbench';
import {
  EntityStationPane,
  type StationDisplayNav,
} from '@/components/station/entity';
import { useAutoCollapse } from '@/components/station/collapse';
import { OrderReturnsCard } from '@/components/order-record/OrderReturnsCard';
import { OrderWarrantySummary } from '@/components/order-record/OrderWarrantySummary';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { buildSearchOrderDisplayIndexRows } from './search-order-display-index';
import { SearchReceivingCentre } from './SearchReceivingCentre';
import { SearchReceivingIdentity } from './SearchReceivingIdentity';
import { ReceivingCartonPipeline } from '@/components/station/receiving/ReceivingCartonPipeline';
import { deriveCartonReadiness } from '@/lib/receiving/carton-readiness';
import { cartonToReceivingDetailsLog } from '@/lib/receiving/carton-to-details-log';
import { receivingPhotoToGalleryInput } from '@/lib/photos/photo-gallery-utils';
import {
  searchReceivingLinkedOrderQuery,
  searchReceivingQuery,
} from '@/lib/search/search-receiving-resolve-query';
import {
  clearGlobalSearchPending,
  setGlobalSearchPending,
} from '@/lib/global-search-pending';
import { useReceivingPhotos } from '@/hooks/useReceivingPhotos';
import {
  cartonHeaderIdentity,
  type CartonInspectorEvent,
} from '@/components/receiving/inspector/carton-inspector-model';
import { CopyableValueFieldBlock } from '@/components/shipped/details-panel/blocks/CopyableValueFieldBlock';
import { formatDateTimePST } from '@/utils/date';
import { cartonEventSignature, cartonEventTitle } from '@/components/receiving/inspector/carton-inspector-model';
import { StaffAvatar } from '@/components/identity/StaffAvatar';

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
const WarrantyLogClaimDialog = dynamic(loadWarrantyLogClaimDialog);

function preloadSearchReceivingLeafChunks(): void {
  void loadSupportContextHub();
  void loadPhotoGallery();
  void loadOrderTimelineSection();
  void loadStationUnitJourneys();
}

function CartonActivityList({ events }: { events: CartonInspectorEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-role-caption text-text-muted">No carton activity recorded yet.</p>
    );
  }

  return (
    <ul className="divide-y divide-border-hairline">
      {events.map((event) => {
        const { kind, trail } = cartonEventSignature(event);
        return (
          <li key={event.id} className="space-y-1 py-2">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words text-role-caption font-semibold text-text-default">
                {cartonEventTitle(event)}
              </span>
              <span className="shrink-0 whitespace-nowrap text-role-caption tabular-nums text-text-muted">
                {formatDateTimePST(event.occurred_at)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-role-caption text-text-muted">
              {event.actor_staff_id != null || event.actor_name ? (
                <span className="flex items-center gap-1.5 text-text-default">
                  <StaffAvatar staffId={event.actor_staff_id} name={event.actor_name} size="xs" />
                  {event.actor_name ? <span>{event.actor_name}</span> : null}
                </span>
              ) : null}
              {kind ? <span>{kind}</span> : null}
              {trail ? <span>{trail}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function InboundStatusFacts({
  receiving,
}: {
  receiving: ReturnType<typeof cartonToReceivingDetailsLog>;
}) {
  const rows: Array<{ label: string; value: string }> = [];
  if (receiving.qa_status && receiving.qa_status !== 'PENDING') {
    rows.push({ label: 'QA', value: receiving.qa_status.replace(/_/g, ' ') });
  }
  if (receiving.disposition_code) {
    rows.push({ label: 'Disposition', value: receiving.disposition_code.replace(/_/g, ' ') });
  }
  if (receiving.condition_grade) {
    rows.push({ label: 'Condition', value: receiving.condition_grade });
  }
  if (receiving.staging_location_label) {
    rows.push({ label: 'Staging', value: receiving.staging_location_label });
  }

  if (rows.length === 0) {
    return (
      <p className="text-role-caption text-text-muted">No inbound status facts on file.</p>
    );
  }

  return (
    <div className="space-y-0">
      {rows.map((row, idx) => (
        <CopyableValueFieldBlock
          key={row.label}
          label={row.label}
          value={row.value}
          variant="flat"
          keepBottomDivider={idx < rows.length - 1}
        />
      ))}
    </div>
  );
}

export function SearchReceivingStationPane({
  receivingId,
}: {
  receivingId: number;
}) {
  const router = useRouter();
  const [activeSideTab, setActiveSideTab] = useState<StationDisplayNav | null>(null);
  const [logWarrantyOpen, setLogWarrantyOpen] = useState(false);
  const [warrantyDialogMounted, setWarrantyDialogMounted] = useState(false);
  const collapse = useAutoCollapse();

  const receivingQuery = useQuery(searchReceivingQuery(receivingId));
  const payload = receivingQuery.data;
  const receiving = payload?.receiving;
  const lines = payload?.lines ?? [];
  const events = payload?.events ?? [];

  const linkedOrderQuery = useQuery(
    searchReceivingLinkedOrderQuery(receivingId, payload),
  );
  const linkedOrder =
    linkedOrderQuery.data?.status === 'ok' ? linkedOrderQuery.data.order : null;

  const resolveStatus =
    (receivingQuery.isPending || receivingQuery.isLoading) && !payload
      ? 'loading'
      : receivingQuery.isError || !receiving
        ? 'notfound'
        : (linkedOrderQuery.isPending || linkedOrderQuery.isLoading) &&
            linkedOrderQuery.data === undefined
          ? 'loading'
          : 'ok';

  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    if (resolveStatus === 'loading') return;
    primaryPaint?.onPrimaryPainted();
  }, [resolveStatus, primaryPaint]);

  useEffect(() => {
    if (activeSideTab == null) return;
    preloadSearchReceivingLeafChunks();
  }, [activeSideTab]);

  useEffect(() => {
    const pending = resolveStatus === 'loading';
    setGlobalSearchPending(pending);
    return () => {
      clearGlobalSearchPending();
    };
  }, [resolveStatus]);

  const { photos: receivingPhotoRows, settled: photosSettled } = useReceivingPhotos(
    receivingId,
    { readOnly: true },
  );

  const header = useMemo(
    () => (receiving ? cartonHeaderIdentity(receiving, lines) : null),
    [receiving, lines],
  );

  const galleryPhotos = useMemo(
    () =>
      receivingPhotoRows.map((row) =>
        receivingPhotoToGalleryInput(row, {
          poRef: header?.poNumber ?? receiving?.zoho_purchaseorder_number ?? null,
        }),
      ),
    [receivingPhotoRows, header?.poNumber, receiving?.zoho_purchaseorder_number],
  );

  const orderNumber = String(linkedOrder?.order_id || '').trim();
  const tracking = String(linkedOrder?.shipping_tracking_number || '').trim();
  const orderRowId = Number(linkedOrder?.id ?? 0);
  const hasOrderRow = Number.isFinite(orderRowId) && orderRowId > 0;
  const hasLinkedOrder = Boolean(linkedOrder);

  const orderAnchor = useMemo(
    () => ({
      order: orderNumber || undefined,
      tracking: tracking || undefined,
    }),
    [orderNumber, tracking],
  );

  const timelineSerials = useMemo(
    () =>
      String(linkedOrder?.serial_number || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [linkedOrder?.serial_number],
  );

  const detailsLog = useMemo(
    () => (receiving ? cartonToReceivingDetailsLog(receiving) : null),
    [receiving],
  );
  const readiness = useMemo(
    () => (detailsLog ? deriveCartonReadiness(detailsLog, lines) : null),
    [detailsLog, lines],
  );

  const centre = useMemo(
    () =>
      receiving ? (
        <SearchReceivingCentre
          receiving={receiving}
          lines={lines}
          linkedOrder={linkedOrder}
          collapse={collapse}
        />
      ) : null,
    [receiving, lines, linkedOrder, collapse],
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
              {galleryPhotos.length === 0 ? (
                photosSettled ? (
                  <EmptyState
                    icon={<Camera className="h-6 w-6 text-text-faint" />}
                    title="No photos"
                    description="Nothing was captured for this carton at arrival or unboxing."
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
                  photos={galleryPhotos}
                  orderId={orderNumber || header?.poNumber || undefined}
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
          visible: true,
          content: hasLinkedOrder && linkedOrder ? (
            <div className="space-y-3 pb-4">
              <ShippingInformationSection shipped={linkedOrder} showSerialNumber />
              <OrderCommercialFacts order={linkedOrder} />
            </div>
          ) : detailsLog ? (
            <div className="space-y-3 pb-4">
              <InboundStatusFacts receiving={detailsLog} />
            </div>
          ) : null,
        },
        {
          id: 'timeline',
          label: 'Timeline',
          icon: History,
          content: hasLinkedOrder && linkedOrder ? (
            <div className="space-y-4 pb-4">
              <OrderPipelineSection shipped={linkedOrder} />
              {hasOrderRow ? (
                <OrderTimelineSection orderId={orderRowId} flush />
              ) : null}
            </div>
          ) : detailsLog && readiness ? (
            <div className="space-y-4 pb-4">
              <ReceivingCartonPipeline log={detailsLog} readiness={readiness} />
              <CartonActivityList events={events} />
            </div>
          ) : null,
        },
        {
          id: 'units',
          label: 'Units',
          icon: Barcode,
          visible: hasLinkedOrder && timelineSerials.length > 0,
          count: timelineSerials.length,
          content: (
            <div className="pb-4">
              <StationUnitJourneys serials={timelineSerials} />
            </div>
          ),
        },
        {
          id: 'ticket',
          label: 'Customer ticket',
          icon: Ticket,
          visible: hasLinkedOrder,
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
          visible: hasLinkedOrder,
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
          visible: hasLinkedOrder,
          content: linkedOrder ? (
            <div className="space-y-3 pb-4">
              <OrderWarrantySummary order={linkedOrder} />
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
      galleryPhotos,
      photosSettled,
      orderNumber,
      header?.poNumber,
      timelineSerials,
      orderAnchor,
      linkedOrder,
      hasOrderRow,
      orderRowId,
      hasLinkedOrder,
      detailsLog,
      readiness,
      events,
    ],
  );

  const displayIndexRows = useMemo(() => {
    if (hasLinkedOrder) {
      return buildSearchOrderDisplayIndexRows({
        hasOrderNumber: Boolean(orderNumber),
        photoCount: photosSettled ? galleryPhotos.length : null,
        photosSettled,
        hasWarrantyOrReturns: hasOrderRow,
        serialCount: timelineSerials.length,
      });
    }

    const rows = buildSearchOrderDisplayIndexRows({
      hasOrderNumber: false,
      photoCount: photosSettled ? galleryPhotos.length : null,
      photosSettled,
      hasWarrantyOrReturns: false,
      serialCount: 0,
    }).filter((row) => ['photos', 'status', 'timeline'].includes(row.id));

    const timeline = rows.find((row) => row.id === 'timeline');
    if (timeline) {
      timeline.subtitle =
        events.length > 0
          ? `${events.length} event${events.length === 1 ? '' : 's'}`
          : 'Carton activity';
    }
    const status = rows.find((row) => row.id === 'status');
    if (status) {
      status.subtitle = 'Inbound · QA · disposition';
    }
    return rows;
  }, [
    hasLinkedOrder,
    orderNumber,
    photosSettled,
    galleryPhotos.length,
    hasOrderRow,
    timelineSerials.length,
    events.length,
  ]);

  const handleSideTabChange = useCallback(
    (next: StationDisplayNav | null) => setActiveSideTab(next),
    [],
  );

  const handleViewPhotos = useCallback(() => {
    setActiveSideTab('photos');
  }, []);

  if (resolveStatus === 'loading') {
    return <div className="min-h-0 flex-1" aria-busy />;
  }

  if (resolveStatus === 'notfound' || !receiving) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center bg-surface-card">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Carton not found"
          description="No receiving carton matched this selection. Try another search hit."
        />
      </div>
    );
  }

  return (
    <>
      <EntityStationPane
        entityKey={receiving.id}
        stance="preview"
        identity={
          <SearchReceivingIdentity
            receiving={receiving}
            lines={lines}
            linkedOrder={linkedOrder}
            onOpenPhotosDisplay={handleViewPhotos}
          />
        }
        centre={centre}
        surface="card"
        centreFill
        onCentreScroll={collapse.onScroll}
        displayTabs={displayTabs}
        displayIndexRows={displayIndexRows}
        activeSideTab={activeSideTab}
        onSideTabChange={handleSideTabChange}
        storageKey="search-receiving-displays-push-width"
        ariaLabel="Search receiving displays"
        centerTestId="search-receiving-station-center"
        displaysTestId="search-receiving-displays-push"
        displaysResizeTestId="search-receiving-displays-push-resize"
      />

      {warrantyDialogMounted && linkedOrder ? (
        <WarrantyLogClaimDialog
          open={logWarrantyOpen}
          onClose={() => setLogWarrantyOpen(false)}
          onCreated={(id) => {
            router.push(`/support?mode=warranty&open=${id}`);
          }}
          initial={{
            orderId: orderRowId || undefined,
            serialNumber: timelineSerials[0],
            sku: linkedOrder.sku || undefined,
            productTitle: linkedOrder.product_title || undefined,
          }}
        />
      ) : null}
    </>
  );
}
