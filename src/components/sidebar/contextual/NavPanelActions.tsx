'use client';

import { useRouter } from 'next/navigation';
import type { NavAction } from '@/lib/nav/context/schema';
import { runNavIntent } from '@/lib/nav/intents';
import { useNavIntentAvailable } from '@/lib/nav/use-nav-intent';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { KeyboardKey } from '@/design-system/primitives';
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
 * Progressive disclosure: the verb's chord (`action.hotkey`, bound by the
 * page body) shows as keycaps only while the button is hovered or focused,
 * HOTKEY FIRST — keycaps, then the glyph. An `href` verb navigates; an
 * `intent` verb runs the page body's handler and stays disabled until one is
 * registered — the `NavPageActions` contract.
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
    <button
      type="button"
      data-nav-action={action.id}
      aria-label={action.label}
      aria-keyshortcuts={keys.length > 0 ? keys.join('+') : undefined}
      title={action.label}
      disabled={!ready}
      onClick={() => {
        if (action.intent && runNavIntent(action.intent)) return;
        if (action.href) router.push(action.href);
      }}
      className={cn(
        'ds-raw-button group/verb flex h-6 shrink-0 items-center gap-1 px-1 text-text-muted',
        'transition-[background-color,color,transform] hover:bg-surface-card hover:text-text-default hover:ring-1 hover:ring-border-soft',
        'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
        SIDEBAR_CONTROL_CORNER,
        focusRing('control', 'accent'),
      )}
    >
      {keys.length > 0 ? (
        <span
          aria-hidden
          data-nav-action-keys
          className={cn(
            '-mr-1 inline-flex max-w-0 items-center gap-0.5 overflow-hidden opacity-0 transition-[max-width,opacity,margin] duration-150',
            'group-hover/verb:mr-0 group-hover/verb:max-w-24 group-hover/verb:opacity-100',
            'group-focus-visible/verb:mr-0 group-focus-visible/verb:max-w-24 group-focus-visible/verb:opacity-100',
          )}
        >
          {keys.map((key) => (
            <KeyboardKey key={key} size="xs">
              {key}
            </KeyboardKey>
          ))}
        </span>
      ) : null}
      {glyph ? (
        <glyph.icon className={navIconStrokeClass(cn('size-4', glyph.tone))} />
      ) : (
        <span className="text-role-caption">{action.label}</span>
      )}
    </button>
  );
}
