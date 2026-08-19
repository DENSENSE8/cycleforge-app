'use client';

/**
 * Flush trailing Delete for Workbench inspector action floors.
 *
 * Icon-only, transparent, hairline leading edge — Orders golden
 * (`OrderUpdateDock`). Two-click arm via tooltip. Controlled (Orders) or
 * self-armed (`onConfirm` / `onDeleted` for Incoming-family).
 */

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const FLUSH = cornerClass('flush');

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

type InspectorFlushDeleteProps = {
  /** Idle tooltip / aria. */
  label?: string;
  /** Armed tooltip / aria. */
  confirmLabel?: string;
  disabled?: boolean;
  'data-testid'?: string;
  className?: string;
} & (ControlledProps | UncontrolledProps);

export function InspectorFlushDelete(props: InspectorFlushDeleteProps) {
  const {
    label = 'Delete',
    confirmLabel = 'Click again to confirm delete',
    disabled = false,
    'data-testid': testId = 'inspector-flush-delete',
    className,
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
      {/* ds-raw-button — flush trailing danger icon; IconButton has no danger tone */}
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
          FLUSH,
          focusRing('control', 'danger'),
          'flex h-10 w-10 shrink-0 items-center justify-center border-l border-border-hairline bg-transparent p-0',
          // Idle matches sibling Macro glyphs (`text-text-soft`). Danger ink
          // only on hover, or while armed for the second click.
          isArmed
            ? 'bg-red-50 text-red-700 shadow-[inset_0_-2px_0_0_currentColor] hover:bg-red-100 hover:text-red-800'
            : 'text-text-soft hover:bg-surface-hover hover:text-red-600 focus-visible:bg-red-50 focus-visible:text-red-600',
          'disabled:opacity-40',
          className,
        )}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </HoverTooltip>
  );
}
