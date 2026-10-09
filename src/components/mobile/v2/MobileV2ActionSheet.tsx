'use client';

/**
 * The V2 operational bottom sheet — the bottom-sheet action law
 * (docs/mobile-first/V2_ARCHITECTURE.md) as one frame, so a task-local sheet
 * (edit one line, pick a value, scan into a field) cannot drift from it:
 *   1. a non-sticky identity header (eyebrow · title · description);
 *   2. ONE scrolling body;
 *   3. an optional pinned input surface (a number pad) that never scrolls away;
 *   4. a non-sticky `DetailDock placement="sheet"` action floor — up to three
 *      secondary tools above one full-width primary verb at the safe-area edge.
 * A picker with no verbs (choosing a row IS the action) passes `verbs={[]}`.
 */

import type { ReactNode } from 'react';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export function MobileV2ActionSheet<Id extends string>({
  open,
  onClose,
  eyebrow,
  title,
  description,
  children,
  verbs,
  onVerb,
  dockLabel,
  testId,
  pinned,
}: {
  open: boolean;
  onClose: () => void;
  /** One quiet line above the title — what the sheet belongs to. */
  eyebrow?: ReactNode;
  title: string;
  /** Visible under the title when given; otherwise the title is read again for assistive tech. */
  description?: string;
  children: ReactNode;
  verbs: readonly DetailDockVerb<Id>[];
  onVerb: (id: Id) => void | Promise<unknown>;
  /** Accessible name of the action floor. */
  dockLabel: string;
  testId?: string;
  /** An input surface pinned under the scrolling body, above the action floor (a number pad under the thumb). */
  pinned?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl p-0" data-testid={testId}>
        <SheetHeader className="shrink-0 border-b border-border-soft bg-surface-card px-4 pb-3 pr-12 pt-4">
          {eyebrow ? <div className="text-xs font-semibold text-text-muted">{eyebrow}</div> : null}
          <SheetTitle className="line-clamp-2 text-left text-base">{title}</SheetTitle>
          <SheetDescription className={description ? 'text-left' : 'sr-only'}>{description ?? title}</SheetDescription>
        </SheetHeader>
        <div className={`min-h-0 flex-1 overscroll-contain overflow-y-auto ${verbs.length > 0 || pinned ? '' : 'pb-[max(1rem,env(safe-area-inset-bottom))]'}`}>
          {children}
        </div>
        {pinned ? <div className="shrink-0">{pinned}</div> : null}
        {/* Keyed by its label: a new step's floor is a new dock, so the last step's double-tap lock never eats its first tap. */}
        {verbs.length > 0 ? <DetailDock key={dockLabel} label={dockLabel} placement="sheet" verbs={verbs} onVerb={onVerb} /> : null}
      </SheetContent>
    </Sheet>
  );
}
