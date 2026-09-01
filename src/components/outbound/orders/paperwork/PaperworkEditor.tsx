'use client';

/**
 * One-order paperwork face — manuals (SKU grain) + shipping (order grain).
 *
 * Composes {@link OrderShippingPanel} and {@link SkuManualsPanel}. Pairing
 * does not live here (R-FLOW-7). Escape / header ◁ exit through `onExit`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight } from '@/components/Icons';
import { ShippingEntityContextHeader } from '@/components/tech/shipping/ShippingEntityContextHeader';
import { OrderShippingPanel } from '@/components/outbound/labels/OrderShippingPanel';
import { SkuManualsPanel } from './SkuManualsPanel';
import type { ActiveStationOrder } from '@/hooks/station/types';
import { TriageScrollLayout } from '@/design-system/components/TriageScrollLayout';
import { Button, Checkbox } from '@/design-system/primitives';
import { orderReleaseGatesQuery } from '@/lib/queries/caged-orders-queries';
import { toast } from '@/lib/toast';
import type { ShippedOrder } from '@/types/orders';

export function PaperworkEditor({
  row,
  index,
  total,
  onAdvance,
  onExit,
  onFactsChanged,
}: {
  row: ShippedOrder;
  index: number;
  total: number;
  onAdvance: () => void;
  onExit: () => void;
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        el.blur();
        return;
      }
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

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
      knobs
      header={
        <div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border-hairline bg-surface-card px-4 py-1.5">
            <p className="min-w-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
              Labels · {index} of {total} ·{' '}
              <span className="font-mono normal-case tracking-normal text-text-default">
                {row.order_id}
              </span>
            </p>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                iconRight={<ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                onClick={onAdvance}
                data-testid="paperwork-next"
              >
                {last ? 'Finish' : 'Skip / Next'}
              </Button>
            </span>
          </div>
          <div className="border-b border-border-hairline">
            <ShippingEntityContextHeader
              activeOrder={activeOrder}
              onExitToList={onExit}
            />
          </div>
        </div>
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
