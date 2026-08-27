'use client';

import type { ReactNode } from 'react';
import { GRID_COLUMN_CHIP_VALUE_CLASS } from '@/design-system/components/grid';
import { cn } from '@/utils/_cn';

/** Wraps a cell's primary value when column display mode is `chip`. */
export function ReceivingChipValue({
  enabled,
  children,
  className,
}: {
  enabled: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!enabled) return <>{children}</>;
  return <span className={cn(GRID_COLUMN_CHIP_VALUE_CLASS, className)}>{children}</span>;
}
