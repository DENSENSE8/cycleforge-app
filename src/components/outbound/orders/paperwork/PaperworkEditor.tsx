'use client';

/**
 * One-order paperwork face — the industrial record the To-ship ledger opens.
 *
 * A flush bar of segments (walk: prev · next/finish · exit; paperwork: label ·
 * slip · manuals) over two columns: the evidence-column fact list for the
 * order (identity, platform, listing, tracking, label, manuals + the G2
 * exemption) and the shared {@link OrderShippingPanel} (parcel, rate-shop,
 * document tray). Label / slip open the order's documents in the one
 * `DocumentSlideOver` (print lives there); manuals open theirs without print
 * — pack prints inserts. Pairing does not live here (R-FLOW-7). The EXIT
 * segment leaves through `onExit`; Escape reaches it through the walk's
 * record cursor (the desk's ambient keyboard), which stands down while a
 * field is focused — there Escape only lets go of the field.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, FileText, X } from '@/components/Icons';
import { OrderShippingPanel } from '@/components/outbound/labels/OrderShippingPanel';
import { resolveShippingListingLinks } from '@/components/tech/shipping/shipping-listing-links';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { useOrderChannel } from '@/hooks/useCatalog';
import {
  DESK_BAR_SEGMENT_CLASS,
  deskBarSegmentTone,
} from '@/design-system/components/DeskActionSlot';
import {
  DocumentSlideOver,
  type DocumentSlideItem,
} from '@/design-system/components/DocumentSlideOver';
import { BuyerNoteBlock } from '@/design-system/components/RecordNoteSlot';
import { Checkbox } from '@/design-system/primitives';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  recordStateCodeClass,
} from '@/design-system/tokens/industrial-record';
import { LIFECYCLE, LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  outboundDocumentContentSrc,
  outboundDocumentMimeHint,
} from '@/lib/documents/outbound-document-display';
import type { OutboundDocumentsResponse } from '@/lib/documents/types';
import { orderReleaseGatesQuery } from '@/lib/queries/caged-orders-queries';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { toast } from '@/lib/toast';
import type { ShippedOrder } from '@/types/orders';
import { getTrackingUrl } from '@/utils/order-links';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { cn } from '@/utils/_cn';
import { LedgerListingLink } from '../outbound-orders-ledger-editors';
import { LEDGER_HIT_CLASS, LEDGER_NESTED_HIT_CLASS } from '../outbound-orders-ledger-geometry';
import { initials, recordState } from '../outbound-orders-ledger-state';
import { SkuManualsList, useSkuManuals } from './SkuManualsPanel';

/** Which previewer is up: the order's documents (printable) or the SKU manuals. */
type Viewer =
  | { kind: 'documents'; activeId: string }
  | { kind: 'manuals'; activeId: string | undefined };

/** One fact row: mono label over (or beside) its value, ruled underneath. */
function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 border-b border-mode-edge', wide ? 'flex-col py-2' : 'items-center')}>
      <dt className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 text-mode-muted', !wide && 'py-2')}>{label}</dt>
      <dd className="min-w-0 flex-1 text-role-data text-mode-ink">{children}</dd>
    </div>
  );
}

