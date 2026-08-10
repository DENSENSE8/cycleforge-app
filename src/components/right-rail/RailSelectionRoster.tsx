'use client';

/**
 * Multi-select batch roster — condensed {@link StackedRowIdentity} rows inside
 * the right-rail selection plane (Order / Receiving / Repair batch shells).
 *
 * **Title wraps** (PoLineRow grammar) — never `truncate` / ellipsis on the
 * product subject. Typed CopyChip keys (order · PO · tracking · ticket · SKU)
 * sit on row 2 with platform-aware tooltip + `#` glyph tone. Never a
 * single-line `title | mono id` twin with `ml-auto`.
 *
 * Detail: `.claude/rules/source-of-truth.md` → Stacked row identity.
 */

import type { ReactNode } from 'react';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { cn } from '@/utils/_cn';

/** Title face for selection roster — wraps; never truncates. */
const RAIL_SELECTION_ROSTER_TITLE_CLASS =
  'min-w-0 w-full whitespace-normal break-words text-role-caption font-semibold leading-snug text-text-default';

export function RailSelectionRoster({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>
      <ul className="divide-y divide-border-soft" data-rail-selection-roster="">
        {children}
      </ul>
    </div>
  );
}

export function RailSelectionRosterRow({
  title,
  keys,
  className,
}: {
  /** Product / subject — **wraps** (never truncates). */
  title: ReactNode;
  /** Second-row typed keys — prefer CopyChip + `joinStackedIdentityKeys`. */
  keys?: ReactNode | null;
  className?: string;
}) {
  return (
    <li className={cn('px-4 py-1.5', className)} data-rail-selection-roster-row="">
      <StackedRowIdentity
        title={
          typeof title === 'string' || typeof title === 'number' ? (
            <span className={RAIL_SELECTION_ROSTER_TITLE_CLASS}>{title}</span>
          ) : (
            title
          )
        }
        keys={keys}
      />
    </li>
  );
}
