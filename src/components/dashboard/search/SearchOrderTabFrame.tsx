'use client';

/**
 * Uniform chrome for every Search order-detail tab body — title band + scroll
 * region + empty state. All section tabs compose this; none invent their own shell.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export function SearchOrderFactRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  const empty = value == null || value === '';
  return (
    <div className="flex flex-col gap-0.5 border-b border-border-hairline py-2.5 last:border-b-0">
      <dt className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
        {label}
      </dt>
      <dd
        className={cn(
          'text-role-caption font-medium text-text-default',
          mono && 'font-mono tabular-nums',
          empty && 'text-text-faint',
        )}
      >
        {empty ? '—' : value}
      </dd>
    </div>
  );
}

export function SearchOrderFactList({ children }: { children: ReactNode }) {
  return <dl className="min-w-0">{children}</dl>;
}

export function SearchOrderTabFrame({
  title,
  description,
  children,
  empty,
  className,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  /** When true, render the empty copy instead of children. */
  empty?: { title: string; body?: string };
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="shrink-0 border-b border-border-hairline px-4 py-3">
        <h3 className="text-role-caption font-bold text-text-default">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-role-micro font-medium text-text-muted">{description}</p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {empty ? (
          <div className="rounded-lg border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center">
            <p className="text-role-caption font-semibold text-text-muted">{empty.title}</p>
            {empty.body ? (
              <p className="mt-1 text-role-micro font-medium text-text-faint">{empty.body}</p>
            ) : null}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
