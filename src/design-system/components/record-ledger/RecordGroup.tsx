import type { ReactNode } from 'react';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';

/**
 * One titled group of a desk record — Items, Fulfilment, Notes on the left;
 * Customer, Shipping, Price on the right (owner 2026-09-27, F-pattern). The
 * title sits top-left in the region's label voice (write it in sentence case);
 * at most ONE action sits top-right — a group with a header action carries no
 * per-row pencils of its own.
 *
 * Two looks, one component: triage lifts each group as its own rounded card;
 * industrial (the Floor rail) drops the card and runs the group edge to edge,
 * closed by one hairline (`DESK_RECORD_COLUMN_CARD_CLASS`).
 */
export function RecordGroup({
  title,
  titleHidden = false,
  action,
  testId,
  className,
  children,
}: {
  title: string;
  /** The body already says what the group is (one item's photo + title): the name stays for assistive tech only. */
  titleHidden?: boolean;
  /** The group's single action (Edit, Photos …), top-right. */
  action?: ReactNode;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} data-testid={testId} className={cn(DESK_RECORD_COLUMN_CARD_CLASS, className)}>
      {titleHidden && !action ? null : (
        <header className="flex min-h-mode-hit items-center gap-2 px-4 pt-2">
          <h3 className={cn(RECORD_LABEL_CLASS, 'min-w-0 flex-1 truncate text-mode-muted', titleHidden && 'sr-only')}>{title}</h3>
          {action ? <div className="ml-auto flex shrink-0 items-center">{action}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}
