'use client';

/**
 * The rail body for EXACTLY TWO selected rows — occupant `detail:order-compare`
 * (plan Phase 3).
 *
 * A **read** plane, not a second record plane (D6): no merge, no bulk edit, no
 * inline correction. The moment it edits, it and the inspector are two editors
 * over one record and they drift. Editing stays at the record plane — deselect
 * to one row, or open `/o/[orderId]`.
 *
 * ONE SIGNAL: DIVERGENCE.
 * Divergent facts carry the ink and a leading dot; agreeing facts recede to
 * `text-text-soft`. That is why values render as plain typed text here instead
 * of through the `CopyChip` family the grid uses for the same identifiers: a
 * chip brings its own underline, icon and tone, so a column of them paints
 * every row at equal loudness and the one thing this pane exists to say stops
 * being legible. Identity display is the chip family's job on the surfaces
 * where identity IS the job; here the job is difference.
 *
 * Values are shown in FULL, never last-8 — a truncated serial or tracking
 * number hides the very characters that diverge.
 *
 * The verdict itself is in `lib/right-rail/order-compare-model.ts` (pure,
 * unit-tested); this file only paints it.
 *
 * **ONE band (2026-08-21).** The panel opened straight onto the shared
 * `RailSelectionBand`, so it had no title of its own and the host's `✕` sat over
 * a selection count. The house {@link DeskInspectorIndexShell} band now leads,
 * titled `Compare`, with the divergence verdict as its read-only metric — the
 * one fact this pane exists to say, in the one cell the contract reserves for a
 * metric. `stance='standalone'`: a compare opens from CHECKING TWO ROWS, not by
 * routing down an index, so there is nothing above it to go Back to. Dismiss
 * stays the host's singleton `✕` → `closeRightPanel`, which runs `handleClose`
 * (the selection clear) as the occupant half.
 */

import { useMemo, useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import { GridCellDash } from '@/components/ui/grid-cells';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Checkbox } from '@/design-system/primitives';
import { formatQueueRowDateCell } from '@/components/dashboard/orders-queue/helpers';
import { conditionLabel } from '@/lib/conditions';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { emitToggleAll } from '@/lib/selection/table-selection';
import {
  isRailOccupantActive,
  resolveRailOccupancy,
} from '@/lib/right-rail/selection-occupancy';
import {
  buildOrderCompare,
  type CompareFactKind,
  type OrderCompareFact,
  type OrderCompareRow,
} from '@/lib/right-rail/order-compare-model';
import { cn } from '@/utils/_cn';
import {
  RailActionRegion,
  RailSelectionBand,
  useRailActionSnapshot,
} from './OrderRailActions';
import {
  OrdersViewChromeBridge,
  useOrdersViewChromeOptional,
} from '@/components/outbound/orders/orders-view-chrome-context';

/**
 * Resolve a raw fact to its display string through the presentation SoT for its
 * kind — never a page-local label map. `null` means the row has no answer and
 * the caller renders the house em dash.
 */
function displayValue(raw: string | null, kind: CompareFactKind): string | null {
  if (raw === null) return null;
  if (kind === 'condition') return conditionLabel(raw, 'table');
  // Platform paints via {@link PlatformMark} in CompareValue — never typed prose.
  if (kind === 'platform') return raw;
  // Same helper the grid's own Date cell composes, so the pane and the row
  // behind it can never print two different days for one order.
  if (kind === 'date') return formatQueueRowDateCell(raw)?.label ?? raw;
  return raw;
}

/** Numeric and identifier tracks get the typography their content needs;
 *  everything else stays body text. */
function valueClassFor(kind: CompareFactKind): string {
  if (kind === 'id') return 'font-mono break-all';
  if (kind === 'qty' || kind === 'date') return 'tabular-nums';
  return 'break-words';
}

function CompareValue({
  fact,
  side,
}: {
  fact: OrderCompareFact;
  side: 'left' | 'right';
}) {
  const raw = side === 'left' ? fact.left : fact.right;
  if (fact.kind === 'platform') {
    if (raw === null) return <GridCellDash />;
    const meta = sourcePlatformMeta(raw);
    if (!meta.value && !raw) return <GridCellDash />;
    return (
      <HoverTooltip label={meta.label || raw} asChild focusable={false}>
        <span
          className={cn(
            'inline-flex shrink-0',
            fact.diverges ? 'opacity-100' : 'opacity-70',
          )}
          aria-label={meta.label || raw}
        >
          <PlatformMark platformValue={meta.value || raw} meta={meta.value ? meta : undefined} />
        </span>
      </HoverTooltip>
    );
  }
  const text = displayValue(raw, fact.kind);
  if (text === null) return <GridCellDash />;
  return (
    <span
      className={cn(
        'min-w-0 text-role-caption',
        valueClassFor(fact.kind),
        // The divergence read: differing facts hold default ink, agreeing ones
        // step back so the eye lands only on what is actually different.
        fact.diverges ? 'text-text-default' : 'text-text-soft',
      )}
    >
      {text}
    </span>
  );
}

