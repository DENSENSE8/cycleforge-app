'use client';

/**
 * **The one group-parent band** — the thin row that sits above a fold whose
 * group holds more than one line, on EVERY slot-table peer.
 *
 * ## Why this is engine code and not a per-family row
 *
 * It was born inside `QueueGroupRow` (orders) while Unbox, Pickup, Unfound,
 * Repair, Bins, Warranty, Catalog and the report tables each hand-rolled their
 * own `renderGroup` — twenty-four of them, most painting no parent at all. That
 * is the fork the one engine exists to end: a family adds DATA, never
 * display. So the band moved here and every peer passes it facts.
 *
 * **Props are DATA, never `ReactNode`.** A family hands an identity, a carrier
 * list and a box count; it does not hand JSX. That is what stops the next lane
 * from smuggling a per-desk face in through a slot and forking the row again.
 *
 * ## What it paints (operator 2026-09-05)
 *
 * One line of identity — a source dot plus the PO or order chip — over one line
 * carrying the shipment story: a {@link BrandIdentityDot} `variant="ring"` per
 * DISTINCT carrier, then the box count.
 *
 *   ●  20-51978
 *   ○○ 2 boxes
 *
 * **Boxes, not lines.** A tracking number IS a box; "lines" is schema
 * vocabulary and staff do not use it on the floor.
 *
 * **One dot per carrier, not one chip per number.** The parent used to stack a
 * `TrackingNumberMenuChip` per tracking, which made the band TALLER than the
 * leaves under it — a row meant to read as lighter read as heavier. Colour is
 * the channel an operator scans in peripheral vision (USPS blue beside UPS
 * brown answers "who has it" with no reading at all), so the numbers move to
 * the cluster's accessible name and the chips are gone.
 *
 * ## Height is pinned, deliberately
 *
 * Every cell — painted or blank — takes `height: COMPOUND_ROW_PX`, and the row
 * takes the same `minHeight`. Nothing a family passes can grow the band, which
 * is the whole point: a parent that bulges breaks the sheet's rhythm and reads
 * as a different kind of object.
 *
 * ## Frozen columns cannot shear
 *
 * Unbox removed its old PO summary partly because it "sheared sticky columns
 * under h-scroll" — the summary did not reproduce the leaf's frozen geometry,
 * so the two planes slid apart. This row derives every frozen offset from the
 * SAME {@link gridFrozenLeft} call the leaves use and stamps
 * {@link LEDGER_GRID_FROZEN_CELL} on the same cells, so the parent and its
 * children are one rigid grid under horizontal scroll.
 *
 * ## The duplication objection
 *
 * Unbox's other reason for dropping its summary was that it "duplicated Order /
 * PO already on every leaf". REVERSED (operator 2026-09-14): "it must display
 * the order number for all the other rows, the child rows as well" — leaves
 * keep their full identity (order on line 1, tracking/box on line 2), band and
 * children paint the identical face, and the band's rolled facts sit above.
 * The old `quietIdentity` dashing is retired; the flag survives only as a
 * `data-group-child` marker.
 */

import { cloneElement, isValidElement, type ReactNode } from 'react';
import { CompoundCell } from '@/components/tables/compound/CompoundCell';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { CompoundSelect } from '@/components/tables/compound/CompoundCells';
import { CompoundEdgeRail } from '@/components/tables/compound/CompoundEdgeRail';
import { compoundSelectStatusMarks } from '@/components/tables/compound/compound-select-status';
import { renderCompoundGridCell } from '@/components/tables/compound/CompoundGridCell';
import {
  COMPOUND_GUTTER_CHEVRON_BAND_CLASS,
  COMPOUND_GUTTER_CHEVRON_GLYPH_CLASS,
  COMPOUND_GUTTER_RAIL_INSET_CLASS,
  COMPOUND_ROW_PX,
  SLOT_TABLE_GROUP_FOLD_INNER_CLASS,
} from '@/components/tables/compound/compound-row-chrome';
import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import { ChevronDown, ChevronRight } from '@/components/Icons';
import { gridDataCellClass, LEDGER_GRID_FROZEN_CELL } from '@/design-system/components/grid';
import { ledgerGridRowShellClass } from '@/design-system/components/grid/grid-cell-chrome';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { BrandIdentityDot, GridCellDash } from '@/components/ui/grid-cells';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { carrierBrandDotPaint, type CarrierBrandMeta } from '@/lib/carrier-brand';
import { orderBoxCountLabel } from '@/lib/orders/order-group-identity';
import type { FieldDisplayType } from '@/lib/tables/field-catalog/types';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export interface SlotTableGroupColumn {
  key: string;
  width: string;
  frozen?: boolean;
  fieldId?: string;
  slotIconKey?: string;
  slotDisplayType?: FieldDisplayType;
  slotStageLabels?: Readonly<{ done: string; pending: string }>;
  align?: 'start' | 'end' | 'center';
}

