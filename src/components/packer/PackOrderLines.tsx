'use client';

/**
 * Pack workspace order lines — read-only: thumb | title, SKU directly under the
 * title, then qty · condition. No tick boxes, kit parts or inserts (the desktop
 * pack checklist and paperwork were removed 2026-10-08).
 */

import { Loader2 } from '@/components/Icons';
import { SkuScanRefChip, getLast8 } from '@/components/ui/CopyChip';
import { ITEM_RECORD_FACE, ItemRecordThumb } from '@/design-system/components/item-record';
import { ReturnScanCard } from '@/components/receiving/workspace/unmatched-items/ReturnScanCard';
import type { PackChecklistLineDto } from '@/lib/packing/order-pack-checklist';
import { orderRowConditionLabel } from '@/lib/conditions';
import { cn } from '@/utils/_cn';

function lineKey(line: PackChecklistLineDto): string {
  return line.orderRowId > 0 ? `line-${line.orderRowId}` : `sku-${line.sku || line.productTitle}`;
}

export function PackOrderLines({
  lines,
  isLoading,
  isUnknownOrder,
  unknownCondition,
}: {
  lines: PackChecklistLineDto[];
  isLoading: boolean;
  /** Exception Path B — no lines resolved: Unbox Unfound-style "Unknown order" row. */
  isUnknownOrder: boolean;
  unknownCondition: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-mode border border-border-soft bg-surface-card py-8">
        <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
        <span className="text-role-caption font-semibold text-text-faint">Loading items…</span>
      </div>
    );
  }

  if (lines.length === 0) {
    if (!isUnknownOrder) return null;
    return (
      <ReturnScanCard
        title="Unknown order"
        body="none"
        condition={unknownCondition || '—'}
        onConditionChange={() => {}}
        onAdd={() => {}}
      />
    );
  }

  return (
    <ul className="rounded-mode border border-border-soft bg-surface-card">
      {lines.map((line) => {
        const sku = line.sku?.trim() ?? '';
        return (
          <li
            key={lineKey(line)}
            className={cn(
              'grid min-w-0 border-b border-border-hairline px-3 py-2 last:border-b-0',
              ITEM_RECORD_FACE.minH,
              ITEM_RECORD_FACE.thumbGrid,
            )}
          >
            <ItemRecordThumb imageUrl={line.catalog.imageUrl} />
            <div className="flex min-w-0 flex-col justify-between self-stretch">
              <div className="min-w-0 px-2 py-1">
                <p className="min-w-0 truncate text-role-caption font-semibold text-text-default">
                  {line.productTitle}
                </p>
                {sku ? (
                  <div className="pt-1">
                    <SkuScanRefChip value={sku} display={getLast8(sku)} dense />
                  </div>
                ) : null}
              </div>
              <span className="px-2 py-1 text-role-eyebrow text-text-soft">
                ×{line.quantity}
                <span className="px-1 text-text-faint">·</span>
                {orderRowConditionLabel(line.condition)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
