'use client';

/**
 * Trailing Delete peer for Workbench inspector action floors — an equal-width
 * spread peer with the same opaque raised face as its icon siblings, gapped
 * from them (owner 2026-10-03: floating bottom buttons, never a flush cell).
 */

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { FLOATING_FOOTER_SPREAD_PEER_CLASS } from '@/design-system/primitives/FloatingActionFooter';
import { ICON_ACTION_FLOOR_CELL_CLASS } from '@/design-system/primitives/IconActionFloor';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const ARM_MS = 3000;

type ControlledProps = {
  isArmed: boolean;
  isDeleting: boolean;
  onClick: () => void;
  onConfirm?: never;
  onDeleted?: never;
};

type UncontrolledProps = {
  isArmed?: never;
  isDeleting?: never;
  onClick?: never;
  onConfirm: () => Promise<void> | void;
  onDeleted?: () => void;
};

type InspectorFloorDeleteProps = {
  /** Idle tooltip / aria. */
  label?: string;
  /** Armed tooltip / aria. */
  confirmLabel?: string;
  disabled?: boolean;
  'data-testid'?: string;
} & (ControlledProps | UncontrolledProps);

export function InspectorFloorDelete(props: InspectorFloorDeleteProps) {
  const {
    label = 'Delete',
    confirmLabel = 'Click again to confirm delete',
    disabled = false,
    'data-testid': testId = 'inspector-floor-delete',
  } = props;

  const [localArmed, setLocalArmed] = useState(false);
  const [localDeleting, setLocalDeleting] = useState(false);
  const armTimeoutRef = useRef<number | null>(null);

  const isControlled = typeof props.onClick === 'function';
  const isArmed = isControlled ? props.isArmed : localArmed;
  const isDeleting = isControlled ? props.isDeleting : localDeleting;
  const isDisabled = disabled || isDeleting;

  useEffect(() => {
    return () => {
      if (armTimeoutRef.current) window.clearTimeout(armTimeoutRef.current);
    };
  }, []);

  const handleClick = async () => {
    if (isDisabled) return;

    if (isControlled) {
      props.onClick();
      return;
    }

    if (!localArmed) {
      setLocalArmed(true);
      if (armTimeoutRef.current) window.clearTimeout(armTimeoutRef.current);
      armTimeoutRef.current = window.setTimeout(() => {
        setLocalArmed(false);
      }, ARM_MS);
      return;
    }

    if (armTimeoutRef.current) {
      window.clearTimeout(armTimeoutRef.current);
      armTimeoutRef.current = null;
    }
    setLocalArmed(false);
    setLocalDeleting(true);
    try {
      await props.onConfirm();
      props.onDeleted?.();
    } catch {
      // Caller surfaces errors; skip onDeleted.
    } finally {
      setLocalDeleting(false);
    }
  };

  const tip = isDeleting
    ? 'Deleting…'
    : isArmed
      ? confirmLabel
      : label;

  return (
    <HoverTooltip asChild label={tip}>
      {/* ds-raw-button — trailing danger icon peer; IconButton has no danger tone */}
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={isDisabled}
        aria-label={isArmed ? confirmLabel : label}
        aria-pressed={isArmed || undefined}
        data-armed={isArmed ? 'true' : undefined}
        data-testid={testId}
        className={cn(
          'ds-raw-button',
          FLOATING_FOOTER_SPREAD_PEER_CLASS,
          ICON_ACTION_FLOOR_CELL_CLASS,
          focusRing('control', 'danger'),
          // Idle matches sibling icon peers. Danger ink only on hover, or
          // while armed for the second click (opaque red face + red ring).
          isArmed
            ? 'bg-red-50 text-red-700 ring-2 ring-red-600 hover:bg-red-100 hover:text-red-800'
            : 'hover:text-red-600 focus-visible:bg-red-50 focus-visible:text-red-600',
        )}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </HoverTooltip>
  );
}
