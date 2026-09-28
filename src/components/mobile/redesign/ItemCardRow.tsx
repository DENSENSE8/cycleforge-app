'use client';

/** The phone item card — ONE component for every queue that lists sellable units (to-ship on `/m/work`, the shipping and exception queues). */

import { type ReactNode, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock } from '@/components/Icons';
import { Button, Panel } from '@/design-system/primitives';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { MicroListingTrigger, type GovernedListing } from '@/components/mobile/redesign/MicroListingTrigger';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';
import { ItemRecordMobileMeta, ItemRecordThumb } from '@/design-system/components/item-record';
import {
  ITEM_RECORD_MOBILE_ROW,
  ITEM_RECORD_MOBILE_META,
  ITEM_RECORD_MOBILE_STATE_RAIL,
  ITEM_RECORD_MOBILE_THUMB,
  ITEM_RECORD_MOBILE_TITLE,
} from '@/design-system/tokens/item-record-mobile';
import type { OutboundWorkflowStateRail } from '@/lib/shipping/outbound-workflow-facts';
import type { OutboundHandlingFace } from '@/lib/shipping/outbound-handling-facts';
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from '@/design-system/motion';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { cn } from '@/utils/_cn';
import { classifyDeadlineBand, type DeadlineBand } from '@/lib/work-orders/deadline-bands';
import { resolveOutboundSlaCountdown } from '@/lib/shipping/outbound-sla';
import { formatDateKeyShort, toPSTDateKey } from '@/utils/date';

const SWIPE_REVEAL_PX = 88;
const SWIPE_TRIAGE_REVEAL_PX = 144;
const SWIPE_COMMIT_PX = 64;
const SWIPE_FLICK_VX = 500;

/**
 * A catalog image is secondary verification, but its empty state cannot be
 * blank. Keep the common part silhouette and give it a small, deterministic
 * product mark that a picker can distinguish at a glance.
 */
function productFallbackMark(title: string) {
  const words = title.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'CF';
}

/**
 * Only the bands that change what a worker does next earn loud ink — a calm
 * queue stays monochrome, so the one card that is late is the only coloured
 * thing on the screen.
 */
const SHIP_BY_TONE: Partial<Record<DeadlineBand, string>> = {
  overdue: 'text-text-danger',
  today: 'text-text-warning',
};

export interface ItemCardPrimaryAction {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onCommit: () => void;
}

/** Closed typed waist for row triage — callers cannot inject arbitrary chrome. */
export interface ItemCardTriageAction {
  id: 'out_of_stock' | 'damaged' | 'discrepancy' | 'hold';
  label: string;
  onCommit: () => void;
}

/** Ship-by corner. */
export function ItemCardShipBy({ deadlineAt, now }: { deadlineAt: string | null; now?: number }) {
  const key = deadlineAt ? toPSTDateKey(deadlineAt) : null;
  const sla = resolveOutboundSlaCountdown(deadlineAt, now);
  const band = sla.tone === 'danger' ? 'overdue' : sla.tone === 'warning' ? 'today' : classifyDeadlineBand(deadlineAt);
  const isToday = key !== '' && key === toPSTDateKey(new Date(now ?? Date.now()));
  // Exact minute clocks are a same-day triage instrument, not permanent row
  // decoration. Future work holds its date quietly until it becomes actionable.
  const faceLabel = sla.tone !== 'neutral' || isToday
    ? sla.label
    : key
      ? formatDateKeyShort(key)
      : sla.label;
  return (
    <span
      data-testid="item-card-shipby"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-role-caption font-semibold tabular-nums',
        SHIP_BY_TONE[band] ?? 'text-text-muted',
      )}
    >
      {/* Calendar-clock, not a bare calendar: this is a DUE day, not a date. */}
      <CalendarClock aria-hidden className="h-3.5 w-3.5 shrink-0" />
      {faceLabel}
    </span>
  );
}

