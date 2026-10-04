'use client';

import { useRouter } from 'next/navigation';
import type { NavAction } from '@/lib/nav/context/schema';
import { runNavIntent } from '@/lib/nav/intents';
import { useNavIntentAvailable } from '@/lib/nav/use-nav-intent';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { cn } from '@/utils/_cn';
import { NAV_ACTION_ICONS } from './nav-view-icons';

/**
 * A VIEW-LESS page panel's verbs (Chat's New chat), riding the right end of
 * the `‹ <Page>` back row as glyph buttons. Such a page's list IS the
 * sidebar, so there is no desk header over it to carry them; every page with
 * views keeps its verbs in the header (`NavPageActions`).
 *
 * The verb's chord (`action.hotkey`, bound by the page body) is never painted
 * on the button: it rides the hover/focus tooltip beside the verb's name. An
 * `href` verb navigates; an `intent` verb runs the page body's handler and
 * stays disabled until one is registered — the `NavPageActions` contract.
 */
export function NavPanelActions({ actions }: { actions: readonly NavAction[] }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {actions.map((action) => (
        <PanelVerb key={action.id} action={action} />
      ))}
    </span>
  );
}

function PanelVerb({ action }: { action: NavAction }) {
  const router = useRouter();
  const apple = useApplePlatform();
  const intentReady = useNavIntentAvailable(action.intent);
  const glyph = NAV_ACTION_ICONS[action.id];
  const keys = action.hotkey ? chordKeys(action.hotkey, apple) : [];
  const ready = (action.intent !== undefined && intentReady) || action.href !== undefined;
  return (
    <HoverTooltip label={action.label} shortcut={keys.length > 0 ? keys.join(' + ') : undefined} asChild>
      <button
        type="button"
        data-nav-action={action.id}
        aria-label={action.label}
        aria-keyshortcuts={keys.length > 0 ? keys.join('+') : undefined}
        disabled={!ready}
        onClick={() => {
          if (action.intent && runNavIntent(action.intent)) return;
          if (action.href) router.push(action.href);
        }}
        className={cn(
          'ds-raw-button flex h-6 shrink-0 items-center gap-1 px-1 text-text-muted',
          'transition-[background-color,color,transform] hover:bg-surface-card hover:text-text-default hover:ring-1 hover:ring-border-soft',
          'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
          SIDEBAR_CONTROL_CORNER,
          focusRing('control', 'accent'),
        )}
      >
        {glyph ? (
          <glyph.icon className={navIconStrokeClass(cn('size-4', glyph.tone))} />
        ) : (
          <span className="text-role-caption">{action.label}</span>
        )}
      </button>
    </HoverTooltip>
  );
}