export function PaperworkEditor({
  row,
  index,
  total,
  onAdvance,
  onPrev,
  onExit,
  onFactsChanged,
}: {
  row: ShippedOrder;
  index: number;
  total: number;
  onAdvance: () => void;
  /** Step back one order; absent at the head of the walk. */
  onPrev?: () => void;
  onExit: () => void;
  onFactsChanged: () => void;
}) {
  const gatesQuery = useQuery(orderReleaseGatesQuery(row.id));
  const record = gatesQuery.data ?? null;
  const [exempt, setExempt] = useState(false);

  useEffect(() => {
    setExempt(record?.docsNotRequired === true);
  }, [record?.id, record?.docsNotRequired]);

  // The same read (key + endpoint) the shipping panel's document tray makes,
  // so the LABEL / SLIP segments and the tray share one cache entry.
  const documentsQuery = useQuery({
    queryKey: ['order-documents', row.id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${row.id}/documents`);
      if (!res.ok) throw new Error('Failed to fetch documents');
      return (await res.json()) as OutboundDocumentsResponse;
    },
    enabled: Number.isFinite(row.id) && row.id > 0,
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.packingSlipIngest?.status === 'processing' ? 2_000 : false,
  });
  const documents = documentsQuery.data?.documents ?? [];
  const labels = documents.filter((d) => d.documentType === 'shipping_label');
  const slips = documents.filter((d) => d.documentType === 'packing_slip');
  const slipIngest = documentsQuery.data?.packingSlipIngest ?? null;
  const documentItems: DocumentSlideItem[] = [
    {
      id: 'shipping_label',
      title: 'Shipping Label',
      src: outboundDocumentContentSrc(labels[0]),
      mimeHint: outboundDocumentMimeHint(labels[0]),
      count: labels.length > 0 ? labels.length : undefined,
      loading: documentsQuery.isLoading,
      emptyHint: 'Buy or fetch one from the Shipping label column',
    },
    {
      id: 'packing_slip',
      title: 'Packing Slip',
      src: outboundDocumentContentSrc(slips[0]),
      mimeHint: outboundDocumentMimeHint(slips[0]),
      count: slips.length > 0 ? slips.length : undefined,
      loading: documentsQuery.isLoading,
      emptyHint: 'The ECWID import worker is acquiring this packing slip',
    },
  ];

  const manuals = useSkuManuals(row.item_number, row.sku);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const last = index >= total;
  const handleFactsChanged = useCallback(() => {
    void gatesQuery.refetch();
    onFactsChanged();
  }, [gatesQuery, onFactsChanged]);

  const exemptMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const res = await fetch(`/api/orders/${row.id}/cage-release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'docs-not-required', value }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Could not save the exemption.');
      }
    },
    onSuccess: () => {
      handleFactsChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const state = recordState(row);
  const spec = LIFECYCLE[state];
  const orderId = String(row.order_id ?? '').trim();
  const channel = useOrderChannel()(orderId, row.account_source);
  const listing = resolveShippingListingLinks({ itemNumber: row.item_number ?? null, sku: row.sku ?? '' });
  const tracking = (record?.trackingNumber ?? String(row.shipping_tracking_number || '')).trim();
  const thumbUrl = String(row.catalog_image_url || '').trim() || null;
  const title = row.product_title || '';
  const labelState = record?.shippingLabelPurchased
    ? 'Bought'
    : record?.shippingLabelLinked
      ? 'Linked'
      : record
        ? 'None'
        : '…';

  const segment = cn(DESK_BAR_SEGMENT_CLASS, 'border-l border-mode-edge');

  return (
    <section
      data-testid="paperwork-editor"
      aria-label={`Labels, order ${orderId || row.id}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-mode-canvas text-mode-ink"
    >
      <div className="box-content flex min-h-mode-hit shrink-0 items-stretch border-b-2 border-mode-ink bg-mode-bar">
        <span className={cn(RECORD_LABEL_CLASS, 'flex items-center gap-2 px-4 text-mode-muted')}>
          Labels
          <span className="tabular-nums text-mode-ink">
            {index} / {total}
          </span>
        </span>
        <span className="min-w-0 flex-1" />
        <button
          type="button"
          data-testid="paperwork-print-label"
          aria-label="Shipping label — preview and print"
          disabled={labels.length === 0}
          title={labels.length === 0 ? 'No shipping label attached yet' : undefined}
          className={cn(segment, deskBarSegmentTone(false))}
          onClick={() => setViewer({ kind: 'documents', activeId: 'shipping_label' })}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Label
        </button>
        <button
          type="button"
          data-testid="paperwork-print-slip"
          aria-label="Packing slip — preview and print"
          disabled={slips.length === 0}
          title={slips.length === 0 ? (slipIngest?.label ?? 'No packing slip attached yet') : undefined}
          className={cn(segment, deskBarSegmentTone(false))}
          onClick={() => setViewer({ kind: 'documents', activeId: 'packing_slip' })}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Slip
        </button>
        <button
          type="button"
          data-testid="paperwork-manuals"
          aria-label="Manuals — preview"
          disabled={manuals.slideItems.length === 0}
          className={cn(segment, deskBarSegmentTone(false))}
          onClick={() => setViewer({ kind: 'manuals', activeId: manuals.slideItems[0]?.id })}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Manuals
          {manuals.slideItems.length > 0 ? (
            <span className="tabular-nums">{manuals.slideItems.length}</span>
          ) : null}
        </button>
        <button
          type="button"
          data-testid="paperwork-prev"
          aria-label="Previous order"
          disabled={!onPrev}
          className={cn(segment, 'w-11 justify-center px-0', deskBarSegmentTone(false))}
          onClick={() => onPrev?.()}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          data-testid="paperwork-next"
          className={cn(segment, deskBarSegmentTone(true))}
          onClick={onAdvance}
        >
          {last ? 'Finish' : 'Skip / Next'}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          data-testid="paperwork-exit"
          aria-label="Exit Labels — back to the table"
          aria-keyshortcuts="Escape"
          className={cn(segment, 'w-11 justify-center px-0', deskBarSegmentTone(false))}
          onClick={onExit}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* The record: identity, then the facts paperwork is decided on. */}
        <div className="flex w-[26rem] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-mode-ink bg-mode-bar">
          <div className="border-b-2 border-mode-ink px-4 pb-3 pt-3">
            <h2 className="select-all break-all font-mono text-role-display font-black tracking-tight">
              {orderId || `#${row.id}`}
            </h2>
          </div>
          <div
            className={cn(
              'flex items-center gap-2 border-b border-mode-ink px-4',
              LEDGER_HIT_CLASS,
              state === 'outOfStock' && LIFECYCLE_CLASSES.outOfStock.tint,
            )}
          >
            <span className={cn('h-2 w-2 shrink-0', LIFECYCLE_CLASSES[state].dot)} aria-hidden />
            <span className={cn(RECORD_LABEL_CLASS, recordStateCodeClass(state))}>
              {spec.code} · {spec.label}
            </span>
          </div>
          <BuyerNoteBlock note={String(row.buyer_note ?? '').trim() || null} />

          <div className="flex gap-3 border-b border-mode-ink bg-mode-panel p-3">
            <span className="relative h-20 w-20 shrink-0 overflow-hidden border border-mode-rule bg-mode-well">
              {thumbUrl ? (
                <Image src={thumbUrl} alt="" fill unoptimized sizes="80px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-mono text-role-title font-black text-mode-muted" aria-hidden>
                  {initials(title)}
                </span>
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="line-clamp-3 text-role-body font-bold">{title || '—'}</p>
              <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
                SKU <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{row.sku || '—'}</span>
              </p>
              {row.item_number ? (
                <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
                  ITEM <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{row.item_number}</span>
                </p>
              ) : null}
            </div>
          </div>

          <dl className="flex flex-col px-4">
            <Fact label="Order #">
              <span className={cn(RECORD_ID_CLASS, LEDGER_NESTED_HIT_CLASS, 'flex items-center')}>
                <OrderNumberMenuChip
                  value={orderId || String(row.id)}
                  platformLabel={channel.meta.value ? channel.meta.label : null}
                  openHref={marketplaceOrderUrl(orderId, row.account_source)}
                  plain
                  dense
                />
              </span>
            </Fact>
            <Fact label="Platform">
              <span className="inline-flex items-center gap-1.5">
                <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />
                <span className={RECORD_LABEL_CLASS}>{channel.label || '—'}</span>
                {channel.connectionName ? (
                  <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>· {channel.connectionName}</span>
                ) : null}
              </span>
            </Fact>
            <Fact label="Listing">
              <span className="block h-8">
                <LedgerListingLink href={listing.listingUrl} itemNumber={listing.listingItemKey || null} face="value" />
              </span>
            </Fact>
            <Fact label="Tracking" wide>
              {tracking ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn(RECORD_ID_CLASS, 'min-w-0 select-all break-all')}>{tracking}</span>
                  <a
                    href={getTrackingUrl(tracking) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open tracking ${tracking} on the carrier site`}
                    className={cn(
                      'ml-auto inline-flex w-8 shrink-0 items-center justify-center text-mode-ink hover:bg-mode-hover',
                      LEDGER_HIT_CLASS,
                      focusRing('cell'),
                    )}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </span>
              ) : (
                <span className={cn(RECORD_ID_CLASS, 'text-mode-warn')}>NOT ATTACHED</span>
              )}
            </Fact>
            <Fact label="Label">
              <span className={cn(RECORD_LABEL_CLASS, labelState === 'None' ? 'text-mode-warn' : 'text-mode-ink')}>
                {labelState}
                {labels.length > 0 ? (
                  <span className="text-mode-muted"> · {labels.length} file{labels.length === 1 ? '' : 's'}</span>
                ) : null}
              </span>
            </Fact>
            <Fact label="Slip">
              <span className={cn(RECORD_LABEL_CLASS, slips.length > 0 ? 'text-mode-ink' : 'text-mode-muted')}>
                {slips.length > 0
                  ? `${slips.length} file${slips.length === 1 ? '' : 's'}`
                  : (slipIngest?.label ?? 'None')}
              </span>
            </Fact>
            <Fact label="Manuals" wide>
              <SkuManualsList
                state={manuals}
                onOpen={(activeId) => setViewer({ kind: 'manuals', activeId })}
              />
              <label className={cn('mt-1 flex items-center gap-2 text-role-caption text-mode-ink', LEDGER_HIT_CLASS)}>
                <Checkbox
                  checked={exempt}
                  disabled={exemptMutation.isPending}
                  onCheckedChange={(next) => {
                    const value = next === true;
                    setExempt(value);
                    exemptMutation.mutate(value);
                  }}
                  data-testid="paperwork-docs-not-required"
                />
                This order does not need manuals
              </label>
            </Fact>
          </dl>
        </div>

        {/* The work: parcel → rate-shop → buy, and the document tray. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-mode-panel">
          <div className={cn('flex shrink-0 items-center border-b border-mode-ink px-4', LEDGER_HIT_CLASS)}>
            <h3 className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Shipping label</h3>
          </div>
          <div className="p-4">
            <OrderShippingPanel
              key={row.id}
              orderId={row.id}
              orderRef={row.order_id || `order-${row.id}`}
              onFactsChanged={handleFactsChanged}
              onLabelPurchased={onAdvance}
              testIdPrefix="paperwork"
            />
          </div>
        </div>
      </div>

      <DocumentSlideOver
        open={viewer?.kind === 'documents'}
        onClose={() => setViewer(null)}
        title="Order documents"
        items={documentItems}
        activeId={viewer?.kind === 'documents' ? viewer.activeId : undefined}
        onActiveIdChange={(activeId) => setViewer({ kind: 'documents', activeId })}
        storageKey="order-documents-preview-width"
        aria-label="Order documents preview"
      />
      <DocumentSlideOver
        open={viewer?.kind === 'manuals'}
        onClose={() => setViewer(null)}
        title="Manuals"
        items={manuals.slideItems}
        activeId={viewer?.kind === 'manuals' ? viewer.activeId : undefined}
        onActiveIdChange={(activeId) => setViewer({ kind: 'manuals', activeId })}
        showPrint={false}
        storageKey="paperwork-manuals-slide-over-width"
        aria-label="SKU manuals preview"
      />
    </section>
  );
}