function CompareFactRow({ fact }: { fact: OrderCompareFact }) {
  return (
    <li className="px-4 py-2">
      <div className="flex items-center gap-1.5">
        {/* Non-colour redundancy for the divergence signal — ink alone would
            carry it for a sighted operator only. */}
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            fact.diverges ? 'bg-amber-500' : 'bg-transparent',
          )}
          aria-hidden
        />
        <p
          className={cn(
            'truncate text-role-eyebrow uppercase tracking-widest',
            fact.diverges ? 'text-text-muted' : 'text-text-soft',
          )}
        >
          {fact.label}
        </p>
        {fact.diverges ? <span className="sr-only">differs</span> : null}
      </div>
      <div className="mt-0.5 grid grid-cols-2 gap-x-3 pl-3">
        <CompareValue fact={fact} side="left" />
        <CompareValue fact={fact} side="right" />
      </div>
    </li>
  );
}

export function OrderRailCompare() {
  const { scope, rows } = useRailActionSnapshot();
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const viewChrome = useOrdersViewChromeOptional();

  const occupancy = useMemo(
    () => resolveRailOccupancy((rows as OrderCompareRow[]).map((r) => Number(r.id))),
    [rows],
  );
  // Gated through the resolver's own helper so this and `OrderRailShell` can
  // never both hold a claim on the single slot.
  const active = isRailOccupantActive(occupancy, 'compare');

  const compare = useMemo(() => {
    const [left, right] = rows as OrderCompareRow[];
    if (!left || !right) return null;
    // Selection order decides the columns (the resolver preserves it), so the
    // two sides cannot swap under the operator mid-read.
    return buildOrderCompare(left, right);
  }, [rows]);

  // D4: closing the rail CLEARS the selection. With the capsule gone this is
  // the only dismissal affordance on the surface.
  const handleClose = () => {
    if (scope) emitToggleAll(scope, 'none');
  };

  const visibleFacts = compare
    ? differencesOnly
      ? compare.facts.filter((f) => f.diverges)
      : compare.facts
    : [];

  return (
    <DetailStackRailRegistrar
      // Stable per MODE, never per record (D5) — folding the two ids into the
      // id would exit/enter the whole panel on every checkbox.
      id="detail:order-compare"
      enabled={active && compare !== null}
      onClose={handleClose}
      modal={false}
      edgeCollapse
      collapsedStrip={false}
      ariaLabel="Comparing 2 orders"
    >
      <OrdersViewChromeBridge value={viewChrome}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
        <DeskInspectorIndexShell
          stance="standalone"
          title="Compare"
          ariaLabel="Comparing 2 orders"
          testId="order-compare"
          headerRightSlot={
            compare ? (
              // A READ-ONLY metric, which is exactly what this cell is for — the
              // verdict, never a verb. Select all / Clear stay on the selection
              // band below, where the roster shells also keep them.
              <span className="flex h-full shrink-0 items-center px-2 text-role-eyebrow uppercase tracking-widest text-text-soft">
                {compare.divergentCount === 0
                  ? 'Agree'
                  : `${compare.divergentCount}/${compare.comparableCount} differ`}
              </span>
            ) : null
          }
          body={
            // `h-full` + column flex inside the shell's scrollport: the facts
            // list keeps its OWN scroller, so the selection band and the filter
            // stay pinned instead of scrolling away with a long compare.
            <div className="flex h-full min-h-0 flex-col">
              <RailSelectionBand />
              {active && viewChrome ? (
                <div
                  className="flex h-9 min-w-0 shrink-0 items-center justify-end gap-2 border-b border-border-hairline px-2"
                  role="toolbar"
                  aria-label="Orders view topics"
                >
                </div>
              ) : null}

              {compare ? (
                <>
                  {/* Compare-scoped chrome lives here rather than inside the shared
                      RailSelectionBand, which the 3+ roster also mounts. */}
                  <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-4 py-2">
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                      <Checkbox
                        checked={differencesOnly}
                        onCheckedChange={(next) => setDifferencesOnly(next === true)}
                      />
                      <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                        Differences only
                      </span>
                    </label>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {visibleFacts.length === 0 ? (
                      // Settled-with-nothing is a POSITIVE answer on this pane — the
                      // two orders agree on every comparable fact. Not an absence, so
                      // not a dashed teaching box.
                      <p className="px-4 py-6 text-center text-role-caption text-text-soft">
                        No differences between these two orders.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border-soft">
                        {visibleFacts.map((fact) => (
                          <CompareFactRow key={fact.key} fact={fact} />
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          }
        />

        <RailActionRegion />
      </div>
      </OrdersViewChromeBridge>
    </DetailStackRailRegistrar>
  );
}
