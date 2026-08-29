'use client';

/**
 * The compound cell bodies — the ONLY implementation, for every table.
 *
 * Each takes a {@link CompoundRowView} (a family's adapter output) rather than
 * a family row type, which is what lets Receiving, Orders and Incoming share
 * one layout instead of three that drift. A new table supplies a mapper; it
 * never copies a cell.
 *
 * These render the cell BODY. The surrounding `<div>` — grid cell class,
 * `data-col`, row box, frozen offset — is {@link CompoundGridCell}, which is
 * where every family enters. Nothing outside this directory composes these
 * bodies directly.
 *
 * The wrapper used to be each family's job, on the reasoning that per-staff
 * column display and the frozen-pane token resolve from the family's own model.
 * That was wrong in a way worth remembering: the wrapper decides a cell's
 * POSITION, so leaving it per-family forked the layout in the one place nobody
 * compares. Receiving pinned the photo track at the wrong offset and Orders did
 * not pin it at all — from the same `frozen: true`. Both prefs are resolved
 * from the MOUNTED columns now, which every family already passes.
 */

import { useState } from 'react';
import Image from 'next/image';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { ChevronRight, MoreHorizontal, Package } from '@/components/Icons';
import { BrandIdentityDot, GridCellDash } from '@/components/ui/grid-cells';
import { GridClickSelectFace, GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { carrierBrandDotPaint, resolveCarrierBrand } from '@/lib/carrier-brand';
import { resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { cn } from '@/utils/_cn';
import { CompoundCell, CompoundLine } from './CompoundCell';
import { COMPOUND_GUTTER_PX, COMPOUND_ROW_PX } from './compound-row-chrome';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import type {
  CompoundRowAction,
  CompoundRowView,
  CompoundStateTone,
} from './compound-row-model';

/**
 * Column 2 — the photo, EDGE TO EDGE.
 *
 * It fills its cell corner to corner: no inset, no border, no centring slack.
 * The cell is a square of the row box (`COMPOUND_GUTTER_TRACK_REM`).
 *
 * Very nearly a true square: the airtable skin paints a 1px bottom rule on every
 * direct child of a row, and the cell is border-box, so the painted area is
 * 48×47. That last pixel is the row SEAM, not padding — removing it for these
 * two tracks would break the continuous hairline down the grid — so a square
 * source is scaled by 48/S and loses half a pixel top and bottom. Named here
 * because "square" is the kind of claim that quietly stops being true.
 *
 * It used to be a 32px chip with a hairline border floating in a 64px track —
 * 9px of gap on three sides and 25px on the fourth, which read as a column of
 * postage stamps rather than a strip of product. The operator's ask was
 * literally "full width, no padding, edge to edge", and a photo is the one cell
 * content that gains from every pixel: it is what an operator matches against
 * the box in their hands.
 *
 * `object-cover` (not `contain`): a non-square source fills the square and
 * crops rather than letterboxing, because a band of empty ground inside the
 * cell would reintroduce exactly the inset this removes. The image can still
 * never set the row's height — the cell's height is fixed by
 * {@link COMPOUND_ROW_PX} and clips.
 */
export function CompoundThumb({ view }: { view: CompoundRowView }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-sunken">
      {view.thumbUrl ? (
        <Image
          src={view.thumbUrl}
          alt={view.title || 'Item photo'}
          // Intrinsic hint only — the painted size is `h-full w-full`, so a
          // density-scaled track still fills.
          width={COMPOUND_GUTTER_PX}
          height={COMPOUND_ROW_PX}
          className="h-full w-full object-cover"
          // The title beside it already names the item, so a slow photo must
          // never hold up the row paint.
          loading="lazy"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-text-faint">
          <Package className="h-4 w-4" aria-hidden />
        </div>
      )}
    </div>
  );
}

/**
 * Column 1 — the SELECTION mark, edge to edge, and never blank.
 *
 * A full-bleed square that always paints a checkmark: faded when the row is not
 * selected, solid on an accent ground when it is. That is the whole affordance
 * — an operator can see at a glance that the leftmost column is a checkmark
 * column, and can read straight down it to see what is ticked.
 *
 * **One face, no chrome flag.** The flat spreadsheets still choose between
 * `'always'` / `'selected-only'` / `'sheets'` gutter chrome; the compound row
 * does not, because it has one display method by rule. The face here is fixed.
 *
 * ## Interactive vs decorative is the presence of `onToggle`
 *
 * With a handler this is a real `role="checkbox"` button whose hit plane is the
 * entire 48px cell — an operator never has to aim at a glyph, and Playwright's
 * `.check()` keeps working. Without one it is the same face, `aria-hidden`,
 * for the surfaces where the ROW owns the toggle (click-select) — the row's own
 * `role="checkbox"` is the control there, and a second one would be a duplicate
 * a screen reader has to disambiguate.
 *
 * What the tick MEANS is the caller's business: bulk membership on Receiving,
 * Incoming and To-Ship; "this task is done" on Tasks. Same control, same
 * picture, different handler.
 */
export function CompoundSelect({
  checked,
  onToggle,
  label,
  disabled = false,
}: {
  checked: boolean | 'mixed';
  /** Present ⇒ a real checkbox. Absent ⇒ a decorative face (row owns toggle). */
  onToggle?: () => void;
  label: string;
  disabled?: boolean;
}) {
  if (!onToggle) {
    return <GridClickSelectFace checked={checked} className="absolute inset-0" />;
  }
  return (
    <GridRowCheckbox
      checked={checked}
      onToggle={onToggle}
      label={label}
      disabled={disabled}
      chrome="flush"
    />
  );
}

/**
 * TITLE column — what it is, over what somebody said about it.
 *
 * The note is the second line by rule: a code under a title is a duplicate of
 * the IDS column two tracks away, whereas a note is the only place a row can
 * say something the schema has no field for.
 *
 * ## Inline editing is a CAPABILITY, not a mode
 *
 * Pass `onCommitNote` and the note line becomes editable in place; omit it and
 * the same cell is read-only. Read-only-ness is the ABSENCE of the prop, never
 * a second component with the editor deleted — the house rule from
 * `pattern-evolution.md`.
 *
 * **This is why Orders does not pass it.** `order_notes` is a deliberately
 * append-only trail ("a note is a statement someone made at a time"), so an
 * in-place editor there would let the next staffer rewrite someone's statement
 * — the precise failure the append-only ruling exists to prevent. Receiving's
 * `receiving_line.notes` is a scalar working field with a real PATCH, so it
 * edits. Same cell, one prop, two correct behaviours.
 */
export function CompoundItem({
  view,
  onCommitNote,
}: {
  view: CompoundRowView;
  /** Present ⇒ the note line is editable in place. Absent ⇒ read-only. */
  onCommitNote?: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const editable = Boolean(onCommitNote);

  const noteLine = view.note ? (
    <HoverTooltip label={view.note} asChild>
      <CompoundLine>{view.note}</CompoundLine>
    </HoverTooltip>
  ) : editable ? (
    // An editable empty note needs a target to click. A bare blank line is
    // invisible affordance; the placeholder is the hit area.
    <CompoundLine className="text-text-faint italic">Add note…</CompoundLine>
  ) : null;

  const flagMark = view.flagMark ?? null;
  const titleLine = view.title ? (
    <HoverTooltip label={view.title} asChild>
      <CompoundLine>{view.title}</CompoundLine>
    </HoverTooltip>
  ) : (
    <span className="text-text-faint">Untitled</span>
  );

  return (
    <CompoundCell
      primary={
        flagMark ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <HoverTooltip label={flagMark.tip} focusable={false}>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', flagMark.dotClass)}>
                <span className="sr-only">{`Flagged ${flagMark.label}`}</span>
              </span>
            </HoverTooltip>
            {titleLine}
          </span>
        ) : (
          titleLine
        )
      }
      secondary={
        editable ? (
          <button
            type="button"
            // The ROW owns Enter/Space (open / select), so the note opens on
            // click only. Giving it those keys here would shadow the row's own
            // contract on every focused row in the grid.
            onClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
            className={cn(
              'flex min-w-0 items-center text-left',
              'hover:underline decoration-dotted underline-offset-2',
              focusRing('control'),
            )}
            aria-label={view.note ? `Edit note: ${view.note}` : 'Add note'}
          >
            {noteLine}
          </button>
        ) : (
          noteLine
        )
      }
    />
  );
}

/**
 * Column 3 — the row's IDENTITY: order number over its tracking number.
 *
 * **The leading mark is the brand DOT, never the type glyph.** That is the
 * house identity law (`AGENTS.md`), and it is why this cell composes
 * `BrandIdentityDot` + `OrderNumberMenuChip plain` / `TrackingNumberMenuChip
 * showIcon={false}` — exactly what Unbox History's `ReceivingOrderCell` and
 * `ReceivingTrackingCell` render.
 *
 * This shipped wrong once: it used `OrderIdChip` / `TrackingChip`, whose
 * default faces carry the `#` hash and the MapPin. Two tables then answered
 * "glyph or dot?" by two different rules — a fork hiding inside the SHARED
 * renderer, which is the worst place for one because it looks unified.
 *
 * **The dot's SHAPE says which identifier it marks:** filled for the order
 * handle, a ring for the carrier tracking number. Colour alone could not do it.
 * Both chips drop their own type mark on the stated promise that "the header
 * already labels ORDER / TRACK", and this cell stacks both under one header —
 * so an operator was left inferring the type from a brand palette, and on a row
 * whose order id and tracking number are the same digits (Incoming does this
 * routinely) there was nothing to infer from at all.
 *
 * Copy / Open / Edit verbs are not hand-rolled — the two menu chips own them.
 */
export function CompoundFulfillment({ view }: { view: CompoundRowView }) {
  const orderMeta = resolveMarketplacePlatformMeta(view.orderId, view.platformValue);
  const platformDot = platformMetaBrandDot(orderMeta);
  const orderOpenHref = view.orderId
    ? marketplaceOrderUrl(view.orderId, view.platformValue)
    : null;
  const carrierDot = view.tracking
    ? carrierBrandDotPaint(resolveCarrierBrand(view.tracking, view.carrier))
    : null;

  return (
    <CompoundCell
      primary={
        view.orderId ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <BrandIdentityDot className={platformDot.className} style={platformDot.style} />
            <OrderNumberMenuChip
              value={view.orderId}
              platformLabel={orderMeta.value ? orderMeta.label : null}
              openHref={orderOpenHref}
              plain
              dense
            />
          </span>
        ) : (
          <GridCellDash />
        )
      }
      secondary={
        view.tracking && carrierDot ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <BrandIdentityDot
              className={carrierDot.className}
              style={carrierDot.style}
              // RING = tracking. The filled dot on the line above is the order.
              variant="ring"
            />
            <TrackingNumberMenuChip
              value={view.tracking}
              carrierHint={view.carrier}
              showIcon={false}
              dense
            />
          </span>
        ) : (
          <GridCellDash />
        )
      }
    />
  );
}

