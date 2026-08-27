'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export type FilterBandProps = {
  children: ReactNode;
  className?: string;
  /** Optional left cluster (title / range label). */
  leading?: ReactNode;
};

/**
 * Ephemeral Monitor filter row. State must live in URL search params
 * (`?range= ?q= ?station= ?section= ?ostatus=`), never durable selection ids.
 */
export function FilterBand({ children, className, leading }: FilterBandProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      {leading ? <div className="min-w-0">{leading}</div> : null}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
