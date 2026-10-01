'use client';

/**
 * **The one group-parent band** — the thin row that sits above a fold whose group holds more than one line, on EVERY compound DataTable peer.
 * ## What it paints (operator 2026-09-05)
 * PO already on every leaf". REVERSED (operator 2026-09-14): "it must display
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
  COMPOUND_GROUP_FOLD_INNER_CLASS,
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

interface CompoundGroupColumn {
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
export interface CompoundGroupIdentity {
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

interface CompoundGroupParentRowProps {
  identity: CompoundGroupIdentity | null;
  /** Distinct carriers — one ring dot each. */
  carriers: readonly CarrierBrandMeta[];
  /** Distinct tracking numbers = boxes. */
  boxCount: number;
  /** Every tracking number, for the dot cluster's accessible name. */
  trackings: readonly string[];
  columns: readonly CompoundGroupColumn[];
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
 * The multi-line fold wrapper.
 * NO outline here (operator 2026-09-14: "just one hairline below the rows for
 * in BOTH states (operator 2026-09-14: "it must display when it's opened or
 * The close is a BORDER token, not body-text ink (operator 2026-09-15:
 */
export function CompoundGroupFold({
  multi,
  children,
}: {
  multi: boolean;
  children: ReactNode;
}) {
  if (!multi) return children;
  return (
    <div role="rowgroup" data-compound-group-fold="" className="relative">
      {children}
      <span aria-hidden data-compound-group-fold-close="" className={COMPOUND_GROUP_FOLD_INNER_CLASS} />
    </div>
  );
}

/** The leaf block inside a multi-line {@link CompoundGroupFold} — the expanded product rows. */
export function CompoundGroupFoldBody({
  multi,
  children,
}: {
  multi: boolean;
  children: ReactNode;
}) {
  if (!multi) return children;
  return (
    <div data-compound-group-fold-body="" className="relative">
      {children}
    </div>
  );
}

export function CompoundGroupParentRow({
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
}: CompoundGroupParentRowProps) {
  const boxLabel = orderBoxCountLabel(boxCount);
  const face = identity?.value?.trim() || '';
  const noun = identity?.kind === 'po' ? 'this PO' : 'this order';
  const selectLabel = `${selectCount} item${selectCount === 1 ? '' : 's'}`;
  const template = gridTemplate(columns);
  const frozenEdgeKey = [...columns].reverse().find((c) => c.frozen)?.key;
  // The parent band reports the SAME resting marks as its leaves (operator 2026-09-15:
  const parentStatuses = view ? compoundSelectStatusMarks(view) : [];

  return (
    <div
      role="row"
      data-order-group-parent=""
      data-group-kind={identity?.kind ?? 'order'}
      aria-label={`${face || (identity?.kind === 'po' ? 'PO' : 'Order')} · ${boxLabel}`}
      // SELECTION FEEDBACK (operator 2026-09-15):
      // SELECTION FEEDBACK (operator 2026-09-15): the band washes when the
      // ⇄ check swap as a leaf (operator 2026-09-15), and that face is scoped
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
              {/* ONE select face, foldable or not: */}
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
                /* Fold chevron — a REACH affordance in EVERY state (operator 2026-09-15: */
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
                      {/*
 * Operator 2026-09-14:
 * Operator 2026-09-14: NO `#` glyph on the multi-line
 */}
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
