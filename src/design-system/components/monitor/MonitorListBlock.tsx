'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export type MonitorListBlockProps = {
  children: ReactNode;
  className?: string;
  /** Optional header row above the divide-y list. */
  header?: ReactNode;
  /** `card` (default) draws the Monitor rollup's own shell. */
  chrome?: 'card' | 'flush';
};

/**
 * Leaderboard / recent-activity list inside a Monitor card.
 * Uses `divide-y` rows — house one-row anatomy (title → meta → chips), not nested cards.
 */
export function MonitorListBlock({
  children,
  className,
  header,
  chrome = 'card',
}: MonitorListBlockProps) {
  return (
    <div
      className={cn(
        chrome === 'card' && 'rounded-xl border border-border-soft bg-surface-card',
        className,
      )}
    >
      {header}
      <ul className="divide-y divide-border-hairline">{children}</ul>
    </div>
  );
}

export type MonitorListRowProps = {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  onClick?: () => void;
};

/** One row inside {@link MonitorListBlock} — title → meta → trailing chips. */
export function MonitorListRow({ title, meta, trailing, className, onClick }: MonitorListRowProps) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-role-caption font-semibold text-text-default">{title}</span>
        {meta != null ? (
          <span className="block truncate text-role-eyebrow font-semibold text-text-soft">
            {meta}
          </span>
        ) : null}
      </span>
      {trailing != null ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );

  if (onClick) {
    return (
      <li className={className}>
        <button
          type="button"
          onClick={onClick}
          className="ds-raw-button flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-hover"
        >
          {inner}
        </button>
      </li>
    );
  }

  return <li className={cn('flex items-center gap-2 px-3 py-1.5', className)}>{inner}</li>;
}