/** A press-only inspection surface: no navigation, no competing detail route. */
function ItemCardPhotoInspect({
  imageUrl,
  open,
  onDismiss,
}: {
  imageUrl: string | null | undefined;
  open: boolean;
  onDismiss: () => void;
}) {
  if (!imageUrl || typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          data-testid="item-card-photo-inspect"
          className="fixed inset-0 z-modal flex items-center justify-center bg-scrim/30 p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={onDismiss}
          aria-hidden
        >
          <motion.img
            src={imageUrl}
            alt=""
            className="max-h-[72vh] w-full max-w-md object-contain"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={motionTransition.cardExpansion}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function ItemCardRow({
  title,
  imageUrl,
  orderContext,
  reference,
  outboundOrderId,
  location,
  itemNumber,
  listing = null,
  qty,
  price,
  condition,
  quantityStatus,
  managementStatus,
  managementAction,
  managementOwner,
  handlingFacts = [],

  deadlineAt,
  now,
  onOpen,
  primary,
  triageActions = [],
  stateRail = 'ready',
  active = false,
  swipe = false,
  ariaLabel,
}: {
  title: string;
  imageUrl?: string | null;
  /** Exact source platform + order identity; establishes row 1 on order rosters. */
  orderContext?: string | null;
  /** Queue-specific machine identity (order / tracking). Never drives a link. */
  reference?: string | null;
  /** Stable order-row identity for non-visual browser observability only. */
  outboundOrderId?: string | number | null;
  /** The shelf the unit sits on. */
  location?: string | null;
  /** Listing identity rendered only through the governed SKU-adjacent trigger. */
  itemNumber?: string | null;
  /** Context-preserving marketplace inspection; never a row destination. */
  listing?: GovernedListing | null;
  /** Expected count; omitted or empty does not paint. */
  qty?: string | number | null;
  /** Pre-formatted currency string from the caller's own formatter. */
  price?: string | null;
  condition?: { label: string; tone: string } | null;
  /** Completion or verification state shown under the pinned tactical quantity. */
  quantityStatus?: string | null;
  /** Resolver-owned current lifecycle state for the Order Management facts row. */
  managementStatus?: string | null;
  /** Resolver-owned next workflow verb for the Order Management facts row. */
  managementAction?: string | null;
  /** Resolver-owned accountable person or team; separate from status and next action. */
  managementOwner?: string | null;
  /** Catalog-owned safety facts; this shared face never parses free-text notes. */
  handlingFacts?: readonly OutboundHandlingFace[];

  deadlineAt?: string | null;
  /** Shared roster clock; Orders updates it once per minute, not per row. */
  now?: number;
  onOpen: () => void;
  primary: ItemCardPrimaryAction | null;
  /** Left-swipe reveals only the governed triage command family. */
  triageActions?: readonly ItemCardTriageAction[];
  /** Semantic workflow state, rendered as the shared 4px left rail. */
  stateRail?: OutboundWorkflowStateRail;
  /** The selected tactical target gets the 80px preview; queued rows stay 48px. */
  active?: boolean;
  /** Enables swipe-to-commit of `primary` (to-ship). Pick rows tap through. */
  swipe?: boolean;
  ariaLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [photoInspecting, setPhotoInspecting] = useState(false);
  const tacticalRoster = Boolean(orderContext);
  const skuIdentity = reference ?? itemNumber;
  // Row tap remains the physical-work selection door.
  const storageContext = location ? `Bin: ${location}` : 'Bin: Unassigned';
  const x = useMotionValue(0);
  const dragging = useRef(false);


  const commit = useCallback(() => {
    if (!primary || primary.disabled) return;
    primary.onCommit();
  }, [primary]);

  const onDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const commitNow =
        !!primary &&
        !primary.disabled &&
        (info.offset.x >= SWIPE_COMMIT_PX || info.velocity.x >= SWIPE_FLICK_VX);
      if (commitNow) {
        void animate(x, SWIPE_REVEAL_PX, motionTransition.cardExpansion);
        commit();
        return;
      }
      if (triageActions.length > 0 && (info.offset.x <= -SWIPE_COMMIT_PX || info.velocity.x <= -SWIPE_FLICK_VX)) {
        void animate(x, -SWIPE_TRIAGE_REVEAL_PX, motionTransition.cardExpansion);
        return;
      }
      void animate(x, 0, motionTransition.cardExpansion);
      window.setTimeout(() => {
        dragging.current = false;
      }, 80);
    },
    [primary, commit, triageActions.length, x],
  );

  const isNestedControl = (target: EventTarget | null) =>
    Boolean((target as HTMLElement | null)?.closest('button, a, input'));

  const dragEnabled = !reduceMotion && ((swipe && !!primary && !primary.disabled) || triageActions.length > 0);

  return (
    <>
      <Panel
      padding="none"
      radius="none"
      elevation="none"
      borderless
      data-mobile-outbound-row=""
      data-outbound-order-id={outboundOrderId ?? undefined}
      className={cn(ITEM_RECORD_MOBILE_ROW.shell, ITEM_RECORD_MOBILE_STATE_RAIL[stateRail])}
    >
      {primary ? (
        <div
          aria-hidden
          className={cn(
            BUTTON_VARIANTS.primary,
            'pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center text-base font-semibold',
            ITEM_RECORD_MOBILE_ROW.primaryReveal,
            primary.disabled && 'opacity-50',
          )}
        >
          {primary.label}
        </div>
      ) : null}
      {triageActions.length > 0 ? (
        <div
          aria-hidden
          aria-label="Triage actions"
          className={cn(
            'absolute inset-y-0 right-0 grid grid-cols-3 bg-surface-danger',
            ITEM_RECORD_MOBILE_ROW.triageReveal,
          )}
        >
          {triageActions.map((action) => (
            <Button
              key={action.id}
              variant="ghost"
              radius="flush"
              tabIndex={-1}
              className="min-h-11 px-1 text-role-eyebrow font-semibold text-text-danger"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                action.onCommit();
                void animate(x, 0, motionTransition.cardExpansion);
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel ?? title}
        className="relative z-base bg-surface-card"
        style={{ x }}
        drag={dragEnabled ? 'x' : false}
        dragConstraints={{ left: triageActions.length > 0 ? -SWIPE_TRIAGE_REVEAL_PX : 0, right: primary ? SWIPE_REVEAL_PX : 0 }}
        dragElastic={{ left: triageActions.length > 0 ? 0.12 : 0, right: 0.12 }}
        dragDirectionLock
        dragMomentum={false}
        onDrag={(_, info) => {
          if (Math.abs(info.offset.x) > 10) dragging.current = true;
        }}
        onDragEnd={onDragEnd}
        onClick={(event) => {
          if (dragging.current || isNestedControl(event.target)) return;
          onOpen();
        }}
        onTap={(event) => {
          if (dragging.current || isNestedControl(event.target)) return;
          onOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <div
          data-item-card-bento
          className={cn('grid min-w-0 items-stretch', ITEM_RECORD_MOBILE_THUMB.grid)}
        >
          <div className={ITEM_RECORD_MOBILE_THUMB.column}>
            <button
              type="button"
              aria-label={imageUrl ? `Inspect ${title} image` : `${title} has no product image`}
              disabled={!imageUrl}
              className={cn(
                'relative flex self-stretch touch-manipulation disabled:cursor-default',
                active ? 'w-20' : 'w-12',
              )}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (imageUrl) setPhotoInspecting(true);
              }}
              onClick={(event) => { event.stopPropagation(); if (imageUrl) setPhotoInspecting(true); }}
            >
              <ItemRecordThumb
                imageUrl={imageUrl}
                plainEmpty
                iconClassName={ITEM_RECORD_MOBILE_THUMB.packageIcon}
                className={cn(
                  ITEM_RECORD_MOBILE_THUMB.face,
                  active ? ITEM_RECORD_MOBILE_THUMB.activeSize : ITEM_RECORD_MOBILE_THUMB.size,
                  ITEM_RECORD_MOBILE_THUMB.corner,
                  '!bg-surface-card bg-none text-text-muted shadow-none',
                )}
              />
              {!imageUrl ? (
                <span data-testid="item-card-photo-fallback" className={ITEM_RECORD_MOBILE_THUMB.fallbackMark}>
                  <span className={ITEM_RECORD_MOBILE_THUMB.fallbackLabel}>Part</span>
                  <span>{productFallbackMark(title)}</span>
                </span>
              ) : null}
            </button>
          </div>
          <div className={ITEM_RECORD_MOBILE_TITLE.band}>
            {tacticalRoster ? (
              <>
                <div className={ITEM_RECORD_MOBILE_TITLE.context}>
                  <span
                    data-testid="item-card-location-context"
                    className={ITEM_RECORD_MOBILE_TITLE.locationContext}
                  >
                    {storageContext}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{orderContext}</span>
                  <ItemCardShipBy deadlineAt={deadlineAt ?? null} now={now} />
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-stretch">
                  <div className="min-w-0">
                    <span className={cn(ITEM_RECORD_MOBILE_TITLE.face, 'block')}>{title}</span>
                    <div className={ITEM_RECORD_MOBILE_TITLE.foot}>
                      {condition ? (
                        <span data-testid="item-card-condition" className={cn(ITEM_RECORD_MOBILE_TITLE.conditionPill, condition.tone)}>
                          [{condition.label}]
                        </span>
                      ) : null}
                      {price ? (
                        <span data-testid="item-card-price" className={ITEM_RECORD_MOBILE_META.price}>
                          {price}
                        </span>
                      ) : null}
                      {listing ? <MicroListingTrigger listing={listing} /> : null}
                      {skuIdentity ? (
                        <span data-testid="item-card-sku" className={ITEM_RECORD_MOBILE_TITLE.skuTertiary}>
                          sku: {skuIdentity}
                        </span>
                      ) : null}
                      {managementStatus ? (
                        <span data-testid="item-card-management-status" className="shrink-0 font-mono text-role-eyebrow font-semibold text-text-default">
                          {managementStatus}
                        </span>
                      ) : null}
                      {managementAction ? (
                        <span data-testid="item-card-management-action" className="min-w-0 flex-1 truncate font-mono text-role-eyebrow font-semibold text-text-muted">
                          Next: {managementAction}
                        </span>
                      ) : null}
                      {managementOwner ? (
                        <span data-testid="item-card-management-owner" className="min-w-0 shrink truncate font-mono text-role-eyebrow font-semibold text-text-muted">
                          Owner: {managementOwner}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className={ITEM_RECORD_MOBILE_TITLE.quantityAnchor} data-testid="item-card-quantity-anchor">
                    <span className={ITEM_RECORD_MOBILE_TITLE.quantityLabel}>Qty</span>
                    <span className={ITEM_RECORD_MOBILE_TITLE.quantityValue}>{qty ?? '—'}</span>
                    {quantityStatus ? (
                      <span className="flex items-center justify-end gap-0.5">
                        <span className={ITEM_RECORD_MOBILE_TITLE.quantityStatus}>{quantityStatus}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className={cn(ITEM_RECORD_MOBILE_TITLE.face, 'min-w-0 flex-1')}>{title}</span>
                  <ItemCardShipBy deadlineAt={deadlineAt ?? null} now={now} />
                </div>
              </>
            )}
            {!tacticalRoster ? (
              <div className={ITEM_RECORD_MOBILE_TITLE.foot}>
                <ItemRecordMobileMeta
                  className="min-w-0 flex-1"
                  itemNumber={reference ?? itemNumber}
                  qty={qty ?? '—'}
                  price={price}
                  condition={condition ? <span className={condition.tone}>{condition.label}</span> : null}
                  notes={location ? <span data-testid="item-card-location" className="text-text-default">{location}</span> : null}
                />
                {primary ? (
                <div
                  className={ITEM_RECORD_MOBILE_ROW.actionCluster}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.stopPropagation(); if (imageUrl) setPhotoInspecting(true); }}
                >
                  <Button
                    variant="primary"
                    size="sm"
                    radius="flush"
                    icon={primary.icon}
                    ariaLabel={primary.label}
                    disabled={primary.disabled}
                    className="min-w-16 px-3"
                    onClick={commit}
                  >
                    {primary.label}
                  </Button>
                </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {tacticalRoster && handlingFacts.length > 0 ? (
          <div data-testid="item-card-handling-facts" className="border-t border-border-hairline">
            {handlingFacts.map((fact) => (
              <Alert key={fact.id} variant={fact.tone} className="border-x-0 border-b-0 px-2 py-1.5">
                <AlertTitle>Handling: {fact.label}</AlertTitle>
              </Alert>
            ))}
          </div>
        ) : null}
      </motion.div>
      </Panel>
      <ItemCardPhotoInspect
        imageUrl={imageUrl}
        open={photoInspecting}
        onDismiss={() => setPhotoInspecting(false)}
      />
    </>
  );
}
