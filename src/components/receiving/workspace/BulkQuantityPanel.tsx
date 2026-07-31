'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { conditionLabel } from '@/lib/conditions';
import { cn } from '@/utils/_cn';
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
 *
 * Stamp row anatomy: qty display left · all actions justify-end.
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

  const applyLabel =
    splitOpen && remainder > 0 && secondaryLabel
      ? `Apply ${primaryCount} + ${remainder} ${secondaryLabel}`
      : `Apply to ${primaryCount}`;

  return (
    <div className="min-w-0 space-y-2 px-1" data-bulk-quantity-panel>
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

      {/* One-row stamp: qty display left · all actions justify-end */}
      <div className="flex min-w-0 items-center gap-2">
        <label className="inline-flex min-w-0 shrink-0 items-center gap-2">
          <span className="sr-only">Quantity</span>
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
            className={cn(
              'h-9 w-20 rounded-lg border border-border-soft bg-surface-card px-2.5',
              'font-mono text-role-data tabular-nums text-text-default',
              'disabled:cursor-not-allowed disabled:bg-surface-canvas disabled:text-text-faint',
              focusRing('field', 'accent'),
            )}
          />
          <span className="whitespace-nowrap text-role-caption text-text-soft">
            of{' '}
            <span className="font-mono tabular-nums text-text-default">{expected}</span>
          </span>
        </label>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-1 gap-y-1">
          {splitOpen ? (
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

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={onTrackEachUnit}
          >
            Track each unit
          </Button>

          <Button
            type="button"
            variant="primary"
            size="md"
            className="shrink-0"
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
            {applyLabel}
          </Button>
        </div>
      </div>

      {splitOpen ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-role-micro font-semibold uppercase tracking-widest text-text-soft">
            Remainder · {remainder} as
          </span>
          {remainder === 0 ? (
            <p className="text-role-caption text-text-faint">
              Lower the primary quantity to leave a remainder for a second grade.
            </p>
          ) : (
            <ConditionPills value={secondaryGrade} onChange={setSecondaryGrade} />
          )}
        </div>
      ) : null}
    </div>
  );
}
