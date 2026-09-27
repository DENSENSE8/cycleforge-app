'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConditionGradeChip, SkuScanRefChip, getLast8 } from '@/components/ui/CopyChip';
import { PoLineMetaGrid } from '@/components/receiving/workspace/PoLineMetaGrid';
import { PoLineHeaderThumb } from '@/components/receiving/workspace/PoLineHeaderThumb';
import { PO_LINE_HEADER_FACE } from '@/components/receiving/workspace/station-scan-face';
import { ProgressBadge } from '@/components/receiving/workspace/PoLineBadges';
import { stripConditionPrefix } from '@/utils/upnext-helpers';
import { initSkuSerialGroups, type SkuSerialGroup } from '@/lib/tech/sku-serial-groups';
import type { ActiveStationOrder } from '@/hooks/useDeskPickController';
import { cn } from '@/utils/_cn';

/**
 * Ship-tab pairing surface — flush PoLineRow nested-grid on the sunken floor
 * (size-20 thumb | title top + meta bottom). No WorkspaceCard islands.
 * Condition editing lives on Displays (ActiveOrderWorkspace), not a second card.
 */
export function ShippingSkuSerialRows({
  activeOrder,
}: {
  activeOrder: ActiveStationOrder;
}) {
  const quantity = Math.max(1, Number(activeOrder.quantity) || 1);
  const productTitle =
    stripConditionPrefix(activeOrder.productTitle, activeOrder.condition).trim() ||
    String(activeOrder.sku || '').trim() ||
    'Untitled order';

  const groups = useMemo(() => {
    if (activeOrder.skuSerialGroups && activeOrder.skuSerialGroups.length > 0) {
      return activeOrder.skuSerialGroups;
    }
    return initSkuSerialGroups(activeOrder.sku, activeOrder.serialNumbers);
  }, [activeOrder.skuSerialGroups, activeOrder.sku, activeOrder.serialNumbers]);

  const [lastAddedSerial, setLastAddedSerial] = useState<string | null>(null);
  const prevTrackingRef = useRef(activeOrder.tracking);
  const prevSerialCountRef = useRef(activeOrder.serialNumbers.length);

  useEffect(() => {
    if (prevTrackingRef.current !== activeOrder.tracking) {
      prevTrackingRef.current = activeOrder.tracking;
      prevSerialCountRef.current = activeOrder.serialNumbers.length;
      setLastAddedSerial(null);
      return;
    }
    const prev = prevSerialCountRef.current;
    const current = activeOrder.serialNumbers.length;
    if (current > prev) {
      const newSerial = activeOrder.serialNumbers[current - 1];
      setLastAddedSerial(newSerial);
      const timer = setTimeout(() => setLastAddedSerial(null), 1800);
      prevSerialCountRef.current = current;
      return () => clearTimeout(timer);
    }
    prevSerialCountRef.current = current;
  }, [activeOrder.serialNumbers, activeOrder.tracking]);

  if (groups.length === 0) {
    return <EmptyPairingHint sku={activeOrder.sku} />;
  }

  return (
    <div className="min-w-0" data-testid="shipping-sku-serial-rows">
      {groups.map((group) => (
        <SkuSerialGroupBlock
          key={group.sku}
          group={group}
          quantity={quantity}
          condition={activeOrder.condition}
          productTitle={productTitle}
          lastAddedSerial={lastAddedSerial}
        />
      ))}
    </div>
  );
}

function EmptyPairingHint({ sku }: { sku: string }) {
  const displaySku = String(sku || '').trim();
  return (
    <div
      className="border-b border-border-soft bg-surface-card px-3 py-3 text-center"
      data-testid="shipping-sku-serial-rows"
    >
      <p className="text-role-caption font-semibold text-text-muted">
        {displaySku && !/^n\/a$/i.test(displaySku)
          ? `Ready — pair serials to ${displaySku}`
          : 'Scan a storage SKU code (SKU:tag) or serial to start pairing'}
      </p>
    </div>
  );
}

function SkuSerialGroupBlock({
  group,
  quantity,
  condition,
  productTitle,
  lastAddedSerial,
}: {
  group: SkuSerialGroup;
  quantity: number;
  condition: string;
  productTitle: string;
  lastAddedSerial: string | null;
}) {
  const serials = group.serials;
  const emptySlots = Math.max(0, quantity - serials.length);
  const showEmpty = serials.length === 0 ? 1 : emptySlots > 0 && serials.length < quantity ? emptySlots : 0;
  const title =
    productTitle ||
    (group.sku && group.sku !== '—' ? group.sku : 'Untitled item');
  const previewSerials = serials.slice(-2);
  const emptyHint = showEmpty > 0 ? Math.min(showEmpty, 3) : 0;

  return (
    <div className="relative min-w-0 overflow-hidden rounded-none border-0 border-b border-border-soft bg-surface-card">
      <div
        className={cn(
          'grid min-w-0',
          PO_LINE_HEADER_FACE.minH,
          PO_LINE_HEADER_FACE.thumbGrid,
        )}
      >
        <PoLineHeaderThumb />
        <div className="flex min-h-0 min-w-0 flex-col justify-between self-stretch">
          <p className="min-w-0 px-2 py-1 text-role-caption font-semibold leading-tight text-text-default">
            {title}
          </p>
          <PoLineMetaGrid
            qty={<ProgressBadge received={serials.length} expected={quantity} />}
            sku={
              group.sku && group.sku !== '—' ? (
                <SkuScanRefChip value={group.sku} display={getLast8(group.sku)} dense />
              ) : undefined
            }
            condition={
              condition ? (
                <ConditionGradeChip grade={condition} dense />
              ) : (
                <span className="text-text-faint/40">—</span>
              )
            }
            serial={
              <div className="flex min-w-0 w-full items-center gap-1 overflow-hidden">
                <span
                  className={cn(
                    'min-w-0 truncate tabular-nums text-text-muted normal-case tracking-normal',
                    lastAddedSerial ? 'ring-1 ring-inset ring-emerald-400 px-1' : undefined,
                  )}
                >
                  {previewSerials.length > 0
                    ? previewSerials.map((sn) => getLast8(sn)).join(', ')
                    : '—'}
                </span>
                {emptyHint > 0
                  ? Array.from({ length: emptyHint }, (_, i) => (
                      <span
                        key={`empty-${i}`}
                        className="inline-flex h-5 shrink-0 items-center justify-center border border-dashed border-border-soft px-1.5 text-role-micro text-text-faint"
                      >
                        —
                      </span>
                    ))
                  : null}
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
