'use client';

/**
 * One intake section — a `rounded-mode` card that shows its fields while it is
 * being worked, and a one-line summary once it is filled and the operator has
 * moved on (progressive disclosure). A click on the summary opens it again.
 */

import type { ReactNode } from 'react';
import { Check, ChevronDown } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function IntakeSection({
  id,
  title,
  summary,
  complete,
  open,
  onOpen,
  onDone,
  aside,
  children,
}: {
  id: string;
  title: string;
  /** The filled section in one line — shown when collapsed. */
  summary: ReactNode;
  complete: boolean;
  open: boolean;
  onOpen: () => void;
  /** Collapse a complete section (the header's Done). */
  onDone?: () => void;
  /** Header-right slot while open (a section's own secondary action). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={`intake-section-${id}`}
      data-state={open ? 'open' : 'collapsed'}
      className="rounded-mode border border-border-hairline bg-surface-card"
    >
      {open ? (
        <>
          <header className="flex items-center gap-2 px-4 pb-1 pt-3">
            <h3 className="min-w-0 flex-1 text-role-body font-semibold text-text-default">{title}</h3>
            {aside}
            {complete && onDone ? (
              <Button variant="ghost" size="sm" onClick={onDone} data-testid={`intake-section-${id}-done`}>
                Done
              </Button>
            ) : null}
          </header>
          <div className="space-y-3 px-4 pb-4 pt-2">{children}</div>
        </>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={false}
          className={cn('flex w-full items-center gap-3 rounded-mode px-4 py-3 text-left hover:bg-surface-hover', focusRing('control'))}
          data-testid={`intake-section-${id}-summary`}
        >
          <span
            aria-hidden
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-mode-pill',
              complete ? 'bg-surface-success text-text-success' : 'bg-surface-sunken text-text-faint',
            )}
          >
            {complete ? <Check className="size-3" /> : null}
          </span>
          <span className="w-20 shrink-0 text-role-body font-semibold text-text-default">{title}</span>
          <span className="min-w-0 flex-1 truncate text-role-caption text-text-muted">{summary}</span>
          <ChevronDown className="size-4 shrink-0 text-text-faint" aria-hidden />
        </button>
      )}
    </section>
  );
}
