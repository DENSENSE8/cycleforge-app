'use client';

import type { ReactNode } from 'react';
import { Barcode, ChevronDown, MapPin } from '@/components/Icons';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { ItemRecordMetaGrid } from './ItemRecordMetaGrid';
import { ItemRecordQtyBadge } from './ItemRecordQtyBadge';
import { ItemRecordThumb } from './ItemRecordThumb';
import { ITEM_RECORD_FACE } from './item-record-face';
import type { ItemRecord, ItemRecordReceiveState } from './item-record-types';

/** Max serials shown in the meta preview. */
const SERIAL_PREVIEW_CAP = 2;

/**
 * Per-row disclosure for {@link ItemRecordRow}'s `body`.
 *
 * The row owns the FACE of this control (a far-right chevron on the title band)
 * and the unmount; the host owns the state, because collapse is a property of
 * the LIST — several rows answer to one "collapse all" — and a row that held its
 * own flag could not participate in that. `station/collapse` → `useLineCollapse`
 * is the state SoT this pairs with.
 *
 * Omit it entirely for a body that is always open. A row with a `body` and no
 * disclosure renders exactly as it did before this existed.
 *
 * A row with NO body ignores this outright — see `canDisclose` below. That is
 * what lets one host hand the same controller to every line list it owns
 * (`useLineCollapse`) without first working out which of them render bodies:
 * the ledger-only surfaces (Testing centre, `/search` Items, Arrival) simply do
 * not paint a toggle.
 */
export interface ItemRecordDisclosure {
  expanded: boolean;
  onToggle: () => void;
  /** Accessible name / tooltip. Defaults to Show|Hide + the row title. */
  label?: string;
}

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