/**
 * What the fold IS. `kind` picks the house chip — a DATA discriminator, not a
 * render slot, so a family cannot pass its own face.
 */
export interface SlotTableGroupIdentity {
  kind: 'order' | 'po';
  /** The chip face — order number or PO number. */
  value: string;
  /** Source / platform dot beside the chip. */
  dot?: { className?: string; style?: { backgroundColor: string } };
  /** Marketplace deep link, when the family has one. */
  href?: string | null;
  /** Platform name for the chip's hover label. */
  platformLabel?: string | null;
}

export interface SlotTableGroupParentRowProps {
  identity: SlotTableGroupIdentity | null;
  /** Distinct carriers — one ring dot each. */
  carriers: readonly CarrierBrandMeta[];
  /** Distinct tracking numbers = boxes. */
  boxCount: number;
  /** Every tracking number, for the dot cluster's accessible name. */
  trackings: readonly string[];
  columns: readonly SlotTableGroupColumn[];
  /** Which mounted column carries the identity + boxes stack. */
  identityColumnKey: string;
  checked: boolean | 'mixed';
  onToggle: () => void;
  /**
   * What a checkbox click SELECTS — counted in items, because that is what the
   * gesture acts on. The row's own face still says boxes.
   */
  selectCount: number;
  /** When set, the select gutter paints a chevron on the subtitle track (aligned with "2 boxes"). */
  folded?: boolean;
  onToggleFold?: () => void;
  /** First-child compound view — title, dates, pick/pack, photo. Not grayed. */
  view?: CompoundRowView | null;
}

/** Cells that are chrome, not data — no inset, stretch to the gutter edges. */
function isGutterColumn(key: string): boolean {
  return key === 'select' || key === 'thumb';
}

/**
 * The multi-line fold wrapper. Singletons pass through — the leaf IS the
 * order, and wrapping it would draw a box around every row.
 *
 * NO outline here (operator 2026-09-14: "just one hairline below the rows for
 * multi items included in the PO — currently there is a full square around
 * it"). The 4-side envelope ring was retired: the group's close is the ONE
 * bottom hairline painted below — on the FOLD, not the leaf block, so it shows
 * in BOTH states (operator 2026-09-14: "it must display when it's opened or
 * closed, to display to the user that it's a multi-line-item row"):
 * collapsed → under the title band; expanded → under the last leaf.
 *
 * The close is a BORDER token, not body-text ink (operator 2026-09-15:
 * "instead of a black line displaying below the line"). It no longer has to
 * shout, because MEMBERSHIP is now spoken by the children themselves —
 * {@link SLOT_TABLE_GROUP_CHILD_RAIL_CLASS} on each child's identity track —
 * and this rule only has to say where the group ENDS. See
 * {@link SLOT_TABLE_GROUP_FOLD_INNER_CLASS} for why the black ink was
 * load-bearing before that and is not now.
 *
 * `role="rowgroup"` is load-bearing: the virtualizer shell is
 * `role="presentation"`, so this is what the table sees as the fold.
 */
export function SlotTableGroupFold({
  multi,
  children,
}: {
  multi: boolean;
  children: ReactNode;
}) {
  if (!multi) return children;
  return (
    <div role="rowgroup" data-slot-table-fold="" className="relative">
      {children}
      <span aria-hidden data-slot-table-fold-close="" className={SLOT_TABLE_GROUP_FOLD_INNER_CLASS} />
    </div>
  );
}

/**
 * The leaf block inside a multi-line {@link SlotTableGroupFold} — the expanded
 * product rows. Pure geometry/semantics now: the fold's close hairline lives on
 * {@link SlotTableGroupFold} so it paints in both fold states; this wrapper
 * adds no paint of its own (its bottom coincides with the fold's).
 *
 * Same contract as the fold: singletons pass through untouched (the leaf IS
 * the order). No `role` — the outer fold owns `role="rowgroup"`.
 */
export function SlotTableGroupFoldBody({
  multi,
  children,
}: {
  multi: boolean;
  children: ReactNode;
}) {
  if (!multi) return children;
  return (
    <div data-slot-table-fold-body="" className="relative">
      {children}
    </div>
  );
}

