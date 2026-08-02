'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { ConditionGradeChip, SerialChip, SkuScanRefChip, getLast8 } from '@/components/ui/CopyChip';
import { PoLineMetaGrid } from '@/components/receiving/workspace/PoLineMetaGrid';
import { ProgressBadge } from '@/components/receiving/workspace/PoLineBadges';
import { META_COL } from '@/components/ui/RowMetaColumns';
import { WorkspaceCard } from '@/design-system/components';
import { StationConditionEditor } from '@/components/tech/StationConditionEditor';
import { stripConditionPrefix } from '@/utils/upnext-helpers';
import { initSkuSerialGroups, type SkuSerialGroup } from '@/lib/tech/sku-serial-groups';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';

/**
 * Ship-tab pairing surface — PoLineRow anatomy (title above qty | SKU |
 * condition | serial) reused from unbox. Empty serial slots show while waiting
 * on the next scan; new serials slide in.
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
    <div className="rounded-xl border border-dashed border-border-soft bg-surface-sunken/40 px-4 py-6 text-center">
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

  return (
    <div className="rounded-xl border border-border-soft bg-surface-card px-3 py-2.5">
      {/* PoLineRow contract: title above meta chips. */}
      <p
        className="min-w-0 truncate text-role-caption font-semibold text-text-default"
        title={title}
      >
        {title}
      </p>
      <PoLineMetaGrid
        indent={META_COL.indentWide}
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
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <AnimatePresence initial={false}>
              {serials.map((sn) => {
                const isNew = sn === lastAddedSerial;
                return (
                  <motion.span
                    key={sn}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={framerTransition.stationSerialRow}
                    className={isNew ? 'ring-2 ring-emerald-400 rounded-md' : undefined}
                  >
                    <SerialChip value={sn} dense />
                  </motion.span>
                );
              })}
            </AnimatePresence>
            {showEmpty > 0
              ? Array.from({ length: Math.min(showEmpty, 3) }, (_, i) => (
                  <span
                    key={`empty-${i}`}
                    className="inline-flex h-6 min-w-[3.5rem] items-center justify-center rounded-md border border-dashed border-border-soft px-1.5 text-role-micro text-text-faint"
                  >
                    —
                  </span>
                ))
              : null}
          </div>
        }
      />
    </div>
  );
}
