'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import Link from 'next/link';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/**
 * V2 list feedback keeps the record readable while it is pressed. The old
 * mobile ledger inverted the full row to ink, which produced a black flash.
 */
export const MOBILE_DATA_LIST_ROW_INTERACTION_CLASS =
  'transition-colors duration-150 ease-out hover:bg-surface-hover active:bg-surface-selected';

/**
 * A full-row navigation target for mobile directories and settings. Not a
 * record face: a record (order, PO, carton, line) is a MobileRecordCard
 * (owner 2026-10-03).
 */
export function MobileDataListRow({
  href,
  ariaLabel,
  children,
  className,
  testId,
  ariaCurrent,
  onClick,
}: {
  href: string;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  testId?: string;
  ariaCurrent?: 'page';
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'group block min-h-mode-hit-cta w-full bg-surface-card text-text-default',
        MOBILE_DATA_LIST_ROW_INTERACTION_CLASS,
        focusRing('cell'),
        className,
      )}
    >
      {children}
    </Link>
  );
}
