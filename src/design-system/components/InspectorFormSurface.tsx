'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

/**
 * Shared record-form surface for non-modal desk overlays and rails.
 *
 * This owns only the inspector geometry: fixed header/footer bands and one
 * scrollport for the record body. It intentionally knows nothing about triage,
 * receiving, exceptions, or any domain fields, so every desk can compose the
 * same surface without inventing another overlay layout.
 */
export function InspectorFormSurface({
  children,
  header,
  footer,
  className,
  bodyClassName,
  testId,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-surface-card', className)}
      data-testid={testId}
    >
      {header ? <div className="shrink-0">{header}</div> : null}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
      {footer ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}
