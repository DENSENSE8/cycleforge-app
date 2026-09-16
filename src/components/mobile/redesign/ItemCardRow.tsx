'use client';

/**
 * The phone item card — ONE component for every queue that lists sellable
 * units (to-ship on `/m/work`, picks on `/m/pick`).
 *
 *   [ photo ]  Title ..................... ⏱ Sep 18
 *              LOC  ITEM#  2  $40  Grade A   [↗] [CTA]
 *
 * Operator rulings this card enforces:
 *   - 2026-09-15: ship-by top-right with a calendar-clock glyph; listing
 *     button (dark glyph on a light inset) left of the CTA; qty · price ·
 *     condition in ONE font with whitespace separators, no middots, no `×`.
 *   - 2026-09-15: both queues render THIS card — a picker and a packer must
 *     recognize the item from either screen. This supersedes the pick row's
 *     old location-lead layout; location survives as the leading mono value
 *     of the meta row, where it was already second in the eye's order.
 *
 * Data arrives as PLAIN values, not a row type — each queue maps its own feed
 * (WorkOrderRow, PickListRow) onto the same face. The CTA is a prop because
 * the queues commit different verbs (Ship vs Pick); the swipe-to-commit is
 * opt-in for the same reason.
 */

import { type ReactNode, useCallback, useRef } from 'react';
import { CalendarClock, ExternalLink } from '@/components/Icons';
import { Button, Panel } from '@/design-system/primitives';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';
import { ItemRecordThumb } from '@/design-system/components/item-record';
import {
  ITEM_RECORD_MOBILE_THUMB,
  ITEM_RECORD_MOBILE_TITLE,
  ITEM_RECORD_MOBILE_META,
} from '@/design-system/tokens/item-record-mobile';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from '@/design-system/motion';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { cn } from '@/utils/_cn';
import { classifyDeadlineBand, type DeadlineBand } from '@/lib/work-orders/deadline-bands';
import { formatDateKeyShort, toPSTDateKey } from '@/utils/date';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';

const SWIPE_REVEAL_PX = 88;
const SWIPE_COMMIT_PX = 64;
const SWIPE_FLICK_VX = 500;

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

/**
 * Ship-by corner. Read-only on purpose: the card can swipe to commit, so a
 * tappable date here would be a second commit target inside a drag surface.
 * (`DateRangePickerField variant="compact"` is the in-CELL editor for slot
 * tables — a different job, a different surface.)
 */
function ItemCardShipBy({ deadlineAt }: { deadlineAt: string | null }) {
  const key = deadlineAt ? toPSTDateKey(deadlineAt) : null;
  if (!key) return null;
  const band = classifyDeadlineBand(deadlineAt);
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
      {formatDateKeyShort(key)}
    </span>
  );
}

