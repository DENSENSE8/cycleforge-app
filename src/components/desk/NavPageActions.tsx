'use client';

import { useRouter } from 'next/navigation';
import type { NavAction } from '@/lib/nav/context/schema';
import { runNavIntent } from '@/lib/nav/intents';
import { useNavIntentAvailable } from '@/lib/nav/use-nav-intent';
import { DeskActionSlotRegistrar } from '@/design-system/components/DeskActionSlot';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';
import { ChevronDown, RefreshCw } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

const SEGMENT_CLASS = cn(
  'ds-raw-button inline-flex h-8 items-center gap-1.5 text-role-caption font-semibold',
  'transition-[background-color,transform] duration-100 active:translate-y-px',
  'disabled:pointer-events-none disabled:opacity-60',
  focusRing('control', 'accent'),
);

/**
 * `NavContext.actions` as the desk header's split CTA, top-right over the list
 * it acts on (operator 2026-09-27: the verbs left the sidebar). The first
 * action is the face — `[↻] Sync ShipStation`, no keycap (operator
 * 2026-09-27) — then a hairline and a chevron that opens the rest. An `href`
 * action navigates; an `intent` action runs the handler the mounted page body
 * registered (`useNavIntent`) and stays disabled until one exists.
 */
export function NavPageActions({ actions }: { actions: readonly NavAction[] | undefined }) {
  const [primary, ...rest] = actions ?? [];
  if (!primary) return null;
  return (
    <DeskActionSlotRegistrar>
      <div
        data-nav-page-actions
        className={cn('inline-flex items-stretch overflow-hidden', BUTTON_VARIANTS.primary, cornerClass('pill'))}
      >
        <PrimaryAction action={primary} />
        {rest.length > 0 ? (
          <>
            <span aria-hidden className="w-px shrink-0 self-stretch bg-white/30" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-nav-page-actions-more
                  aria-label="More actions"
                  className={cn(SEGMENT_CLASS, 'w-8 justify-center pr-0.5 hover:bg-white/10')}
                >
                  <ChevronDown aria-hidden className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom" className="w-60">
                {rest.map((action) => (
                  <ActionItem key={action.id} action={action} />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </div>
    </DeskActionSlotRegistrar>
  );
}

function useRunAction(action: NavAction) {
  const router = useRouter();
  const intentReady = useNavIntentAvailable(action.intent);
  const disabled = action.href === undefined && !intentReady;
  const run = () => {
    if (action.intent && runNavIntent(action.intent)) return;
    if (action.href) router.push(action.href);
  };
  return { disabled, run };
}

function PrimaryAction({ action }: { action: NavAction }) {
  const { disabled, run } = useRunAction(action);
  return (
    <button
      type="button"
      data-nav-page-action-primary
      disabled={disabled}
      onClick={run}
      className={cn(SEGMENT_CLASS, 'pl-3 pr-3 hover:bg-white/10')}
    >
      <RefreshCw aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{action.label}</span>
    </button>
  );
}

function ActionItem({ action }: { action: NavAction }) {
  const { disabled, run } = useRunAction(action);
  return (
    <DropdownMenuItem disabled={disabled} onSelect={run}>
      {action.label}
    </DropdownMenuItem>
  );
}
