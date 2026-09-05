'use client';

/**
 * One-order paperwork face — manuals (SKU grain) + shipping (order grain).
 *
 * Composes {@link OrderShippingPanel} and {@link SkuManualsPanel}. Pairing
 * does not live here (R-FLOW-7).
 *
 * ## Everything the operator drives lives at the foot
 *
 * One floating {@link StickyActionBar}: walk position as the caption, Back as
 * the secondary, Finish / Skip · Next as the stretched CTA. No top button row
 * — `TriageScrollLayout`'s contract and the Order intake stage form
 * (`OrderIntakeForm`) both refuse one, and a band above the identity ring was
 * spending a full-width row to repaint the host's own walk arrows.
 *
 * ## Two sections do not earn a jump rail
 *
 * `knobs` is off. {@link TriageScrollLayout} passes it only for a fixed-width
 * pane worked repeatedly, where the rail doubles as a position readout;
 * Manuals + Shipping label is a scroll that ends in one flick, and the rail
 * was reserving a right-hand column the form could not then use — which is
 * what read as dead padding beside the cards. Grouping is the scan.
 *
 * Exit is the desk's: the Labels toggle is this walk's on/off and Esc is wired
 * by the host, so the identity ring takes no `onExitToList` here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight } from '@/components/Icons';
import { StationContextBar } from '@/components/station/entity-context';
import { ShippingEntityContextHeader } from '@/components/tech/shipping/ShippingEntityContextHeader';
import { OrderShippingPanel } from '@/components/outbound/labels/OrderShippingPanel';
import { SkuManualsPanel } from './SkuManualsPanel';
import type { ActiveStationOrder } from '@/hooks/station/types';
import { StickyActionBar } from '@/design-system/components/StickyActionBar';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';
import { Checkbox } from '@/design-system/primitives';
import { orderReleaseGatesQuery } from '@/lib/queries/caged-orders-queries';
import { toast } from '@/lib/toast';
import type { ShippedOrder } from '@/types/orders';

export function PaperworkEditor({
  row,
  index,
  total,
  onAdvance,
  onPrev,
  prevDisabled,
  onFactsChanged,
}: {
  row: ShippedOrder;
  index: number;
  total: number;
  onAdvance: () => void;
  onPrev: () => void;
  prevDisabled: boolean;
  onFactsChanged: () => void;
}) {
  const gatesQuery = useQuery(orderReleaseGatesQuery(row.id));
  const record = gatesQuery.data ?? null;
  const [exempt, setExempt] = useState(false);

  useEffect(() => {
    setExempt(record?.docsNotRequired === true);
  }, [record?.id, record?.docsNotRequired]);

  const activeOrder = useMemo<ActiveStationOrder>(
    () => ({
      id: row.id,
      orderId: row.order_id ?? '',
      productTitle: row.product_title ?? '',
      itemNumber: row.item_number ?? null,
      sku: row.sku ?? '',
      condition: row.condition ?? '',
      notes: row.notes ?? '',
      tracking: String(row.shipping_tracking_number || '').trim(),
      serialNumbers: [],
      testDateTime: null,
      testedBy: null,
      quantity: Number(row.quantity) || 1,
      sourceType: 'order',
    }),
    [row],
  );

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

  return (
    <TriageScrollLayout
      data-testid="paperwork-editor"
      // Mounted through StationContextBar `placement="flow"` — the same
      // recipe as Unbox (`LineEditPanel`) and Scan-out (`ScanOutActivePanel`,
      // which wraps this very adapter). That is what supplies
      // `stationIdentityPanelClass` (`rounded-none border-0`), so the band is
      // coplanar and square instead of inheriting the host's corner radius,
      // and the bar's own `STATION_CHROME_SEAM_HAIRLINE` is the bottom seam —
      // never a wrapper `border-b`, which lands 1px off it.
      header={
        <StationContextBar
          placement="flow"
          identity={<ShippingEntityContextHeader activeOrder={activeOrder} />}
        />
      }
      footer={
        <StickyActionBar
          floating
          leading={
            <span className="tabular-nums" data-testid="paperwork-position">
              {index} of {total}
            </span>
          }
          secondary={{
            label: 'Back',
            onClick: onPrev,
            disabled: prevDisabled,
            icon: <ChevronLeft className="h-4 w-4" aria-hidden />,
          }}
          primary={{
            label: last ? 'Finish' : 'Skip / Next',
            onClick: onAdvance,
            icon: last ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ),
            testId: 'paperwork-next',
          }}
        />
      }
      sections={[
        {
          id: 'manuals',
          label: 'Manuals',
          children: (
            <div className="stack-section">
              <SkuManualsPanel itemNumber={row.item_number} sku={row.sku} />
              <label className="flex items-center gap-2 text-role-caption text-text-default">
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
          ),
        },
        {
          id: 'shipping',
          label: 'Shipping label',
          children: (
            <OrderShippingPanel
              key={row.id}
              orderId={row.id}
              orderRef={row.order_id || `order-${row.id}`}
              onFactsChanged={handleFactsChanged}
              onLabelPurchased={onAdvance}
              testIdPrefix="paperwork"
            />
          ),
        },
      ]}
    />
  );
}