/** Qty-cell L1 menu — Received / Not received / OS&D. Face stays the badge. */
export interface ItemRecordQtyMenuItem {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

export interface ItemRecordQtyMenu {
  /** Tooltip + accessible name on the qty trigger. */
  label: string;
  items: readonly ItemRecordQtyMenuItem[];
}

const RECEIVE_STATE_MARK: Record<
  Exclude<ItemRecordReceiveState, 'open' | 'partial'>,
  { label: string; className: string }
> = {
  received: { label: 'Received', className: 'text-emerald-600/80' },
  short: { label: 'SHORT', className: 'text-rose-700' },
  over: { label: 'OVER', className: 'text-amber-700' },
  damaged: { label: 'DAMAGED', className: 'text-red-700' },
  wrong_item: { label: 'WRONG ITEM', className: 'text-orange-700' },
};

function ReceiveStateMark({ state }: { state?: ItemRecordReceiveState | null }) {
  if (!state || state === 'open' || state === 'partial') return null;
  const mark = RECEIVE_STATE_MARK[state];
  return (
    <span
      data-receive-state-mark={state}
      className={cn(
        'shrink-0 text-role-micro font-semibold uppercase tracking-widest',
        mark.className,
      )}
    >
      {mark.label}
    </span>
  );
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
  qtyMenu,
  conditionAction,
  serialAction,
  locationAction,
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
  /**
   * L1 receive verbs on the qty cell (Received / Not received / OS&D).
   * When set, outranks {@link qtyAction}. Search / pack / shipped omit this.
   */
  qtyMenu?: ItemRecordQtyMenu | null;
  /** Make the condition cell activatable. The chip itself is not replaceable. */
  conditionAction?: ItemRecordCellAction | null;
  /** Make the serials cell activatable. The last-8 face is not replaceable. */
  serialAction?: ItemRecordCellAction | null;
  /** Make the location face open the host's exact-line location display. */
  locationAction?: ItemRecordCellAction | null;
  /**
   * Absolutely-positioned chrome inside the row (a scan-acknowledgement ring).
   * Opacity/colour only — never anything that moves the row.
   */
  overlay?: ReactNode;
  /** Slot under the row — capture editors, an expanded body. */
  body?: ReactNode;
  bodyClassName?: string;
  /**
   * Make {@link body} collapsible from the row's own face. Collapsed UNMOUNTS
   * the body — no height tween, ever (operator rule, 2026-08-22; AGENTS.md). A
   * collapse that animates still occupies the space for the length of the
   * tween, which is backwards for a gesture whose only purpose is to hand the
   * space back.
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
      <Barcode className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden />
      <span className="min-w-0 whitespace-nowrap tabular-nums normal-case tracking-normal">
        {serialText}
      </span>
    </>
  );

  const locationLabel = String(item.locationLabel ?? '').trim();
  const locationPending = item.locationPending === true || !locationLabel;
  const locationFace = (
    <span
      data-testid="item-record-location"
      data-location-pending={locationPending ? 'true' : undefined}
      className={cn(
        'flex min-w-0 items-center justify-end gap-1.5 text-right normal-case tracking-normal',
        locationPending ? 'text-amber-500' : 'text-text-muted',
      )}
    >
      {locationLabel ? (
        <span className="min-w-0 truncate" data-location-label>
          {locationLabel}
        </span>
      ) : null}
      <span data-testid="item-record-location-icon">
        <MapPin
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            locationPending && 'drop-shadow-[0_0_5px_theme(colors.amber.400)]',
          )}
        />
      </span>
    </span>
  );
  const locationContent = locationAction ? (
    <HoverTooltip
      label={
        item.locationDetails ||
        (locationLabel ? `Location: ${locationLabel}` : 'Set location')
      }
      asChild
    >
      <button
        type="button"
        aria-label={locationAction.label}
        data-testid="item-record-location-action"
        className={cn(
          'ds-raw-button flex h-full min-w-0 max-w-full items-center',
          focusRing('control', 'neutral'),
        )}
        onClick={(e) => {
          e.stopPropagation();
          locationAction.onClick();
        }}
      >
        {locationFace}
      </button>
    </HoverTooltip>
  ) : (
    <HoverTooltip
      label={
        item.locationDetails ||
        (locationLabel ? `Location: ${locationLabel}` : 'Location not set')
      }
      asChild
    >
      <span>{locationFace}</span>
    </HoverTooltip>
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

  const qtyFace = (
    <span className="flex min-w-0 items-center gap-1.5">
      <ItemRecordQtyBadge quantity={item.quantity} />
      <ReceiveStateMark state={item.receiveState} />
    </span>
  );
  const qtyCell =
    qtyMenu && qtyMenu.items.length > 0 ? (
      <DropdownMenu>
        <HoverTooltip label={qtyMenu.label} asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={qtyMenu.label}
              data-item-record-qty-menu
              className={cn(
                'ds-raw-button flex h-full min-w-0 items-center',
                focusRing('control', 'neutral'),
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {qtyFace}
            </button>
          </DropdownMenuTrigger>
        </HoverTooltip>
        <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()}>
          {qtyMenu.items.map((entry) => (
            <DropdownMenuItem
              key={entry.label}
              tone={entry.tone}
              disabled={entry.disabled}
              onSelect={() => entry.onClick()}
            >
              {entry.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      withAction(qtyAction, qtyFace)
    );

  return (
    <li
      aria-current={active ? 'true' : undefined}
      data-item-record-row
      data-item-record-id={item.id}
      data-item-record-active={active ? 'true' : undefined}
      data-receive-state={item.receiveState ?? undefined}
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
        {/* Nested grid: size-20 thumb | title + boxed meta. The thumb sits in
            the title + details band and expands that row. Media and data are
            separated by the thumb's own width, not by a rule; meta gutters are
            whitespace (gap-x). */}
        <div className={cn('grid min-w-0', ITEM_RECORD_FACE.minH, ITEM_RECORD_FACE.thumbGrid)}>
          <ItemRecordThumb imageUrl={item.imageUrl} />
          <div className="flex min-h-0 min-w-0 flex-col justify-between self-stretch">
            <div className="flex min-w-0 items-start gap-0 px-2 py-1">
              <p className="min-w-0 flex-1 text-role-caption font-semibold leading-tight text-text-default">
                {item.title}
              </p>
              {titleActions}
              {canDisclose ? (
                // Far right of the face, NOT a chevron beside the title: the
                // title is a hit target for arming capture, and a disclosure
                // there steals that press. Rotation only — a transform
                // composites and moves no neighbour.
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
              qty={qtyCell}
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
              location={locationContent}
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
