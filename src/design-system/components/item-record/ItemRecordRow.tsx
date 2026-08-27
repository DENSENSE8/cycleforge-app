'use client';

import type { ReactNode } from 'react';
import { Barcode } from '@/components/Icons';
import {
  ConditionGradeChip,
  EmptySkuChipFace,
  SerialChipSkeleton,
  SkuScanRefChip,
  UnitPriceChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { ItemRecordMetaGrid } from './ItemRecordMetaGrid';
import { ItemRecordQtyBadge } from './ItemRecordQtyBadge';
import { ItemRecordThumb } from './ItemRecordThumb';
import { ITEM_RECORD_FACE } from './item-record-face';
import type { ItemRecord } from './item-record-types';

/** Max serials shown in the meta preview. */
const SERIAL_PREVIEW_CAP = 2;

/**
 * An affordance on a meta cell: the cell's face is fixed by this component,
 * the caller supplies only what activating it means.
 *
 * This shape exists so a host can make a cell interactive WITHOUT handing in a
 * node. A node slot is a fork: the moment a caller can replace the face, one
 * surface renders a full SKU where the next renders a last-8, and the ledger
 * stops being one ledger. Callers get behaviour; the face stays here.
 */
export interface ItemRecordCellAction {
  /** Tooltip + accessible name. */
  label: string;
  onClick: () => void;
}

/**
 * One item row — thumb | wrapping title | boxed five-track meta.
 *
 * Ported from the scan-station PO line (`receiving/workspace/PoLineRow`). What
 * came across is the FACE: the nested `5rem | 1fr` grid, the title band with a
 * trailing control slot, and the qty · SKU · condition · serials · price
 * ledger. What did not come across is every reason that row could only ever be
 * a PO line — the scan-sink arming, `receiving-select-line`, the unlink ⋮
 * menu, the dock-focus wiring and the `ReceivingLineRow` type. Those are host
 * behaviours, and hosts pass them in.
 *
 * **No layout animation** (operator rule, 2026-08-22 — AGENTS.md). This row
 * used to reorder through a framer `layout` spring when the active line
 * changed. On a scan station that is a cost with no payer: the operator is
 * looking at the scanner, the row has already been selected by the hardware,
 * and the spring only delays the paint that tells them it worked. Position
 * changes are instant. Hosts may still pass an `overlay` for OPACITY feedback
 * (the scan-acknowledgement ring) — that composites, it does not reflow.
 *
 * **Last-8 is an invariant here, not an option.** Every identifier the ledger
 * paints — SKU, serials — renders through `getLast8` with no truncation and no
 * prop to say otherwise. There is deliberately no `displayWidth`, no
 * `truncate`, no full-value escape hatch: a chip that shows a full SKU on one
 * surface and eight characters on the next is two ledgers wearing one name.
 */
export function ItemRecordRow({
  item,
  active = false,
  onSelect,
  onFocus,
  titleActions,
  serialsLoading = false,
  qtyAction,
  conditionAction,
  serialAction,
  overlay,
  body,
  bodyClassName,
  className,
}: {
  item: ItemRecord;
  /** This row is the surface's current context — opaque face on a sunken canvas. */
  active?: boolean;
  /**
   * Make the row selectable. Omitted (the default) renders an inert row with
   * no button role, no tab stop and no pointer affordance — which is how a
   * read surface gets read-only behaviour without passing a capability flag.
   */
  onSelect?: (item: ItemRecord) => void;
  /** Keyboard focus reached the row — hosts that own a scan sink arm it here. */
  onFocus?: (item: ItemRecord) => void;
  /** Trailing control on the title band — a ⋮ menu, a link out, nothing. */
  titleActions?: ReactNode;
  /** Serial hydration in flight — show the serial-slot skeleton until it lands. */
  serialsLoading?: boolean;
  /** Make the qty cell activatable. The badge itself is not replaceable. */
  qtyAction?: ItemRecordCellAction | null;
  /** Make the condition cell activatable. The chip itself is not replaceable. */
  conditionAction?: ItemRecordCellAction | null;
  /** Make the serials cell activatable. The last-8 face is not replaceable. */
  serialAction?: ItemRecordCellAction | null;
  /**
   * Absolutely-positioned chrome inside the row (a scan-acknowledgement ring).
   * Opacity/colour only — never anything that moves the row.
   */
  overlay?: ReactNode;
  /** Slot under the row — capture editors, an expanded body. */
  body?: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  const serials = (item.serials ?? []).map((s) => String(s || '').trim()).filter(Boolean);
  const skuValue = String(item.sku || '').trim();
  const selectable = typeof onSelect === 'function';

  /** The one serial face. Last-8, never truncated, never overridable. */
  const serialText =
    serials.length > 0
      ? serials.slice(-SERIAL_PREVIEW_CAP).map((sn) => getLast8(sn)).join(', ')
      : item.serialAbsent
        ? 'No serial'
        : '—';
  const serialFace = (
    <>
      <Barcode className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden />
      <span className="min-w-0 whitespace-nowrap tabular-nums normal-case tracking-normal">
        {serialText}
      </span>
    </>
  );

  /** Wrap a meta cell's fixed face in an activator, or leave it inert. */
  const withAction = (action: ItemRecordCellAction | null | undefined, face: ReactNode) => {
    if (!action) return face;
    return (
      <HoverTooltip label={action.label} asChild>
        <button
          type="button"
          aria-label={action.label}
          className={cn(
            'ds-raw-button flex h-full min-w-0 items-center',
            focusRing('control', 'neutral'),
          )}
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
        >
          {face}
        </button>
      </HoverTooltip>
    );
  };

  return (
    <li
      aria-current={active ? 'true' : undefined}
      data-item-record-row
      data-item-record-id={item.id}
      data-item-record-active={active ? 'true' : undefined}
      className={cn(
        // Flat data floor: hairline bottom only — no card radius / side borders.
        'relative min-w-0 overflow-hidden rounded-none border-0 border-b border-border-soft transition-colors',
        active ? QUEUE_ROW.selectedStationClass : 'bg-surface-card',
        selectable && !active ? 'hover:bg-surface-hover' : null,
        className,
      )}
    >
      {overlay}
      {/* Click area = title + meta. Kept as a <div role="button"> so
          interactive children can render inside without nested <button>. */}
      <div
        role={selectable && !active ? 'button' : undefined}
        tabIndex={selectable && !active ? 0 : -1}
        onFocus={onFocus ? () => onFocus(item) : undefined}
        onClick={selectable ? () => onSelect?.(item) : undefined}
        onKeyDown={
          selectable
            ? (e) => {
                if (active) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(item);
                }
              }
            : undefined
        }
        className={cn(
          'w-full min-w-0 p-0 text-left',
          selectable && !active ? 'cursor-pointer' : null,
        )}
      >
        {/* Nested grid: size-20 thumb | title + boxed meta. The thumb sits in
            the title + details band and expands that row; the structural
            border-r separates media from data. Meta gutters are whitespace
            (gap-x), not vertical hairlines. */}
        <div className={cn('grid min-w-0', ITEM_RECORD_FACE.minH, ITEM_RECORD_FACE.thumbGrid)}>
          <ItemRecordThumb imageUrl={item.imageUrl} />
          <div className="flex min-h-0 min-w-0 flex-col justify-between self-stretch">
            <div className="flex min-w-0 items-start gap-0 px-2 py-1">
              <p className="min-w-0 flex-1 text-role-caption font-semibold leading-tight text-text-default">
                {item.title}
              </p>
              {titleActions}
            </div>
            <ItemRecordMetaGrid
              qty={withAction(qtyAction, <ItemRecordQtyBadge quantity={item.quantity} />)}
              sku={
                skuValue ? (
                  // Last-8, fixed footprint, no truncation. No caller says otherwise.
                  <SkuScanRefChip
                    value={skuValue}
                    display={getLast8(skuValue)}
                    dense
                    displayWidth="last8"
                  />
                ) : (
                  <EmptySkuChipFace dense />
                )
              }
              condition={withAction(
                conditionAction,
                <ConditionGradeChip grade={item.conditionGrade} dense />,
              )}
              serial={
                serialsLoading ? (
                  <SerialChipSkeleton width="w-fit max-w-full" dense />
                ) : serialAction ? (
                  <HoverTooltip label={serialAction.label} asChild>
                    <button
                      type="button"
                      aria-label={serialAction.label}
                      className={cn(
                        'ds-raw-button flex h-full min-w-0 w-full items-center gap-0.5 overflow-hidden px-2 py-1 text-left transition-colors',
                        cornerClass('flush'),
                        'text-text-muted hover:bg-surface-hover hover:text-text-default',
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        serialAction.onClick();
                      }}
                    >
                      {serialFace}
                    </button>
                  </HoverTooltip>
                ) : (
                  <span className="flex h-full min-w-0 w-full items-center gap-0.5 overflow-hidden px-2 py-1 text-text-muted">
                    {serialFace}
                  </span>
                )
              }
              price={<UnitPriceChip amount={item.unitPrice} dense />}
            />
          </div>
        </div>
      </div>
      {body ? (
        <div
          className={cn(
            'min-w-0 overflow-hidden border-t border-border-hairline bg-surface-sunken',
            bodyClassName,
          )}
        >
          <div className="min-w-0 border border-border-soft border-t-0 bg-surface-card">{body}</div>
        </div>
      ) : null}
    </li>
  );
}
