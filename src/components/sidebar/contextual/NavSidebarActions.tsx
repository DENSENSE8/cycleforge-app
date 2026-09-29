'use client';

import { useRouter } from 'next/navigation';
import type { NavAction } from '@/lib/nav/context/schema';
import { runNavIntent } from '@/lib/nav/intents';
import { useNavIntentAvailable } from '@/lib/nav/use-nav-intent';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { NAV_ACTION_ICONS } from './nav-view-icons';
import { NAV_BLOCK_CLASS } from './nav-block';

export function NavSidebarActions({ actions }: { actions: readonly NavAction[] }) {
  return (
    <section aria-label="Report actions" className="px-2 pt-2" data-nav-sidebar-actions>
      <div className="flex h-7 items-center px-2">
        <span role="separator" className="h-px min-w-0 flex-1 bg-border-hairline" />
      </div>
      <div className="flex flex-col gap-px">
        {actions.map((action) => <SidebarAction key={action.id} action={action} />)}
      </div>
    </section>
  );
}

function SidebarAction({ action }: { action: NavAction }) {
  const router = useRouter();
  const intentReady = useNavIntentAvailable(action.intent);
  const ready = Boolean(action.href || (action.intent && intentReady));
  const Glyph = NAV_ACTION_ICONS[action.id]?.icon;
  return (
    <button
      type="button"
      disabled={!ready}
      data-nav-action={action.id}
      onClick={() => {
        if (action.intent && runNavIntent(action.intent)) return;
        if (action.href) router.push(action.href);
      }}
      className={cn(
        NAV_BLOCK_CLASS,
        'h-8 text-role-caption font-medium disabled:pointer-events-none disabled:opacity-50',
        focusRing('control', 'accent'),
      )}
    >
      {Glyph ? <Glyph aria-hidden className="size-3.5 shrink-0 text-text-faint" /> : null}
      <span className="min-w-0 flex-1 truncate text-left">{action.label}</span>
    </button>
  );
}