export function ItemCardRow({
  title,
  imageUrl,
  location,
  locationTone,
  itemNumber,
  qty,
  price,
  condition,
  deadlineAt,
  listingHref,
  onOpen,
  primary,
  swipe = false,
  ariaLabel,
}: {
  title: string;
  imageUrl?: string | null;
  /**
   * Pick rows only — the shelf the picker walks to. Mono, default ink.
   *
   * TEXT, and only text. A DataMatrix of the bin barcode used to render beside
   * it so a bench scanner could read the code off the screen; operator
   * 2026-09-15 removed it — *"it should never mount the QR code for the
   * location of the item within the row itself"*. A queue row identifies
   * work, and a 28px symbol on every row competes with the title for the one
   * thing the thumb is hunting. The bin's own label carries the scannable
   * symbol, which is where a scanner is pointed anyway.
   */
  location?: string | null;
  /** Ink override for `location` — a pick row with no shelf reads warning. */
  locationTone?: string | null;
  /** Hidden listing key — paints only when the caller wants the item # on the face. */
  itemNumber?: string | null;
  /** Expected count; omitted or empty does not paint. */
  qty?: string | number | null;
  /** Pre-formatted currency string from the caller's own formatter. */
  price?: string | null;
  condition?: { label: string; tone: string } | null;
  deadlineAt?: string | null;
  listingHref?: string | null;
  onOpen: () => void;
  primary: ItemCardPrimaryAction | null;
  /** Enables swipe-to-commit of `primary` (to-ship). Pick rows tap through. */
  swipe?: boolean;
  ariaLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const dragging = useRef(false);
  const href = listingHref ?? getExternalUrlByItemNumber(itemNumber ?? '');

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
        void animate(x, SWIPE_REVEAL_PX, framerTransition.cardExpansion);
        commit();
        return;
      }
      void animate(x, 0, framerTransition.cardExpansion);
      window.setTimeout(() => {
        dragging.current = false;
      }, 80);
    },
    [primary, commit, x],
  );

  const isNestedControl = (target: EventTarget | null) =>
    Boolean((target as HTMLElement | null)?.closest('button, a, input'));

  const dragEnabled = swipe && !reduceMotion && !!primary && !primary.disabled;

  return (
    <Panel
      padding="none"
      radius="xl"
      elevation="raised"
      className="relative overflow-hidden rounded-2xl bg-surface-card"
    >
      {primary ? (
        <div
          aria-hidden
          className={cn(
            BUTTON_VARIANTS.primary,
            'pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center text-base font-semibold',
            primary.disabled && 'opacity-50',
          )}
          style={{ width: SWIPE_REVEAL_PX }}
        >
          {primary.label}
        </div>
      ) : null}
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel ?? title}
        className="relative z-base bg-surface-card"
        style={{ x }}
        drag={dragEnabled ? 'x' : false}
        dragConstraints={{ left: 0, right: SWIPE_REVEAL_PX }}
        dragElastic={{ left: 0, right: 0.12 }}
        dragDirectionLock
        dragMomentum={false}
        onDrag={(_, info) => {
          if (info.offset.x > 10) dragging.current = true;
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
        <div className={cn('grid min-w-0 items-stretch', ITEM_RECORD_MOBILE_THUMB.grid)}>
          <div className={ITEM_RECORD_MOBILE_THUMB.column}>
            <ItemRecordThumb
              imageUrl={imageUrl}
              className={cn(
                ITEM_RECORD_MOBILE_THUMB.face,
                ITEM_RECORD_MOBILE_THUMB.corner,
                '!bg-surface-card bg-none text-text-muted shadow-none',
              )}
            />
          </div>
          <div className={ITEM_RECORD_MOBILE_TITLE.band}>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className={cn(ITEM_RECORD_MOBILE_TITLE.face, 'min-w-0 flex-1')}>
                {title}
              </span>
              <ItemCardShipBy deadlineAt={deadlineAt ?? null} />
            </div>
            <div className={ITEM_RECORD_MOBILE_TITLE.foot}>
              {/* One cluster, one font (operator 2026-09-15): the facts —
                  item number (to-ship only), qty, price, condition — then
                  LOCATION LAST (operator ruling, later 2026-09-15: the pick
                  row is found by what it is, and the shelf is where you go
                  once you've matched it). Whitespace separates; no middots. */}
              <span
                data-item-record-mobile-meta
                className={cn(ITEM_RECORD_MOBILE_META.cluster, 'min-w-0 flex-1')}
              >
                {itemNumber ? (
                  <span className={ITEM_RECORD_MOBILE_META.itemNumber}>{itemNumber}</span>
                ) : null}
                {qty != null && qty !== '' ? (
                  <span className={ITEM_RECORD_MOBILE_META.qty}>{qty}</span>
                ) : null}
                {price ? <span className={ITEM_RECORD_MOBILE_META.price}>{price}</span> : null}
                {condition ? (
                  <span className={cn(ITEM_RECORD_MOBILE_META.condition, condition.tone)}>
                    {condition.label}
                  </span>
                ) : null}
                {location ? (
                  <span
                    data-testid="item-card-location"
                    className={cn(
                      'shrink-0 font-mono font-semibold',
                      locationTone ?? 'text-text-default',
                    )}
                  >
                    {location}
                  </span>
                ) : null}
              </span>
              <div
                className="ml-auto flex shrink-0 items-center gap-1"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                {/* Dark glyph on a light inset — quiet beside a saturated
                    CTA, so the eye still lands on the commit first. */}
                <Button
                  variant="secondary"
                  size="sm"
                  radius="pill"
                  ariaLabel="Listing"
                  data-testid="item-card-listing"
                  disabled={!href}
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                  className="px-2"
                  onClick={() => {
                    if (!href) return;
                    window.open(href, '_blank', 'noopener,noreferrer');
                  }}
                />
                {primary ? (
                  <Button
                    variant="primary"
                    size="sm"
                    radius="pill"
                    icon={primary.icon}
                    ariaLabel={primary.label}
                    disabled={primary.disabled}
                    className="min-w-16 px-3"
                    onClick={commit}
                  >
                    {primary.label}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </Panel>
  );
}
