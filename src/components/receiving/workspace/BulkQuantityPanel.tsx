'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { conditionLabel } from '@/lib/conditions';
import { cn } from '@/utils/_cn';
import { ConditionPills } from './ConditionPills';

interface Props {
  quantityExpected: number;
  /** Line-level / shared grade — seeds the primary picker. */
  lineCondition: string | null | undefined;
  disabled?: boolean;
  /** Optional line-level no-serial control (Units / legacy roll-up header). */
  noSerialControl?: ReactNode;
  /**
   * When true, skip the condition bar — parent already mounts
   * {@link PoLineCaptureRow} above. Apply reads {@link lineCondition}.
   */
  hideCondition?: boolean;
  /**
   * Unbox progressive centre: full condition names + edge-to-edge bar.
   * Displays / non-progressive keep compact pill abbreviations.
   */
  progressive?: boolean;
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
 * Progressive Unbox = flush full-width h-11 band under the capture face
 * (host `p-0` / `gap-0` — never decorative `px-*` / `pb-*` around the stamp).
 */
export function BulkQuantityPanel({
  quantityExpected,
  lineCondition,
  disabled = false,
  noSerialControl,
  hideCondition = false,
  progressive = false,
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

  const gradeFromLine = lineCondition
    ? String(lineCondition).toUpperCase()
    : null;
  const effectivePrimary = hideCondition
    ? (gradeFromLine ?? primaryGrade)
    : primaryGrade;

  const remainder = Math.max(0, expected - primaryCount);
  const splitValid =
    !splitOpen ||
    (remainder > 0 &&
      !!secondaryGrade &&
      secondaryGrade !== effectivePrimary);

  const canApply =
    !!effectivePrimary &&
    primaryCount > 0 &&
    primaryCount <= expected &&
    splitValid;

  const secondaryLabel = secondaryGrade
    ? conditionLabel(secondaryGrade, progressive ? 'full' : 'pill')
    : null;

  const applyLabel =
    splitOpen && remainder > 0 && secondaryLabel
      ? `Apply ${primaryCount} + ${remainder} ${secondaryLabel}`
      : `Apply to ${primaryCount}`;

  return (
    <div
      className={cn(
        'min-w-0',
        // Progressive Unbox: flush instrument (host p-0 gap-0) — never space-y /
        // decorative pad. Displays / non-progressive keep a soft stack.
        progressive ? 'space-y-0 p-0' : 'space-y-2 px-1',
      )}
      data-bulk-quantity-panel
      data-bulk-progressive={progressive || undefined}
    >
      {hideCondition ? null : (
        <div
          className={cn(
            'flex min-w-0 items-stretch gap-0',
            progressive
              ? 'h-11 w-full border-b border-border-hairline divide-x divide-border-soft'
              : 'items-start gap-2',
          )}
        >
          <div className="min-w-0 flex-1">
            <ConditionPills
              value={primaryGrade}
              labelVariant={progressive ? 'full' : 'pill'}
              layout={progressive ? 'barDistribute' : 'scroll'}
              onChange={(next) => {
                setPrimaryGrade(next);
                if (secondaryGrade === next) setSecondaryGrade(null);
              }}
            />
          </div>
          {noSerialControl ? (
            <div
              className={cn(
                'shrink-0',
                progressive && 'flex h-11 w-11 items-stretch *:size-full',
              )}
            >
              {noSerialControl}
            </div>
          ) : null}
        </div>
      )}

      {/*
        One-row stamp: qty left · actions right.
        Progressive = edge-to-edge h-11 band (same rhythm as PoLineCaptureRow /
        UnboxDockHost) — never host px/pb air around the controls.
      */}
      <div
        className={cn(
          'flex min-w-0',
          progressive
            ? cn(
                'h-11 w-full items-stretch gap-0 overflow-hidden',
                'border-b border-border-hairline bg-surface-card',
                'divide-x divide-border-soft',
                cornerClass('flush'),
              )
            : 'items-center gap-2',
        )}
      >
        <label
          className={cn(
            'inline-flex min-w-0 shrink-0 items-center',
            progressive ? 'h-full gap-0' : 'gap-2',
          )}
        >
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
              progressive
                ? cn(
                    cornerClass('flush'),
                    'h-full w-24 border-0 bg-surface-canvas px-3',
                  )
                : 'h-9 w-20 rounded-lg border border-border-soft bg-surface-card px-2.5',
              'font-mono text-role-data tabular-nums text-text-default',
              'disabled:cursor-not-allowed disabled:bg-surface-canvas disabled:text-text-faint',
              focusRing('field', 'accent'),
            )}
          />
          <span
            className={cn(
              'whitespace-nowrap text-role-caption text-text-soft',
              progressive && 'flex h-full items-center px-3',
            )}
          >
            of{' '}
            <span className="font-mono tabular-nums text-text-default">{expected}</span>
          </span>
        </label>

        <div
          className={cn(
            'flex min-w-0 flex-1',
            progressive
              ? 'h-full items-stretch justify-end gap-0 divide-x divide-border-soft'
              : 'flex-wrap items-center justify-end gap-x-1 gap-y-1',
          )}
        >
          {splitOpen ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={progressive ? 'h-full rounded-none px-3' : undefined}
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
              className={progressive ? 'h-full rounded-none px-3' : undefined}
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
            className={progressive ? 'h-full rounded-none px-3' : undefined}
            disabled={disabled}
            onClick={onTrackEachUnit}
          >
            Track each unit
          </Button>

          <Button
            type="button"
            variant="primary"
            size="md"
            className={cn(
              'shrink-0',
              progressive && cn(cornerClass('flush'), 'h-full rounded-none'),
            )}
            disabled={disabled || !canApply}
            onClick={() => {
              if (!effectivePrimary) return;
              onApply({
                primaryGrade: effectivePrimary,
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
        <div
          className={cn(
            'flex min-w-0 flex-wrap items-center gap-2',
            progressive
              ? 'w-full border-b border-border-hairline p-0'
              : null,
          )}
        >
          <span
            className={cn(
              'text-role-micro font-semibold uppercase tracking-widest text-text-soft',
              progressive && 'flex h-11 items-center px-3',
            )}
          >
            Remainder · {remainder} as
          </span>
          {remainder === 0 ? (
            <p
              className={cn(
                'text-role-caption text-text-faint',
                progressive && 'flex h-11 items-center pr-3',
              )}
            >
              Lower the primary quantity to leave a remainder for a second grade.
            </p>
          ) : (
            <div className={cn('min-w-0 flex-1', progressive && 'h-11')}>
              <ConditionPills
                value={secondaryGrade}
                labelVariant={progressive ? 'full' : 'pill'}
                layout={progressive ? 'barDistribute' : 'scroll'}
                onChange={setSecondaryGrade}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
