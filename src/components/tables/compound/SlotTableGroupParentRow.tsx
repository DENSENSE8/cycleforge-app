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
 * is the fork `table-engine-law.ts` exists to end: a family adds DATA, never
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
 * PO already on every leaf". The answer is `quietIdentity`: a surface that
 * mounts this band must dash the identity on its leaves so the fold speaks it
 * ONCE. Mounting the parent without quieting the leaves re-creates exactly the
 * noise that got the old summary deleted.
 */

import { CompoundCell } from '@/components/tables/compound/CompoundCell';
import { CompoundSelect } from '@/components/tables/compound/CompoundCells';
import { COMPOUND_ROW_PX } from '@/components/tables/compound/compound-row-chrome';
import { gridDataCellClass, LEDGER_GRID_FROZEN_CELL } from '@/design-system/components/grid';
import { ledgerGridRowShellClass } from '@/design-system/components/grid/grid-cell-chrome';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { BrandIdentityDot, GridCellDash } from '@/components/ui/grid-cells';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { PoChip } from '@/components/ui/CopyChip';
import { carrierBrandDotPaint, type CarrierBrandMeta } from '@/lib/carrier-brand';
import { orderBoxCountLabel } from '@/lib/orders/order-group-identity';
import { cn } from '@/utils/_cn';

export interface SlotTableGroupColumn {
  key: string;
  width: string;
  frozen?: boolean;
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
}

/** Cells that are chrome, not data — no inset, stretch to the gutter edges. */
function isGutterColumn(key: string): boolean {
  return key === 'select' || key === 'thumb';
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
}: SlotTableGroupParentRowProps) {
  const boxLabel = orderBoxCountLabel(boxCount);
  const face = identity?.value?.trim() || '';
  const noun = identity?.kind === 'po' ? 'this PO' : 'this order';
  const selectLabel = `${selectCount} item${selectCount === 1 ? '' : 's'}`;
  const template = gridTemplate(columns);
  const frozenEdgeKey = [...columns].reverse().find((c) => c.frozen)?.key;

  return (
    <div
      role="row"
      data-order-group-parent=""
      data-group-kind={identity?.kind ?? 'order'}
      aria-label={`${face || (identity?.kind === 'po' ? 'PO' : 'Order')} · ${boxLabel}`}
      className={cn(ledgerGridRowShellClass(false), 'bg-surface-canvas')}
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
              data-frozen-edge={frozenEdge}
              className={className}
              style={style}
              onClick={(event) => event.stopPropagation()}
            >
              <CompoundSelect
                checked={checked}
                chrome="always"
                onToggle={onToggle}
                label={
                  checked === true
                    ? `Deselect ${selectLabel} in ${face || noun}`
                    : `Select ${selectLabel} in ${face || noun}`
                }
              />
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
                      {identity?.kind === 'po' ? (
                        <PoChip value={face} dense />
                      ) : (
                        <OrderNumberMenuChip
                          value={face}
                          platformLabel={identity?.platformLabel ?? null}
                          openHref={identity?.href ?? null}
                          plain
                          dense
                        />
                      )}
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
                    <span className="truncate text-text-muted">{boxLabel}</span>
                  </span>
                }
              />
            </div>
          );
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
