'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { MONITOR_SECTION_CARD_PADDED } from '@/design-system/components/monitor';

/**
 * The lifted "bubble" surface used for the full-page order view's sections — a
 * rounded, softly-elevated card (`bg-surface-card` floating above the
 * `bg-surface-canvas` page) matching the Shopify/Stripe order-page idiom.
 *
 * Shell SoT is the design-system Monitor block (`MONITOR_SECTION_CARD_PADDED`).
 * Prefer importing from `@/design-system/components/monitor` for new Monitor pages.
 */

/** Alias of design-system shell — prefer `MONITOR_SECTION_CARD_PADDED` for new code. */
export const SECTION_CARD_CLASS = MONITOR_SECTION_CARD_PADDED;

export function SectionCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  // Plain children-only shell (Workbench detail cards). Monitor pages with
  // eyebrow/title should use Monitor `SectionCard` directly.
  return <div className={cn(SECTION_CARD_CLASS, className)}>{children}</div>;
}
