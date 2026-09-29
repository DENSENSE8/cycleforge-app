import type { ReactNode } from 'react';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { cn } from '@/utils/_cn';

/** One unmistakable heading voice for every record group and embedded subsection. */
export const RECORD_GROUP_TITLE_CLASS = 'min-w-0 truncate text-role-body font-medium text-mode-ink';

/**
 * One titled group of a desk record — Items, Fulfilment, Notes on the left;
 * Customer, Shipping, Price on the right (owner 2026-09-27, F-pattern). The
 * title sits top-left in a stronger section voice (write it in sentence case);
 * field labels below it keep the quieter label voice so hierarchy is visible;
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
  titleAccessory,
  action,
  testId,
  className,
  children,
}: {
  title: string;
  /** The body already says what the group is (one item's photo + title): the name stays for assistive tech only. */
  titleHidden?: boolean;
  /** A compact lens/breadcrumb immediately after the title, before the right-side action. */
  titleAccessory?: ReactNode;
  /** The group's single action (Edit, Photos …), top-right. */
  action?: ReactNode;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} data-testid={testId} className={cn(DESK_RECORD_COLUMN_CARD_CLASS, className)}>
      {titleHidden && !action ? null : (
        <header className="flex min-h-mode-hit flex-wrap items-center gap-2 px-4 pt-2">
          <h3 className={cn(RECORD_GROUP_TITLE_CLASS, titleAccessory ? 'shrink-0' : 'flex-1', titleHidden && 'sr-only')}>{title}</h3>
          {titleAccessory ? <div className="min-w-0 flex-1">{titleAccessory}</div> : null}
          {action ? (
            <div className="order-3 ml-auto flex w-full min-w-0 items-center justify-end @xs:order-none @xs:w-auto @xs:shrink-0">
              {action}
            </div>
          ) : null}
        </header>
      )}
      {children}
    </section>
  );
}
