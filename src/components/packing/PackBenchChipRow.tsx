'use client';

/**
 * Per-bench count chips — the compact secondary row under a Ready-to-Pack /
 * To-ship KPI band.
 *
 * ONE anatomy, two consumers, and the ledgers stay separate by construction:
 * Ready-to-Pack passes LOOSE-UNIT counts (`unit_pack_placements`), To-ship
 * passes ORDER counts (`order_pack_placements`). Each row is labelled with what
 * it counts and renders its own strip — a merged number across the two ledgers
 * is the double-count the SoT forbids (`.claude/rules/source-of-truth.md` →
 * Pack placement).
 *
 * It is not a KPI tile: a bench breakdown is context beside the aggregate, not
 * an attention metric competing for the band's severity slots.
 */

import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';

interface PackBenchChipRowItem {
  locationId: number;
  locationName: string;
  locationKind: string;
  count: number;
}

const CHIP_BASE =
  'inline-flex items-center gap-1 rounded-none inset-chip text-role-micro uppercase ' +
  'tracking-widest ring-1 ring-inset';
/** Staged vs empty is the only tone here — a bench count is not a lifecycle state. */
const CHIP_STAGED = 'bg-blue-50 text-blue-700 ring-blue-200';
const CHIP_EMPTY = 'bg-surface-sunken text-text-faint ring-border-soft';
const CHIP_ACTIVE = 'bg-blue-600 text-white ring-blue-600';

export function PackBenchChipRow({
  label,
  rows,
  testId,
  activeLocationId,
  onSelect,
  itemNoun,
}: {
  /** What these counts are OF — always rendered, so the two ledgers never blur. */
  label: string;
  rows: readonly PackBenchChipRowItem[];
  /** Chip test-id prefix; the row itself is `{testId}-strip`. */
  testId: string;
  /** Bench currently filtered on (To-ship `?packStation=`); omit for read-only rows. */
  activeLocationId?: number | null;
  /** When set, chips become filter toggles. Omit for a pure readout. */
  onSelect?: (row: PackBenchChipRowItem) => void;
  /** Singular noun for the accessible label — "order", "unit". */
  itemNoun: string;
}) {
  // Honest absence: no benches configured means no row, not an empty frame.
  if (rows.length === 0) return null;

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1 border-t border-border-soft px-2 py-1"
      data-testid={`${testId}-strip`}
      aria-label={label}
    >
      <span className="mr-1 text-role-micro uppercase tracking-widest text-text-faint">
        {label}
      </span>
      {rows.map((row) => {
        const active = activeLocationId != null && activeLocationId === row.locationId;
        const tone = active ? CHIP_ACTIVE : row.count > 0 ? CHIP_STAGED : CHIP_EMPTY;
        const shortLabel = packBenchShortLabel(row);
        const countLabel = `${row.locationName}: ${row.count} ${itemNoun}${
          row.count === 1 ? '' : 's'
        }`;
        const body = (
          <>
            {shortLabel}
            <span className="tabular-nums" data-testid={`${testId}-count-${row.locationId}`}>
              {row.count}
            </span>
          </>
        );

        if (!onSelect) {
          return (
            <span
              key={row.locationId}
              data-testid={`${testId}-${row.locationId}`}
              className={cn(CHIP_BASE, tone)}
              title={countLabel}
            >
              {body}
            </span>
          );
        }

        return (
          <button
            key={row.locationId}
            type="button"
            data-testid={`${testId}-${row.locationId}`}
            aria-pressed={active}
            title={`${countLabel}. Click to filter the board to this bench.`}
            onClick={() => onSelect(row)}
            className={cn(CHIP_BASE, tone, focusRing('control', 'accent'))}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
