'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ScanBarcode } from '@/components/Icons';
import {
  ConditionGradeChip,
  EmptySkuChipFace,
  SerialChipSkeleton,
  SkuScanRefChip,
  UnitPriceChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/components/ui/button';
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

/** Per-row disclosure for {@link ItemRecordRow}'s `body`. */
interface ItemRecordDisclosure {
  expanded: boolean;
  onToggle: () => void;
  /** Accessible name / tooltip. Defaults to Show|Hide + the row title. */
  label?: string;
}

/** An affordance on a meta cell: */
interface ItemRecordCellAction {
  /** Tooltip + accessible name. */
  label: string;
  onClick: () => void;
}

/**
 * One item row — thumb | wrapping title | boxed five-track meta.
 * **No layout animation** (operator rule, 2026-08-22 — AGENTS.md). This row
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
  disclosure,
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
  /**
   * Make {@link body} collapsible from the row's own face.
   * the body — no height tween, ever (operator rule, 2026-08-22; AGENTS.md). A
   */
  disclosure?: ItemRecordDisclosure | null;
  className?: string;
}) {
  const serials = (item.serials ?? []).map((s) => String(s || '').trim()).filter(Boolean);
  const skuValue = String(item.sku || '').trim();
  const selectable = typeof onSelect === 'function';
  /**
   * A disclosure control with nothing to disclose is a lie — the same rule
   * `StationBlockLabel` follows for a label-only header. Read-only ledgers pass
   * no `body`, so they get no chevron no matter what the host hands in.
   */
  const canDisclose = disclosure != null && body != null;
  const bodyOpen = body != null && (!canDisclose || disclosure.expanded);
  const disclosureLabel =
    disclosure?.label ??
    `${disclosure?.expanded ? 'Hide' : 'Show'} details for ${item.title}`;

  /** The one serial face. Last-8, never truncated, never overridable. */
  const serialText =
    serials.length > 0
      ? serials.slice(-SERIAL_PREVIEW_CAP).map((sn) => getLast8(sn)).join(', ')
      : item.serialAbsent
        ? 'No serial'
        : '—';
  const serialFace = (
    <>
      <ScanBarcode className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden />
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
      data-item-record-collapsed={
        canDisclose && !disclosure.expanded ? 'true' : undefined
      }
      className={cn(
        // Idle rows are transparent in the well. The active row is the raised
        // plate (`selectedStationClass`). No radius, no drop shadow — bevel
        // lives on the active class.
        'relative min-w-0 overflow-hidden rounded-none transition-colors',
        active ? QUEUE_ROW.selectedStationClass : 'border-0 bg-transparent',
        selectable && !active ? 'hover:bg-surface-station-row-hover' : null,
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
        {/* Nested grid: size-20 thumb | title + boxed meta. */}
        <div className={cn('grid min-w-0', ITEM_RECORD_FACE.minH, ITEM_RECORD_FACE.thumbGrid)}>
          <ItemRecordThumb imageUrl={item.imageUrl} />
          <div className="flex min-h-0 min-w-0 flex-col justify-between self-stretch">
            <div className="flex min-w-0 items-start gap-0 px-2 py-1">
              <p className="min-w-0 flex-1 text-role-caption font-semibold leading-tight text-text-default">
                {item.title}
              </p>
              {titleActions}
              {canDisclose ? (
                // Far right of the face, NOT a chevron beside the title:
                <HoverTooltip label={disclosureLabel} asChild>
                  <Button
                    variant="ghost"
                    size="iconTight"
                    data-item-record-disclosure
                    aria-expanded={disclosure.expanded}
                    aria-label={disclosureLabel}
                    className="text-text-faint"
                    onClick={(e) => {
                      e.stopPropagation();
                      disclosure.onToggle();
                    }}
                  >
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
                        disclosure.expanded && 'rotate-180',
                      )}
                    />
                  </Button>
                </HoverTooltip>
              ) : null}
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
              condition={
                conditionAction ? (
                  <HoverTooltip label={conditionAction.label} asChild>
                    <ConditionGradeChip
                      grade={item.conditionGrade}
                      dense
                      onActivate={conditionAction.onClick}
                      activationLabel={conditionAction.label}
                      disableTooltip
                    />
                  </HoverTooltip>
                ) : (
                  <ConditionGradeChip grade={item.conditionGrade} dense />
                )
              }
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
      {bodyOpen ? (
        <div
          className={cn(
            // No frame and no fill: the capture body is a continuation of the
            // line, not a panel nested inside it.
            'min-w-0 overflow-hidden',
            bodyClassName,
          )}
        >
          <div className="min-w-0">{body}</div>
        </div>
      ) : null}
    </li>
  );
}
