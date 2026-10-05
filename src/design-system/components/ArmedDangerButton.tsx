'use client';

/** Canonical two-press destructive CTA. The first press arms; the second commits. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from '@/design-system/primitives/Button';
import { cn } from '@/utils/_cn';

const DEFAULT_ARM_MS = 3_000;

interface ArmedDangerButtonProps
  extends Omit<ButtonProps, 'children' | 'onClick' | 'variant' | 'loading'> {
  label: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  armMs?: number;
  /**
   * Paint only the supplied icon at rest, then expand to `confirmLabel` after
   * the first press. Use for compact row/header danger actions where the icon,
   * accessible label and tooltip disclose the verb without repeating "Delete"
   * down an entire list.
   */
  iconOnlyUntilArmed?: boolean;
}

export function ArmedDangerButton({
  label,
  confirmLabel,
  onConfirm,
  loading = false,
  disabled = false,
  armMs = DEFAULT_ARM_MS,
  iconOnlyUntilArmed = false,
  ...buttonProps
}: ArmedDangerButtonProps) {
  const [armed, setArmed] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const disarm = () => {
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setArmed(false);
  };

  useEffect(() => () => {
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current);
  }, []);

  const handleClick = () => {
    if (disabled || loading) return;
    if (!armed) {
      setArmed(true);
      timeoutRef.current = window.setTimeout(disarm, armMs);
      return;
    }
    disarm();
    void onConfirm();
  };

  const displayedLabel = armed ? confirmLabel : label;
  const accessibleLabel = typeof displayedLabel === 'string' ? displayedLabel : buttonProps.ariaLabel;

  return (
    <Button
      {...buttonProps}
      variant={iconOnlyUntilArmed && !armed ? 'ghost' : 'danger'}
      loading={loading}
      disabled={disabled}
      ariaLabel={accessibleLabel}
      aria-pressed={armed || undefined}
      data-armed={armed ? 'true' : undefined}
      onClick={handleClick}
      className={cn(
        iconOnlyUntilArmed && !armed && 'w-8 px-0 text-text-soft hover:bg-red-50 hover:text-red-600',
        buttonProps.className,
      )}
    >
      {iconOnlyUntilArmed && !armed ? <span className="sr-only">{label}</span> : displayedLabel}
    </Button>
  );
}