/**
 * Tone → pill paint. Neutral by default: on a WMS floor most states are
 * unremarkable progress, and a grid where every row is coloured has no signal
 * left for the one row that needs a human. Saturated paint is reserved for
 * `alert` (hold / exception), which is the brief's "avoid red/yellow/green
 * unless it's a hard error" expressed as a rule rather than a palette.
 */
const STATE_TONE_CLASS: Record<CompoundStateTone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-surface-sunken text-text-muted', dot: 'bg-text-faint' },
  done: { pill: 'bg-surface-sunken text-text-default', dot: 'bg-emerald-500' },
  alert: { pill: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
};

/**
 * STATUS column — the state pill over the DELAY.
 *
 * The second line is late-ness, by rule, because that is the fact that reorders
 * an operator's queue. On time renders as a quiet "On time" rather than an
 * empty line: blank is ambiguous (no deadline? not computed? on time?), and a
 * floor reading a hundred rows should never have to resolve that ambiguity.
 */
export function CompoundState({ view }: { view: CompoundRowView }) {
  const tone = STATE_TONE_CLASS[view.stateTone];
  const delay = view.delay;
  const delayNode =
    delay && delay.overdue ? (
      <CompoundLine className="font-semibold text-rose-600">
        {delay.days}d late
      </CompoundLine>
    ) : (
      <CompoundLine className="text-text-faint">On time</CompoundLine>
    );

  const pill = (
    <span
      className={cn(
        // Flush-square: ops chrome carries no radius (kinetic-ledger law).
        'inline-flex min-w-0 items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tone.pill,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      <CompoundLine>{view.stateLabel}</CompoundLine>
    </span>
  );

  return (
    <CompoundCell
      primary={
        view.stateTip ? (
          <HoverTooltip label={view.stateTip} asChild>
            {pill}
          </HoverTooltip>
        ) : (
          pill
        )
      }
      secondary={
        view.delayTip ? (
          <HoverTooltip label={view.delayTip} asChild>
            {delayNode}
          </HoverTooltip>
        ) : (
          delayNode
        )
      }
    />
  );
}

/**
 * AMOUNT column — the money, end-aligned, over the arithmetic behind it.
 *
 * End-aligned and `tabular-nums` because that is what a money column is FOR: a
 * digit lines up under a digit, so an operator scanning a cart or a queue can
 * see which row is the big one without reading any of them. Left-aligned
 * currency in a ragged column defeats the only reason to have the column.
 *
 * A CREDIT (a trade-in, a refund) paints differently as well as carrying its
 * minus sign. One character of difference at the head of a tabular figure is
 * exactly the thing a tired eye slides over, and mistaking a −$120 trade-in for
 * a $120 sale is the expensive direction to be wrong in.
 *
 * `null` renders an empty track. A checklist item has no money, and an empty
 * cell is the honest answer — a `$0.00` would be a number nobody entered.
 */
export function CompoundAmount({ view }: { view: CompoundRowView }) {
  return (
    <CompoundCell
      align="end"
      primary={
        view.amount ? (
          <CompoundLine
            mono
            className={cn(
              'font-semibold',
              view.amountCredit ? 'text-text-success' : 'text-text-default',
            )}
          >
            {view.amount}
          </CompoundLine>
        ) : null
      }
      secondary={
        view.amountNote ? <CompoundLine mono>{view.amountNote}</CompoundLine> : null
      }
    />
  );
}

/**
 * ACTIONS column — the row's ⋮ menu.
 *
 * Replaces the bare chevron that used to sit here. The chevron could say only
 * one thing ("open"), so every other per-row verb had to live somewhere else:
 * Receiving hid its triage verbs behind a right-click context menu that nothing
 * on screen advertised, and the kiosk cart grew a naked ✕ that voided a line the
 * customer had already been shown. A ⋮ is discoverable, holds as many verbs as
 * a family has, and keeps "Open" as its first item so nothing regressed.
 *
 * `tabIndex={-1}`: the ROW is already the keyboard target, so a focusable
 * control on every row would double the tab stops in a 500-row grid. The menu
 * is reachable from the row's own context menu and from the record plane.
 *
 * Renders nothing when a family passes neither an open handler nor actions — an
 * affordance that looks clickable and does nothing is worse than an empty track.
 */
export function CompoundActions({
  onOpen,
  actions,
  label,
}: {
  onOpen?: () => void;
  actions?: readonly CompoundRowAction[];
  /** Names WHICH row the menu belongs to, for screen readers. */
  label?: string;
}) {
  const items: CompoundRowAction[] = [
    ...(onOpen ? [{ key: 'open', label: 'Open', onSelect: onOpen }] : []),
    ...(actions ?? []),
  ];
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          aria-label={label ? `Actions for ${label}` : 'Row actions'}
          data-row-actions
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center text-text-faint',
            // Quiet until the row is hovered — a column of ⋮ on every row is
            // ink competing with the data. Opacity composites off the main
            // thread, so this costs no layout on a scrolling grid.
            'opacity-0 transition-opacity group-hover/row:opacity-100',
            'hover:text-text-default focus-visible:opacity-100',
            focusRing('control'),
          )}
          // The row's own click would select or open — this is "show me the
          // verbs", which is a third thing.
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((action) => (
          <DropdownMenuItem
            key={action.key}
            disabled={action.disabled}
            onSelect={() => action.onSelect()}
            className={cn(action.tone === 'danger' && 'text-text-danger')}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Column 5 — the record affordance.
 *
 * `tabIndex={-1}`: the ROW is already the keyboard target, so a focusable
 * chevron on every row would double the tab stops in a 500-row grid for no new
 * capability. Renders nothing without an `onOpen` — a chevron that looks
 * clickable and does nothing is worse than an empty track.
 */
export function CompoundOpen({ onOpen }: { onOpen?: () => void }) {
  if (!onOpen) return null;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center text-text-faint opacity-0 transition-opacity',
        'group-hover/row:opacity-100 hover:text-text-default',
      )}
      onClick={(event) => {
        // The row's own click would toggle selection — this is "open".
        event.stopPropagation();
        onOpen();
      }}
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  );
}
