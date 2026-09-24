'use client';

/**
 * One-order paperwork record — the triage face the To-ship Labels walk opens.
 *
 * Understand-then-decide, on a desk: the carton identity header (order #,
 * tracking and listing as last-8 copy chips; ◁ leaves the walk) over a walk
 * bar (position · previous · skip / next · exit), then grouped cards in one
 * centred scroll ({@link TriageScrollLayout}):
 *
 *   Order                  — the item, platform, who picked and packed it and when.
 *   Paperwork              — label · slip · manuals inline ({@link PaperworkDocuments}):
 *                            view, upload, replace, delete, pair, download all.
 *   Parcel & shipping label — weight / L·W·H (remembered per SKU) → rate-shop → buy
 *                            ({@link OrderShippingPanel}).
 *
 * Escape reaches EXIT through the walk's record cursor (the desk's ambient
 * keyboard), which stands down while a field is focused — there Escape only
 * lets go of the field.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { OrderShippingPanel } from '@/components/outbound/labels/OrderShippingPanel';
import { ShippingEntityContextHeader } from '@/components/tech/shipping/ShippingEntityContextHeader';
import type { CompoundStageStepFacts } from '@/components/tables/compound/compound-row-model';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { OrderNumberIdentity, TrackingIdentity } from '@/components/ui/OrderIdentityChips';
import { useOrderChannel } from '@/hooks/useCatalog';
import type { ActiveStationOrder } from '@/hooks/station/types';
import { BuyerNoteBlock } from '@/design-system/components/RecordNoteSlot';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';
import { Button, Checkbox, IconButton } from '@/design-system/primitives';
import { LIFECYCLE, LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import { TRIAGE_PANEL_INNER_CORNER, triagePanelControl } from '@/design-system/tokens/triage-panel';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { orderReleaseGatesQuery } from '@/lib/queries/caged-orders-queries';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { resolveOrdersSlotValue } from '@/lib/tables/field-catalog/orders-resolve';
import { toast } from '@/lib/toast';
import type { ShippedOrder } from '@/types/orders';
import { cn } from '@/utils/_cn';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { stageFacts } from '../outbound-orders-ledger-editors';
import { initials, recordState } from '../outbound-orders-ledger-state';
import { PaperworkDocuments, type PaperworkTab } from './PaperworkDocuments';

/** One fact: sentence-case label beside its value. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className={cn(RECORD_LABEL_CLASS, 'pt-1 text-text-muted')}>{label}</dt>
      <dd className="min-w-0 text-role-data text-text-default">{children}</dd>
    </>
  );
}

/** Who did a floor step, and exactly when — or that nobody has yet. */
function StageStamp({
  doneVerb,
  facts,
  testId,
}: {
  doneVerb: string;
  facts: CompoundStageStepFacts | null;
  testId: string;
}) {
  const who = (facts?.who ?? '').trim() || null;
  if (!facts?.at) {
    return (
      <span data-testid={testId} className="text-text-muted">
        Not yet{who ? ` · assigned to ${who}` : ''}
      </span>
    );
  }
  return (
    <span data-testid={testId} className="flex min-w-0 items-center gap-2">
      <StaffAvatar staffId={facts.whoStaffId ?? null} name={who} avatarPhotoId={null} size="xs" colorRing alt={who ?? undefined} />
      <span className="min-w-0">
        <span className="font-semibold">{doneVerb}</span>
        {who ? <> by {who}</> : null}
        <span className="block font-mono text-role-caption tabular-nums text-text-muted">
          {facts.at}
          {facts.station ? ` · ${facts.station}` : ''}
        </span>
      </span>
    </span>
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
  const [docTab, setDocTab] = useState<PaperworkTab>('shipping_label');

  useEffect(() => {
    setExempt(record?.docsNotRequired === true);
  }, [record?.id, record?.docsNotRequired]);

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
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Could not save the exemption.');
      }
    },
    onSuccess: handleFactsChanged,
    onError: (error: Error) => toast.error(error.message),
  });

  const state = recordState(row);
  const spec = LIFECYCLE[state];
  const orderId = String(row.order_id ?? '').trim();
  const orderRef = orderId || `order-${row.id}`;
  const channel = useOrderChannel()(orderId, row.account_source);
  const pickFacts = stageFacts(resolveOrdersSlotValue(row, 'orders.picked'));
  const packFacts = stageFacts(resolveOrdersSlotValue(row, 'orders.packed'));
  const tracking = (record?.trackingNumber ?? String(row.shipping_tracking_number || '')).trim();
  const thumbUrl = String(row.catalog_image_url || '').trim() || null;
  const title = row.product_title || '';
  const labelState = record?.shippingLabelPurchased
    ? 'Bought'
    : record?.shippingLabelLinked
      ? 'Linked'
      : record
        ? 'None yet'
        : '…';

  // The carton identity header speaks the station's order shape.
  const activeOrder = useMemo<ActiveStationOrder>(
    () => ({
      id: row.id,
      orderId,
      productTitle: title,
      itemNumber: row.item_number ?? null,
      sku: row.sku ?? '',
      condition: row.condition ?? '',
      notes: '',
      tracking,
      serialNumbers: [],
      testDateTime: null,
      testedBy: null,
      quantity: Number(row.quantity) || 1,
      sourceType: 'order',
    }),
    [row.id, orderId, title, row.item_number, row.sku, row.condition, tracking, row.quantity],
  );

  const header = (
    <div className="border-b border-border-hairline bg-surface-card">
      <ShippingEntityContextHeader activeOrder={activeOrder} onExitToList={onExit} />
      <div className="flex items-center gap-2 border-t border-border-hairline px-4 py-2">
        <span className="flex items-center gap-2 text-role-caption text-text-muted">
          <span className={cn('h-2 w-2 shrink-0', LIFECYCLE_CLASSES[state].dot)} aria-hidden />
          <span className="font-semibold text-text-default">{spec.label}</span>
          <span aria-hidden>·</span>
          Labels <span className="tabular-nums text-text-default">{index} of {total}</span>
        </span>
        <span className="min-w-0 flex-1" />
        <IconButton
          size="lg"
          className={TRIAGE_PANEL_INNER_CORNER}
          ariaLabel="Previous order"
          title="Previous order (K)"
          data-testid="paperwork-prev"
          disabled={!onPrev}
          icon={<ChevronLeft className="h-4 w-4" />}
          onClick={() => onPrev?.()}
        />
        <Button
          size="md"
          className={triagePanelControl()}
          iconRight={<ChevronRight />}
          data-testid="paperwork-next"
          onClick={onAdvance}
        >
          {last ? 'Finish' : 'Skip / Next'}
        </Button>
        <IconButton
          size="lg"
          className={TRIAGE_PANEL_INNER_CORNER}
          ariaLabel="Exit Labels — back to the table"
          title="Exit (Esc)"
          aria-keyshortcuts="Escape"
          data-testid="paperwork-exit"
          icon={<X className="h-4 w-4" />}
          onClick={onExit}
        />
      </div>
    </div>
  );

  const orderSection = (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <span className={cn('relative h-20 w-20 shrink-0 overflow-hidden border border-border-soft bg-surface-sunken', TRIAGE_PANEL_INNER_CORNER)}>
          {thumbUrl ? (
            <Image src={thumbUrl} alt="" fill unoptimized sizes="80px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-mono text-role-title font-black text-text-muted" aria-hidden>
              {initials(title)}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="line-clamp-3 text-role-body font-semibold text-text-default">{title || '—'}</p>
          <p className="text-role-caption text-text-muted">
            SKU <span className="font-mono font-semibold text-text-default">{row.sku || '—'}</span>
            {row.item_number ? (
              <>
                {' · '}Item <span className="font-mono font-semibold text-text-default">{row.item_number}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-3">
        <Fact label="Platform">
          <span className="inline-flex items-center gap-1.5">
            <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />
            {channel.label || '—'}
            {channel.connectionName ? <span className="text-text-muted">· {channel.connectionName}</span> : null}
          </span>
        </Fact>
        <Fact label="Order #">
          <span data-testid="paperwork-order-chip">
            <OrderNumberIdentity
              orderId={orderId || String(row.id)}
              platformLabel={channel.label || null}
              openHref={marketplaceOrderUrl(orderId, row.account_source)}
            />
          </span>
        </Fact>
        <Fact label="Tracking">
          <span data-testid="paperwork-tracking-chip">
            {tracking ? (
              <TrackingIdentity tracking={tracking} />
            ) : (
              <span className="text-text-warning">Not attached</span>
            )}
          </span>
        </Fact>
        <Fact label="Picked">
          <StageStamp doneVerb="Picked" facts={pickFacts} testId="paperwork-stamp-pick" />
        </Fact>
        <Fact label="Packed">
          <StageStamp doneVerb="Packed" facts={packFacts} testId="paperwork-stamp-pack" />
        </Fact>
        <Fact label="Shipping label">
          <span className={labelState === 'None yet' ? 'text-text-warning' : undefined}>{labelState}</span>
        </Fact>
      </dl>
    </div>
  );

  const paperworkSection = (
    <div className="flex flex-col gap-4">
      <PaperworkDocuments
        orderId={row.id}
        orderRef={orderRef}
        tab={docTab}
        onTabChange={setDocTab}
        onChanged={handleFactsChanged}
      />
      <label className="flex items-center gap-2 border-t border-border-hairline pt-3 text-role-data text-text-default">
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
    </div>
  );

  return (
    <section
      data-testid="paperwork-editor"
      aria-label={`Labels, order ${orderId || row.id}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas text-text-default"
    >
      <TriageScrollLayout
        className="min-h-0 min-w-0 flex-1"
        // One fixed column — parcel, ShipStation rates and Buy stay put from
        // order to order, whatever the window or fullscreen does.
        measure="fixed"
        header={header}
        banner={<BuyerNoteBlock note={String(row.buyer_note ?? '').trim() || null} />}
        sections={[
          { id: 'paperwork-order', label: 'Order', children: orderSection },
          { id: 'paperwork-documents', label: 'Paperwork', children: paperworkSection },
          {
            id: 'paperwork-shipping',
            label: 'Parcel & shipping label',
            children: (
              <OrderShippingPanel
                key={row.id}
                orderId={row.id}
                orderRef={orderRef}
                onFactsChanged={handleFactsChanged}
                onLabelPurchased={onAdvance}
                testIdPrefix="paperwork"
                showDocuments={false}
              />
            ),
          },
        ]}
      />
    </section>
  );
}
