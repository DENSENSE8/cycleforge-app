'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConditionGradeChip, SkuScanRefChip, getLast8 } from '@/components/ui/CopyChip';
import { PoLineMetaGrid } from '@/components/receiving/workspace/PoLineMetaGrid';
import { ProgressBadge } from '@/components/receiving/workspace/PoLineBadges';
import { WorkspaceCard } from '@/design-system/components';
import { StationConditionEditor } from '@/components/tech/StationConditionEditor';
import { stripConditionPrefix } from '@/utils/upnext-helpers';
import { initSkuSerialGroups, type SkuSerialGroup } from '@/lib/tech/sku-serial-groups';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import { cn } from '@/utils/_cn';

/**
 * Ship-tab pairing surface — PoLineRow nested-grid anatomy (wrap title above
 * boxed qty | SKU | condition | serial preview). Empty serial slots show while
 * waiting on the next scan. No Units Displays host on this stand.
 */
export function ShippingSkuSerialRows({
  activeOrder,
  onChangeCondition,
  isMutatingCondition,
  isShipped,
}: {
  activeOrder: ActiveStationOrder;
  onChangeCondition?: (next: string) => void | Promise<void>;
  isMutatingCondition?: boolean;
  isShipped?: boolean;
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

  const showConditionEditor = onChangeCondition != null;

  return (
    <div className="space-y-4">
      <WorkspaceCard bodyClassName="space-y-2 p-4">
        {groups.length === 0 ? (
          <EmptyPairingHint sku={activeOrder.sku} />
        ) : (
          groups.map((group) => (
            <SkuSerialGroupBlock
              key={group.sku}
              group={group}
              quantity={quantity}
              condition={activeOrder.condition}
              productTitle={productTitle}
              lastAddedSerial={lastAddedSerial}
            />
          ))
        )}
      </WorkspaceCard>

      {showConditionEditor ? (
        <WorkspaceCard label="Condition" bodyClassName="px-5 py-4">
          <StationConditionEditor
            condition={activeOrder.condition}
            onChange={(next) => void onChangeCondition(next)}
            isLocked={Boolean(isShipped) || Boolean(isMutatingCondition)}
            collapsible={false}
          />
        </WorkspaceCard>
      ) : null}
    </div>
  );
}

function EmptyPairingHint({ sku }: { sku: string }) {
  const displaySku = String(sku || '').trim();
  return (
    <div className="rounded-none border border-dashed border-border-soft bg-surface-sunken/40 px-4 py-6 text-center">
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
  // For multi-SKU pulls, only pad empty slots on the primary (first/only) group
  // when the session still needs more unit captures overall — caller passes order qty.
  const showEmpty = serials.length === 0 ? 1 : emptySlots > 0 && serials.length < quantity ? emptySlots : 0;
  const title =
    productTitle ||
    (group.sku && group.sku !== '—' ? group.sku : 'Untitled item');
  const previewSerials = serials.slice(-2);
  const emptyHint = showEmpty > 0 ? Math.min(showEmpty, 3) : 0;

  return (
    <div className="relative min-w-0 overflow-hidden rounded-none border-0 border-b border-border-soft bg-surface-card">
      {/* PoLineRow nested-grid contract: wrap title above boxed meta. */}
      <div className="flex min-w-0 flex-col">
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
  );
}

