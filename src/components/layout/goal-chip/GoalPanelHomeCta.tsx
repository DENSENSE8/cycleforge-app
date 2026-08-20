'use client';

/**
 * The pace-and-next panel's foot: **one door, to Home**.
 *
 * The panel previews what is next and how today is pacing; until now every exit
 * from it was the work order's own record, or nothing. This is the one control
 * that takes the operator to `/` — Home → Daily, the full surface for the shift
 * list and the day's report.
 *
 * ## It is a door, not a second Home
 *
 * Home is one route. This navigates there; it never mounts a mini-Home inside a
 * 290px popover, and it does not read `daily_check_items`. The panel's own rows
 * stay on `staff_todos` (personal, per-station) — the two checklist stores are
 * siblings answering different questions and neither writes the other.
 *
 * A `Link` rather than `<Button>` because the job is navigation: middle-click,
 * prefetch, and a real `href` all matter here. It wears `focusRing` and the
 * house tokens exactly as `NextWorkOrderRow` does — no page-local hue or radius.
 */

import Link from 'next/link';
import { Home, ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

export function GoalPanelHomeCta({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="border-t border-border-hairline">
      <Link
        href="/"
        onClick={onNavigate}
        className={cn(
          'group flex w-full items-center gap-2 rounded-none px-3.5 py-2.5 transition-colors hover:bg-surface-hover',
          focusRing('control', 'accent'),
        )}
      >
        <Home className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
          Open Home
        </span>
        <span className="shrink-0 text-role-micro uppercase tracking-widest text-text-soft">
          Daily
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" />
      </Link>
    </div>
  );
}
