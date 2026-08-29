'use client';

/**
 * Today chrome **Add** — opens the Watch right rail (`?watch=1`).
 *
 * The rail owns ticket + tracking intake; this CTA is only the door.
 */

import { Plus } from '@/components/Icons';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';

export function MyDayWatchTicketAction({ onOpen }: { onOpen: () => void }) {
  const { user, has } = useAuth();
  const canWatch =
    user?.staffId != null &&
    (has('integrations.zendesk') || has('home.subscriptions.manage'));

  if (!canWatch) return null;

  return (
    <button
      type="button"
      aria-label="Watch a ticket or tracking number"
      onClick={onOpen}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 bg-emerald-600 px-3 text-white shadow-sm shadow-emerald-600/25 transition-colors hover:bg-emerald-500 active:scale-95 active:bg-emerald-700',
        PRIMARY_CHROME_ROW_FACE,
        cornerClass('flush'),
        'font-semibold uppercase tracking-widest',
      )}
    >
      <Plus className="h-3.5 w-3.5" />
      <span className="text-role-eyebrow uppercase tracking-widest text-white">Add</span>
    </button>
  );
}