export function SlotTableGroupParentRow({
  identity,
  carriers,
  boxCount,
  trackings,
  columns,
  identityColumnKey,
  checked,
  onToggle,
  selectCount,
  folded = false,
  onToggleFold,
  view = null,
}: SlotTableGroupParentRowProps) {
  const boxLabel = orderBoxCountLabel(boxCount);
  const face = identity?.value?.trim() || '';
  const noun = identity?.kind === 'po' ? 'this PO' : 'this order';
  const selectLabel = `${selectCount} item${selectCount === 1 ? '' : 's'}`;
  const template = gridTemplate(columns);
  const frozenEdgeKey = [...columns].reverse().find((c) => c.frozen)?.key;
  // The parent band reports the SAME resting marks as its leaves (operator
  // 2026-09-15: "display out of stock status for the parent line item as
  // well"). The rollup is the family's — To-ship folds `is_urgent` /
  // `is_out_of_stock` / `has_exception` across the group before it hands over a
  // view — so this only has to read it, once, for both select faces below.
  const parentStatuses = view ? compoundSelectStatusMarks(view) : [];

  return (
    <div
      role="row"
      data-order-group-parent=""
      data-group-kind={identity?.kind ?? 'order'}
      aria-label={`${face || (identity?.kind === 'po' ? 'PO' : 'Order')} · ${boxLabel}`}
      // SELECTION FEEDBACK (operator 2026-09-15): the band washes when the
      // whole group is picked — parent-click or every child ticked both land
      // on `checked === true`, which is the same fact. Before this the leaves
      // turned blue under a white band and the operator could not tell a
      // fully-selected order from a partly-selected one without counting.
      //
      // `'mixed'` deliberately does NOT wash: a full-row fill would claim a
      // membership the group does not have, and the mixed square already says
      // "some". The fill comes from the engine cascade every leaf uses
      // (`ledgerRowFillClass` → QUEUE_ROW.selectedLedgerClass), so the band and
      // its children can never wash in two different blues.
      //
      // Idle it is a leaf's card ground — NOT a canvas wash. Operator
      // 2026-09-14: an expanded fold is an OUTLINE, not a grayed-out row.
      // `bg-surface-canvas` here painted the band gray-50 against white leaves,
      // which read as a disabled row rather than a parent. Opaque is still
      // required, not `transparent`: LEDGER_GRID_FROZEN_CELL is `bg-inherit`,
      // so a see-through row lets h-scrolled cells bleed under the sticky
      // identity columns — and `ledgerRowFillClass` answers `bg-surface-card`
      // when unselected, which is exactly that ground.
      //
      // `group/row`: the parent's select gutter carries the same resting-status
      // ⇄ check swap as a leaf (operator 2026-09-15), and that face is scoped
      // to the row hover group. Without the token the parent would sit on its
      // status glyph forever and never offer the checkbox.
      className={cn(
        'group/row',
        ledgerGridRowShellClass(false),
        ledgerRowFillClass({ selected: checked === true, capabilities: { rowTriageFlags: false } }),
      )}
      style={{ gridTemplateColumns: template, minHeight: COMPOUND_ROW_PX }}
    >
      {columns.map((col, i) => {
        const last = i === columns.length - 1;
        const frozenEdge = col.frozen && col.key === frozenEdgeKey ? true : undefined;
        const className = cn(
          gridDataCellClass(col, {
            rule: !last,
            inset: isGutterColumn(col.key) ? 'none' : 'cell',
            frozenClass: LEDGER_GRID_FROZEN_CELL,
          }),
          'overflow-hidden',
          isGutterColumn(col.key) && 'items-stretch p-0',
        );
        // Frozen offsets come from the SAME helper the leaves use — that is what
        // keeps the two planes from shearing under horizontal scroll.
        const style = {
          height: COMPOUND_ROW_PX,
          ...(col.frozen ? { left: gridFrozenLeft(columns, col.key) } : null),
        };

        if (col.key === 'select') {
          return (
            <div
              key={col.key}
              data-col="select"
              data-select-gutter
              // Same law as the leaf gutter: the rail is the CELL's, so it runs
              // the full row height whether or not a fold chevron splits the
              // box below the check.
              data-edge-mark-host=""
              data-frozen-edge={frozenEdge}
              className={cn(className, 'relative')}
              style={style}
              onClick={(event) => event.stopPropagation()}
            >
              {view?.edgeMark ? <CompoundEdgeRail mark={view.edgeMark} /> : null}
              {/*
                ONE select face, foldable or not: the mark plane is the whole
                cell and `CompoundSelect` pins the mark to the TOP, exactly as a
                leaf does. The old COMPOUND_TWO_LINE_CLASS stack boxed the
                control into a 23.5px half instead (see
                COMPOUND_GUTTER_CHEVRON_BAND_CLASS).
              */}
              <CompoundSelect
                checked={checked}
                chrome="hover"
                statuses={parentStatuses}
                onToggle={onToggle}
                label={
                  checked === true
                    ? `Deselect ${selectLabel} in ${face || noun}`
                    : `Select ${selectLabel} in ${face || noun}`
                }
              />
              {onToggleFold ? (
                /*
                  Fold chevron — a REACH affordance in EVERY state (operator
                  2026-09-15: "it should not display any collapse state, it
                  should only display on hover"). Stricter than the leaf's
                  detail chevron, which stands once open: this band already
                  says it is a fold, in words the glyph cannot improve on —
                  the identity line counts the boxes ("2 boxes") and the child
                  rows are either under it or not. So the glyph is only ever
                  an invitation, and it waits to be reached for.
                */
                <button
                  type="button"
                  className={cn(
                    'ds-raw-button group/group-fold flex items-center justify-center text-text-soft',
                    // Its own band under the top-pinned mark — the leaf
                    // gutter's law, so band and leaf read as one column.
                    COMPOUND_GUTTER_CHEVRON_BAND_CLASS,
                    // Same rail reservation as the mark above it — one
                    // vertical centre line down the gutter.
                    COMPOUND_GUTTER_RAIL_INSET_CLASS,
                    focusRing('control', 'neutral'),
                  )}
                  aria-expanded={!folded}
                  aria-label={
                    folded
                      ? `Show lines in ${face || noun}`
                      : `Hide lines in ${face || noun}`
                  }
                  data-group-fold=""
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFold();
                  }}
                >
                  <span
                    className={cn(
                      COMPOUND_GUTTER_CHEVRON_GLYPH_CLASS,
                      'transition-opacity',
                      'opacity-0 group-hover/row:opacity-100 group-focus-visible/group-fold:opacity-100 [@media(hover:none)]:opacity-100',
                    )}
                  >
                    {folded ? (
                      <ChevronRight className="h-3 w-3" aria-hidden />
                    ) : (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </button>
              ) : null}
            </div>
          );
        }

        if (col.key === identityColumnKey) {
          return (
            <div
              key={col.key}
              data-col={col.key}
              data-frozen-edge={frozenEdge}
              className={className}
              style={style}
            >
              <CompoundCell
                primary={
                  face ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      {identity?.dot ? (
                        <BrandIdentityDot
                          className={identity.dot.className}
                          style={identity.dot.style}
                        />
                      ) : null}
                      {/* Operator 2026-09-14: NO `#` glyph on the multi-line
                          band — POs paint the SAME plain order-chip face the
                          leaves use (ReceivingOrderCell's OrderNumberMenuChip
                          plain), so band and children answer "which id?" with
                          one grammar. PoChip's hash glyph is for surfaces
                          whose header does not already label the column. */}
                      <OrderNumberMenuChip
                        value={face}
                        platformLabel={identity?.platformLabel ?? null}
                        openHref={identity?.href ?? null}
                        plain
                        dense
                      />
                    </span>
                  ) : (
                    <GridCellDash />
                  )
                }
                secondary={
                  <span className="flex min-w-0 items-center gap-1.5">
                    {carriers.length > 0 ? (
                      <span
                        className="inline-flex shrink-0 items-center gap-1"
                        role="img"
                        aria-label={
                          trackings.length > 0
                            ? `${carriers.map((c) => c.label).join(', ')} — ${trackings.join(', ')}`
                            : undefined
                        }
                      >
                        {carriers.map((carrier) => {
                          const paint = carrierBrandDotPaint(carrier);
                          return (
                            <BrandIdentityDot
                              key={carrier.carrier}
                              className={paint.className}
                              style={paint.style}
                              variant="ring"
                            />
                          );
                        })}
                      </span>
                    ) : null}
                    {/* Operator 2026-09-14: plain text, NO chip wrapper. */}
                    <span className="truncate text-text-default">{boxLabel}</span>
                  </span>
                }
              />
            </div>
          );
        }

        if (view) {
          const painted = renderCompoundGridCell({
            col,
            columns,
            rule: !last,
            view,
          });
          if (painted && isValidElement(painted)) {
            return cloneElement(painted, { key: col.key });
          }
        }

        return (
          <div
            key={col.key}
            data-col={col.key}
            data-frozen-edge={frozenEdge}
            className={className}
            style={style}
          />
        );
      })}
    </div>
  );
}
