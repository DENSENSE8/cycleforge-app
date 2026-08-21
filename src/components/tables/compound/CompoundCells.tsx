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
 * `data-col`, highlight style — stays with the family, because that wrapper is
 * where per-staff column display and the frozen-pane token are applied and
 * those are resolved from the family's own column model.
 */

import { useState } from 'react';
import Image from 'next/image';
import { LedgerCellEditor } from '@/design-system/components/grid';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { ChevronRight, Package } from '@/components/Icons';
import { BrandIdentityDot, GridCellDash } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import { carrierBrandDotPaint, resolveCarrierBrand } from '@/lib/carrier-brand';
import { platformMetaBrandDot, sourcePlatformMeta } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';
import { CompoundCell, CompoundLine } from './CompoundCell';
import { COMPOUND_THUMB_PX } from './compound-row-chrome';
import type { CompoundRowView, CompoundStateTone } from './compound-row-model';

/**
 * Column 1 — the visual anchor: one square centred against the row box, so it
 * reads as a single object beside two lines rather than a third stacked
 * element. Fixed in BOTH axes: a non-square source letterboxes inside the row
 * and can never set the row's height.
 */
export function CompoundThumb({ view }: { view: CompoundRowView }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden border border-border-hairline bg-surface-sunken"
      style={{ width: COMPOUND_THUMB_PX, height: COMPOUND_THUMB_PX }}
    >
      {view.thumbUrl ? (
        <Image
          src={view.thumbUrl}
          alt={view.title || 'Item photo'}
          width={COMPOUND_THUMB_PX}
          height={COMPOUND_THUMB_PX}
          className="h-full w-full object-cover"
          // The title beside it already names the item, so a slow photo must
          // never hold up the row paint.
          loading="lazy"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-text-faint">
          <Package className="h-3.5 w-3.5" aria-hidden />
        </div>
      )}
    </div>
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

  const noteText = view.note ?? '';
  const noteLine = view.note ? (
    <HoverTooltip label={view.note} asChild>
      <CompoundLine>{view.note}</CompoundLine>
    </HoverTooltip>
  ) : editable ? (
    // An editable empty note needs a target to click. A bare blank line is
    // invisible affordance; the placeholder is the hit area.
    <CompoundLine className="text-text-faint italic">Add note…</CompoundLine>
  ) : null;

  return (
    <CompoundCell
      primary={
        view.title ? (
          <HoverTooltip label={view.title} asChild>
            <CompoundLine>{view.title}</CompoundLine>
          </HoverTooltip>
        ) : (
          <span className="text-text-faint">Untitled</span>
        )
      }
      secondary={
        editing && onCommitNote ? (
          <LedgerCellEditor
            variant="text"
            initialValue={noteText}
            ariaLabel="Edit note"
            placeholder="Note"
            className="text-xs"
            onCommit={(next) => onCommitNote(next)}
            onClose={() => setEditing(false)}
          />
        ) : editable ? (
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
 * renderer, which is the worst place for one because it looks unified. The
 * header already names the column; the body carries brand identity.
 *
 * Copy / Open / Edit verbs are not hand-rolled — the two menu chips own them.
 */
export function CompoundFulfillment({ view }: { view: CompoundRowView }) {
  const platformDot = platformMetaBrandDot(sourcePlatformMeta(view.platformValue));
  const carrierDot = view.tracking
    ? carrierBrandDotPaint(resolveCarrierBrand(view.tracking, view.carrier))
    : null;

  return (
    <CompoundCell
      primary={
        view.orderId ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <BrandIdentityDot className={platformDot.className} style={platformDot.style} />
            <OrderNumberMenuChip value={view.orderId} plain dense />
          </span>
        ) : (
          <GridCellDash />
        )
      }
      secondary={
        view.tracking && carrierDot ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <BrandIdentityDot className={carrierDot.className} style={carrierDot.style} />
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

  return (
    <CompoundCell
      primary={
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
