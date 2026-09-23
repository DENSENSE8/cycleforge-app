'use client';

import { Minus, Plus } from '@/components/Icons';
import { DeferredQtyInput, IconButton } from '@/design-system/primitives';

export interface FbaQtyStepperProps {
  value: number;
  onChange: (next: number) => void;
  /** FNSKU for accessible labels (optional). */
  fnsku?: string;
  /** Red styling when qty is at or below this threshold (default: 0). */
  dangerThreshold?: number;
  /** Amber styling when qty exceeds this (used in paired review). */
  warnAbove?: number;
}

/**
 * Vertical Plus / Input / Minus qty stepper used across the FBA sidebar.
 *
 * Replaces the triplicated JSX in FbaPairedReviewPanel, TrackingGroup,
 * and FbaShipmentCard.
 */
export function FbaQtyStepper({
  value,
  onChange,
  fnsku,
  dangerThreshold = 0,
  warnAbove,
}: FbaQtyStepperProps) {
  const isDanger = value <= dangerThreshold;
  const isWarn = warnAbove !== undefined && value > warnAbove;

  const inputBorder = isWarn
    ? 'border-border-warning text-text-warning'
    : isDanger
      ? 'border-border-danger text-text-danger'
      : 'border-border-soft text-text-default';

  return (
    <div className="flex flex-col items-center">
      <IconButton
        icon={<Plus className="h-3 w-3" />}
        onClick={(e) => { e.stopPropagation(); onChange(value + 1); }}
        ariaLabel={fnsku ? `Increase ${fnsku} quantity` : 'Increase quantity'}
        radius="flush"
        className="flex h-6 w-10 items-center justify-center border border-border-soft hover:bg-surface-hover"
      />
      <DeferredQtyInput
        value={value}
        min={0}
        onChange={(v) => onChange(Math.max(0, v))}
        onClick={(e) => e.stopPropagation()}
        className={`h-7 w-10 border-x bg-surface-card text-center text-role-caption font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${inputBorder}`}
      />
      <IconButton
        icon={<Minus className={`h-3 w-3 ${value <= 1 ? 'text-text-danger' : 'text-text-soft'}`} />}
        onClick={(e) => { e.stopPropagation(); onChange(value - 1); }}
        disabled={value <= 0}
        ariaLabel={fnsku ? `Decrease ${fnsku} quantity` : 'Decrease quantity'}
        radius="flush"
        className={`flex h-6 w-10 items-center justify-center border disabled:opacity-40 ${
          value <= 1
            ? 'border-border-danger hover:bg-surface-danger'
            : 'border-border-soft hover:bg-surface-hover'
        }`}
      />
    </div>
  );
}

/** Read-only qty display (used in non-editable shipment cards). */
export function FbaQtyDisplay({ value }: { value: number }) {
  return (
    <div className="flex shrink-0 flex-col items-center text-center px-2">
      <span className="text-sm font-semibold tabular-nums text-text-default">{value}</span>
      <span className="text-role-eyebrow uppercase tracking-widest text-text-faint">qty</span>
    </div>
  );
}
