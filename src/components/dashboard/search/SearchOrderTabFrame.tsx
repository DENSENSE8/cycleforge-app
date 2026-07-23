'use client';

/**
 * Uniform chrome for every Search order-detail tab body — Shopify order-detail
 * feel: bordered `Panel` cards inside the shell's single padded scroll lane (the
 * shell owns width + padding + scroll; tab bodies are dumb content). No left
 * summary sidebar; facts read in a responsive two-column grid inside each card.
 * Every section tab composes these; none invent a shell.
 */

import type { ReactNode } from 'react';
import { isSearchOrderFactEmpty } from '@/components/dashboard/search/search-order-overview-presence';
import { Panel } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

/** Label-above-value fact cell — sits in a `SearchOrderFactList` grid. */
export function SearchOrderFactRow({
  label,
  value,
  mono,
  span,
  omitWhenEmpty = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  /** Force the cell to span the full grid width (long values like tracking). */
  span?: boolean;
  /**
   * Overview / presence-driven surfaces: skip the cell entirely when empty.
   * Deep tabs keep the default (em dash) so the full schema still teaches.
   */
  omitWhenEmpty?: boolean;
}) {
  const empty = isSearchOrderFactEmpty(value);
  if (omitWhenEmpty && empty) return null;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', span && 'sm:col-span-2')}>
      <dt className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
        {label}
      </dt>
      <dd
        className={cn(
          'break-words text-role-caption font-medium text-text-default',
          mono && 'font-mono tabular-nums',
          empty && 'text-text-faint',
        )}
      >
        {empty ? '—' : value}
      </dd>
    </div>
  );
}

/**
 * Fact grid — Shopify metadata layout. `cols=2` (default) is the responsive
 * two-up for wide cards; `cols=1` keeps a single column for narrow side-rail
 * cards where a viewport-driven `sm:grid-cols-2` would cramp.
 */
export function SearchOrderFactList({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 1 | 2;
}) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-8 gap-y-4', cols === 2 && 'sm:grid-cols-2')}>
      {children}
    </dl>
  );
}

/**
 * A titled card grouping — composes the canonical `Panel` shell; never
 * hand-rolls `rounded-2xl border …`. Header (title + optional description +
 * actions) sits above the body.
 */
export function SearchOrderCard({
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
    <Panel padding="lg" className={cn('stack-section', className)}>
      {hasHeader ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-role-body font-bold text-text-default">{title}</h3>
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

/**
 * Single-card tab body: one left-aligned card (readable width) with a title
 * header and a fact list (or a teaching empty state). Deep tabs (Shipping /
 * Product / …) compose this; the shell's lane owns padding + scroll.
 */
export function SearchOrderTabFrame({
  title,
  description,
  children,
  empty,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  /** When true, render the empty copy instead of children. */
  empty?: { title: string; body?: string };
}) {
  return (
    <div className="max-w-3xl">
      <SearchOrderCard title={title} description={description}>
        {empty ? (
          <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center">
            <p className="text-role-caption font-semibold text-text-muted">{empty.title}</p>
            {empty.body ? (
              <p className="mt-1 text-role-micro font-medium text-text-faint">{empty.body}</p>
            ) : null}
          </div>
        ) : (
          children
        )}
      </SearchOrderCard>
    </div>
  );
}
