'use client';

/** Canonical two-press destructive CTA. The first press arms; the second commits. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from '@/design-system/primitives/Button';

const DEFAULT_ARM_MS = 3_000;

interface ArmedDangerButtonProps
  extends Omit<ButtonProps, 'children' | 'onClick' | 'variant' | 'loading'> {
  label: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  armMs?: number;
}

export function ArmedDangerButton({
  label,
  confirmLabel,
  onConfirm,
  loading = false,
  disabled = false,
  armMs = DEFAULT_ARM_MS,
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

  return (
    <Button
      {...buttonProps}
      variant="danger"
      loading={loading}
      disabled={disabled}
      aria-pressed={armed || undefined}
      data-armed={armed ? 'true' : undefined}
      onClick={handleClick}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}
