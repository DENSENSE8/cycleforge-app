'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/design-system/primitives';
import { conditionLabel } from '@/lib/conditions';
import { ConditionPills } from './ConditionPills';

interface Props {
  quantityExpected: number;
  /** Line-level / shared grade — seeds the primary picker. */
  lineCondition: string | null | undefined;
  disabled?: boolean;
  /** Optional line-level no-serial control (check variant) for the roll-up header. */
  noSerialControl?: ReactNode;
  /** Apply grades to materialised units (primary count + optional secondary remainder). */
  onApply: (input: {
    primaryGrade: string;
    primaryCount: number;
    secondaryGrade: string | null;
  }) => void;
  /** Escape hatch into capped per-unit / serial mode. */
  onTrackEachUnit: () => void;
}

/**
 * Qty roll-up surface for high-qty identical lines (AliExpress-style bulk).
 * One composition: grade + count (+ optional 2-way condition split). Zero
 * per-unit DOM rows — stamps via the parent's mark helpers.
 */
export function BulkQuantityPanel({
  quantityExpected,
  lineCondition,
  disabled = false,
  noSerialControl,
  onApply,
  onTrackEachUnit,
}: Props) {
  const expected = Math.max(1, Math.floor(quantityExpected) || 1);
  const [primaryGrade, setPrimaryGrade] = useState<string | null>(
    lineCondition ? String(lineCondition).toUpperCase() : null,
  );
  const [primaryCount, setPrimaryCount] = useState(expected);
  const [splitOpen, setSplitOpen] = useState(false);
  const [secondaryGrade, setSecondaryGrade] = useState<string | null>(null);

  const remainder = Math.max(0, expected - primaryCount);
  const splitValid =
    !splitOpen ||
    (remainder > 0 && !!secondaryGrade && secondaryGrade !== primaryGrade);

  const canApply =
    !!primaryGrade && primaryCount > 0 && primaryCount <= expected && splitValid;

  const secondaryLabel = secondaryGrade
    ? conditionLabel(secondaryGrade, 'pill')
    : null;

  return (
    <div className="min-w-0 space-y-3 px-1" data-bulk-quantity-panel>
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <ConditionPills
            value={primaryGrade}
            onChange={(next) => {
              setPrimaryGrade(next);
              if (secondaryGrade === next) setSecondaryGrade(null);
            }}
          />
        </div>
        {noSerialControl ? <div className="shrink-0">{noSerialControl}</div> : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-role-micro font-semibold uppercase tracking-widest text-text-soft">
            Quantity
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={expected}
            value={primaryCount}
            disabled={disabled}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              if (!Number.isFinite(n)) return;
              setPrimaryCount(Math.max(1, Math.min(expected, n)));
            }}
            className="h-10 w-24 rounded-lg border border-border-soft bg-surface-card px-3 font-mono text-role-data tabular-nums text-text-default focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          />
        </label>
        <p className="pb-2 text-role-caption text-text-soft">
          of <span className="font-mono tabular-nums text-text-default">{expected}</span> expected
        </p>
      </div>

      {splitOpen ? (
        <div className="space-y-2 rounded-lg border border-border-soft bg-surface-canvas/60 px-3 py-2.5">
          <p className="text-role-micro font-semibold uppercase tracking-widest text-text-soft">
            Remainder · {remainder} as
          </p>
          {remainder === 0 ? (
            <p className="text-role-caption text-text-faint">
              Lower the primary quantity to leave a remainder for a second grade.
            </p>
          ) : (
            <ConditionPills value={secondaryGrade} onChange={setSecondaryGrade} />
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setSplitOpen(false);
              setSecondaryGrade(null);
              setPrimaryCount(expected);
            }}
          >
            Clear split
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || expected < 2}
          onClick={() => {
            setSplitOpen(true);
            if (primaryCount >= expected) {
              setPrimaryCount(Math.max(1, expected - 1));
            }
          }}
        >
          Split remainder by condition
        </Button>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={disabled || !canApply}
          onClick={() => {
            if (!primaryGrade) return;
            onApply({
              primaryGrade,
              primaryCount,
              secondaryGrade: splitOpen && remainder > 0 ? secondaryGrade : null,
            });
          }}
        >
          Apply to {primaryCount}
          {splitOpen && remainder > 0 && secondaryLabel
            ? ` + ${remainder} ${secondaryLabel}`
            : ''}{' '}
          units
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          disabled={disabled}
          onClick={onTrackEachUnit}
        >
          Track each unit
        </Button>
      </div>
    </div>
  );
}
