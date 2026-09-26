'use client';

/** Order-record card vocabulary — shared fact atoms for the durable `/o/[orderId]` record (and siblings that compose the same atoms without… */

import type { ReactNode } from 'react';
import { isSearchOrderFactEmpty } from '@/components/order-record/order-fact-presence';
import { Panel } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

/** Label-above-value fact cell — sits in an `OrderFactList` grid. */
export function OrderFactRow({
  label,
  value,
  mono,
  span,
  omitWhenEmpty = false,
  preserveLines = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  /** Force the cell to span the full grid width (long values like tracking). */
  span?: boolean;
  /**
   * Presence-driven surfaces: skip the cell entirely when empty. Deep/schema
   * surfaces keep the default (em dash) so the full field set still teaches.
   */
  omitWhenEmpty?: boolean;
  /** Keep the value's own newlines (`whitespace-pre-line`) — free text an operator or a buyer typed, where the line breaks carry meaning. */
  preserveLines?: boolean;
}) {
  const empty = isSearchOrderFactEmpty(value);
  if (omitWhenEmpty && empty) return null;
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', span && 'sm:col-span-2')}>
      <dt className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
        {label}
      </dt>
      <dd
        className={cn(
          'break-words text-role-caption font-medium text-text-default',
          mono && 'font-mono tabular-nums',
          preserveLines && 'whitespace-pre-line',
          empty && 'text-text-faint',
        )}
      >
        {empty ? '—' : value}
      </dd>
    </div>
  );
}

/**
 * Fact grid. `cols=2` (default) is the responsive two-up for wide cards;
 * `cols=1` keeps a single column for narrow rail cards where a viewport-driven
 * `sm:grid-cols-2` would cramp.
 */
export function OrderFactList({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 1 | 2;
}) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-2.5', cols === 2 && 'sm:grid-cols-2')}>
      {children}
    </dl>
  );
}

/** A titled card grouping — header (title + optional description + actions) above the body. */
export function OrderRecordCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <Panel padding="sm" className={cn('stack-tight', className)}>
      {hasHeader ? (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-role-caption font-semibold text-text-default">{title}</h3>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-role-micro font-medium text-text-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Panel>
  );
}
